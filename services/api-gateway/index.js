const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const verifyToken = require('../../shared/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const EDITOR_SERVICE_URL = process.env.EDITOR_SERVICE_URL || 'http://localhost:3002';
const EXECUTION_SERVICE_URL = process.env.EXECUTION_SERVICE_URL || 'http://localhost:3003';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));

app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretcodesyncjwt';

// ─── Auth Token Setter ────────────────────────────────────────────────────────
// After GitHub OAuth, the auth service redirects here with the JWT as a query
// param. We set the cookie from port 3000 (gateway) so that subsequent calls
// to /verify from the frontend (which also targets port 3000) include the cookie.
app.get('/auth/set-token', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect(FRONTEND_URL);

  res.cookie('jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  });

  res.redirect(FRONTEND_URL);
});


// Proxy /auth to Auth Service
app.use('/auth', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/': '/auth/' } // Restore the stripped /auth prefix
}));

// Proxy /verify to Auth Service
app.use('/verify', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/': '/verify/' } // Restore the stripped /verify prefix
}));

// Proxy /api/rooms to Editor Service
app.use('/api/rooms', createProxyMiddleware({
  target: EDITOR_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/': '/api/rooms/' } // Restore the stripped /api/rooms prefix
}));

// Proxy WebSockets for Socket.IO to Editor Service
app.use('/socket.io', createProxyMiddleware({
  target: EDITOR_SERVICE_URL,
  changeOrigin: true,
  ws: true // Enable WebSocket proxying
}));

// Proxy /api/execute to the Execution Service
// IMPORTANT: Do not put express.json() before this proxy, otherwise body-parser 
// consumes the request stream and the proxied request will hang!
app.use('/api/execute', createProxyMiddleware({
  target: EXECUTION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/execute': '/' },
}));

// Apply JSON parser for other routes
app.use(express.json());

// Public Route
app.get('/', (req, res) => res.send('API Gateway Service'));

// Protected Route Example
app.get('/api/protected', verifyToken, (req, res) => {
  res.json({ message: 'Welcome to the protected gateway route', user: req.user });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
