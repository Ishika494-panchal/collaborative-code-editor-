const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

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
// param. We set the cookie from the gateway domain so subsequent requests include it.
app.get('/auth/set-token', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect(`${FRONTEND_URL}/login`);

  const isProduction = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';

  res.cookie('jwt', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  // Redirect to dashboard after successful login
  res.redirect(`${FRONTEND_URL}/dashboard`);
});

// ─── Logout ─────────────────────────────────────────────────────────────────
app.post('/auth/logout', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  });
  res.json({ success: true });
});

// ─── Verify endpoint (direct handler, not proxied) ───────────────────────────
// We handle /verify ourselves using the JWT from the cookie to avoid proxy issues.
const jwt = require('jsonwebtoken');
app.get('/verify', (req, res) => {
  const token = req.cookies.jwt;
  if (!token) return res.status(401).json({ authenticated: false });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, user: decoded });
  } catch (err) {
    res.status(401).json({ authenticated: false });
  }
});

// Proxy /auth/github and /auth/github/callback to Auth Service (preserving /auth prefix)
app.use(createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathFilter: (path) => path.startsWith('/auth')
}));

// Proxy /api/rooms to Editor Service (preserving /api/rooms prefix)
app.use(createProxyMiddleware({
  target: EDITOR_SERVICE_URL,
  changeOrigin: true,
  pathFilter: (path) => path.startsWith('/api/rooms')
}));

// Proxy WebSockets for Socket.IO to Editor Service
const wsProxy = createProxyMiddleware({
  target: EDITOR_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  pathFilter: (path) => path.startsWith('/socket.io')
});
app.use(wsProxy);

// Proxy /api/execute to the Execution Service
app.use(createProxyMiddleware({
  target: EXECUTION_SERVICE_URL,
  changeOrigin: true,
  pathFilter: (path) => path.startsWith('/api/execute'),
  pathRewrite: { '^/api/execute': '/' },
}));

// Apply JSON parser for other routes
app.use(express.json());

// Public Route
app.get('/', (req, res) => res.send('CodeSync API Gateway'));

const server = app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

// IMPORTANT: Catch the upgrade event to proxy WebSockets
server.on('upgrade', wsProxy.upgrade);
