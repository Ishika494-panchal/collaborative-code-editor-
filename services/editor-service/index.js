const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Y = require('yjs');

const connectDB = require('../../shared/db');
const verifyToken = require('../../shared/authMiddleware');
const Room = require('../../shared/models/Room');
const { pubClient, subClient } = require('./redisConfig');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true
  }
});

const mongoose = require('mongoose');

const PORT = process.env.EDITOR_PORT || 3002;

// Connect to MongoDB
if (process.env.MONGO_URI) {
  connectDB(process.env.MONGO_URI);
} else {
  console.warn("MONGO_URI not set, skipping DB connection.");
}

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:4200', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// --- In-Memory Room Database Fallback ---
const inMemoryRooms = new Map();

async function getRoomFromDbOrMemory(roomId) {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const room = await Room.findOne({ roomId });
      if (room) {
        // Cache/Sync to memory
        inMemoryRooms.set(roomId, room);
        return room;
      }
    }
  } catch (err) {
    console.warn(`⚠️ DB error fetching room ${roomId}, using memory:`, err.message);
  }
  return inMemoryRooms.get(roomId);
}

async function createRoomInDbOrMemory(roomId, userId) {
  const roomData = {
    roomId,
    ownerId: userId,
    participants: [userId],
    code: '',
    language: 'javascript',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  inMemoryRooms.set(roomId, roomData);

  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const newRoom = new Room(roomData);
      await newRoom.save();
      return newRoom;
    }
  } catch (err) {
    console.warn(`⚠️ DB error saving new room, running in memory-only:`, err.message);
  }
  return roomData;
}

async function updateRoomCodeInDbOrMemory(roomId, code) {
  const room = inMemoryRooms.get(roomId);
  if (room) {
    room.code = code;
    room.updatedAt = new Date();
  }
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await Room.updateOne({ roomId }, { code, updatedAt: Date.now() });
    }
  } catch (err) {
    console.warn(`⚠️ DB error updating room ${roomId} code:`, err.message);
  }
}

