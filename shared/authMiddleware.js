const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretcodesyncjwt';

const verifyToken = (req, res, next) => {
  // Extract token from cookies or Authorization header
  let token = null;
  
  if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Access Denied: No token provided' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified; // Add the decoded user payload to the request object
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = verifyToken;
