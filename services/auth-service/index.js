const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID || 'your_client_id',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || 'your_client_secret',
    callbackURL: process.env.GITHUB_CALLBACK_URL || `http://localhost:${PORT}/auth/github/callback`
  },
  function(accessToken, refreshToken, profile, done) {
    // In a real app, you would find or create a user in your database using profile.id
    return done(null, profile);
  }
));

// Start GitHub OAuth Flow
app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }));

// GitHub OAuth Callback
app.get('/auth/github/callback', 
  passport.authenticate('github', { session: false, failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication
    const user = req.user;
    
    // Create JWT
    const token = jwt.sign({
      id: user.id,
      username: user.username
    }, JWT_SECRET, { expiresIn: '1d' });

    // Store in HttpOnly cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Lax is better for OAuth redirects
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.redirect(FRONTEND_URL); // Redirect to frontend
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

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});
