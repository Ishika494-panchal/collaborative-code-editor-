const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.AUTH_PORT || process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || `${GATEWAY_URL}/auth/github/callback`
  },
  function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

// Start GitHub OAuth Flow — always go through real GitHub OAuth
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

// GitHub OAuth Callback
app.get('/auth/github/callback', (req, res, next) => {
  passport.authenticate('github', { session: false }, (err, user, info) => {
    if (err) {
      console.error('❌ Passport Auth Error:', err);
      return res.redirect(`${FRONTEND_URL}/login?error=auth_error`);
    }
    if (!user) {
      console.error('❌ Passport Auth Failed (no user profile returned):', info);
      return res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    }
    
    // Create JWT with user details
    const token = jwt.sign({
      id: user.id,
      username: user.username || user.displayName || 'User',
      avatarUrl: user.photos && user.photos[0] ? user.photos[0].value : ''
    }, JWT_SECRET, { expiresIn: '7d' });

    // Redirect to API Gateway which will set the cookie
    res.redirect(`${GATEWAY_URL}/auth/set-token?token=${token}`);
  })(req, res, next);
});

// Verify token route (used by Gateway/Frontend)
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

// Logout route — clear the JWT cookie
app.post('/auth/logout', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});