// --- REST APIs ---
app.post('/api/rooms', async (req, res) => {
  try {
    const roomId = uuidv4();
    const userId = (req.user && req.user.id) || 'anonymous';
    const room = await createRoomInDbOrMemory(roomId, userId);
    res.status(201).json({ 
      roomId, 
      shareableUrl: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/rooms/${roomId}` 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:id', async (req, res) => {
  try {
    const room = await getRoomFromDbOrMemory(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// --- In-Memory State for CRDT and Presence ---
const roomDocs = new Map(); // roomId -> Y.Doc
const roomUsers = new Map(); // roomId -> Map<socketId, userObject>

// --- Step 14: Auto-save Snapshots ---
setInterval(async () => {
  for (const [roomId, ydoc] of roomDocs.entries()) {
    const text = ydoc.getText('monaco').toString();
    await updateRoomCodeInDbOrMemory(roomId, text);
  }
}, 30000); // 30 seconds

// --- WebSockets ---
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', async ({ roomId, user }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    
    if (!roomDocs.has(roomId)) {
      const ydoc = new Y.Doc();
      try {
        const room = await getRoomFromDbOrMemory(roomId);
        if (room && room.code) {
          ydoc.getText('monaco').insert(0, room.code);
        }
      } catch (err) { }
      roomDocs.set(roomId, ydoc);
    }
    
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Map());
    }
    
    // Assign random color if not provided
    const color = user?.color || '#' + Math.floor(Math.random()*16777215).toString(16);
    const userData = { ...user, id: socket.id, color, name: user?.name || `User-${socket.id.substring(0,4)}` };
    
    roomUsers.get(roomId).set(socket.id, userData);

    // Send full CRDT state to the joined user immediately
    const doc = roomDocs.get(roomId);
    const stateVector = Y.encodeStateAsUpdate(doc);
    socket.emit('crdt-sync', Buffer.from(stateVector).toString('base64'));
    
    // Broadcast updated users list
    const usersArray = Array.from(roomUsers.get(roomId).values());
    // Direct broadcast (works without Redis)
    io.to(roomId).emit('room-users', usersArray);
    // Also via Redis for multi-instance
    pubClient.publish(`room:${roomId}`, JSON.stringify({
      type: 'users-update',
      users: usersArray
    }));
  });

  socket.on('leave-room', (roomId) => {
    handleLeave(socket, roomId);
  });

  socket.on('crdt-update', ({ roomId, updateBase64 }) => {
    // Apply locally for auto-save
    const doc = roomDocs.get(roomId);
    if (doc) {
      try {
        const update = Buffer.from(updateBase64, 'base64');
        Y.applyUpdate(doc, update);
      } catch(e) {}
    }
    
    // Broadcast directly via Socket.IO (works without Redis)
    socket.to(roomId).emit('crdt-update', { senderId: socket.id, updateBase64 });

    // Also publish via Redis for multi-instance scaling
    pubClient.publish(`room:${roomId}`, JSON.stringify({ 
      type: 'crdt-update', 
      senderId: socket.id, 
      update: updateBase64 
    }));
  });

  socket.on('cursor-move', ({ roomId, position }) => {
    // Broadcast directly
    socket.to(roomId).emit('cursor-update', { senderId: socket.id, position });
    // Also via Redis
    pubClient.publish(`room:${roomId}`, JSON.stringify({
      type: 'cursor-update',
      senderId: socket.id,
      position
    }));
  });

  socket.on('language-change', ({ roomId, language }) => {
    socket.to(roomId).emit('language-change', { senderId: socket.id, language });
    pubClient.publish(`room:${roomId}`, JSON.stringify({
      type: 'language-update',
      senderId: socket.id,
      language
    }));
  });

  socket.on('execution-output', ({ roomId, output }) => {
    socket.to(roomId).emit('execution-output', { senderId: socket.id, output });
    pubClient.publish(`room:${roomId}`, JSON.stringify({
      type: 'output-update',
      senderId: socket.id,
      output
    }));
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      handleLeave(socket, socket.roomId);
    }
  });
});

function handleLeave(socket, roomId) {
  socket.leave(roomId);
  const usersMap = roomUsers.get(roomId);
  if (usersMap) {
    usersMap.delete(socket.id);
    const usersArray = Array.from(usersMap.values());
    // Direct broadcast
    io.to(roomId).emit('room-users', usersArray);
    // Also via Redis
    pubClient.publish(`room:${roomId}`, JSON.stringify({
      type: 'users-update',
      users: usersArray
    }));
    
    // Cleanup if empty
    if (usersMap.size === 0) {
      roomUsers.delete(roomId);
      roomDocs.delete(roomId); 
    }
  }
}

// --- Redis Pub/Sub Subscriber ---
if (subClient && typeof subClient.on === 'function') {
  subClient.on('ready', () => {
    subClient.psubscribe('room:*');
  });
}

subClient.on('pmessage', (pattern, channel, message) => {
  const roomId = channel.split(':')[1];
  const payload = JSON.parse(message);

  if (payload.type === 'crdt-update') {
    io.to(roomId).emit('crdt-update', { senderId: payload.senderId, updateBase64: payload.update });
  } else if (payload.type === 'cursor-update') {
    io.to(roomId).emit('cursor-update', { senderId: payload.senderId, position: payload.position });
  } else if (payload.type === 'users-update') {
    io.to(roomId).emit('room-users', payload.users);
  } else if (payload.type === 'language-update') {
    io.to(roomId).emit('language-change', { senderId: payload.senderId, language: payload.language });
  } else if (payload.type === 'output-update') {
    io.to(roomId).emit('execution-output', { senderId: payload.senderId, output: payload.output });
  }
});

server.listen(PORT, () => {
  console.log(`Editor Service running on port ${PORT}`);
});
