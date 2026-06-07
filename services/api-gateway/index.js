const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const verifyToken = require('../../shared/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
const EXECUTION_SERVICE_URL = process.env.EXECUTION_SERVICE_URL || 'http://localhost:3003';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));

app.use(cookieParser());

// Proxy /api/execute to the Execution Service
// IMPORTANT: Do not put express.json() before this proxy, otherwise body-parser 
// consumes the request stream and the proxied request will hang!
app.use('/api/execute', createProxyMiddleware({
  target: EXECUTION_SERVICE_URL,
  changeOrigin: true,
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
