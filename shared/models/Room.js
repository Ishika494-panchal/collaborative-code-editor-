const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  ownerId: { type: String, default: 'anonymous' },
  language: { type: String, default: 'javascript' },
  code: { type: String, default: '' },
  participants: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', RoomSchema);
