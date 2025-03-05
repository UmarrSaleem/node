// const jwt = require('jsonwebtoken');

// module.exports = function(req, res, next) {
//   // Get token from header
//   const token = req.header('x-auth-token');

//   // Check if no token
//   if (!token) {
//     return res.status(401).json({ 
//       message: 'No token, authorization denied',
//       error: 'missing_token' 
//     });
//   }

//   // Verify token
//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
//     // Set user with both MongoDB and MySQL IDs
//     req.user = decoded.user;
    
//     // Check if we have at least one valid ID
//     if (!req.user.mongoId && !req.user.mysqlId) {
//       console.log('Token valid but contains no valid database IDs');
//       return res.status(401).json({ 
//         message: 'Invalid user identification',
//         error: 'invalid_user_id' 
//       });
//     }
    
//     // Add token expiration information to the request
//     req.tokenExp = decoded.exp;
//     req.tokenIat = decoded.iat;
    
//     // Check token expiration - should be handled by verify but adding as extra safety
//     const currentTime = Math.floor(Date.now() / 1000);
//     if (req.tokenExp && req.tokenExp < currentTime) {
//       return res.status(401).json({ 
//         message: 'Token has expired',
//         error: 'token_expired',
//         expiredAt: new Date(req.tokenExp * 1000).toISOString()
//       });
//     }
    
//     next();
//   } catch (error) {
//     console.error('Token verification error:', error.message);
    
//     // Provide specific error based on JWT error type
//     if (error.name === 'TokenExpiredError') {
//       return res.status(401).json({ 
//         message: 'Token has expired, please login again',
//         error: 'token_expired',
//         expiredAt: error.expiredAt
//       });
//     } else if (error.name === 'JsonWebTokenError') {
//       return res.status(401).json({ 
//         message: 'Invalid token',
//         error: 'invalid_token' 
//       });
//     } else {
//       return res.status(401).json({ 
//         message: 'Token validation failed',
//         error: 'token_validation_failed' 
//       });
//     }
//   }
// };

const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Get token from header
  const token = req.header('x-auth-token');

  // Check if no token
  if (!token) {
    return res.status(401).json({ 
      message: 'No token, authorization denied',
      error: 'missing_token' 
    });
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if we have a user object in the token
    if (decoded.user) {
      // Set user info from token
      req.user = decoded.user;
    } else if (decoded.mongoId || decoded.mysqlId) {
      // Support for older token format
      req.user = {
        mongoId: decoded.mongoId,
        mysqlId: decoded.mysqlId
      };
    } else {
      return res.status(401).json({ 
        message: 'Invalid token format',
        error: 'invalid_token_format' 
      });
    }
    
    // Check if we have at least one valid ID
    if (!req.user.mongoId && !req.user.mysqlId) {
      console.log('Token valid but contains no valid database IDs');
      return res.status(401).json({ 
        message: 'Invalid user identification',
        error: 'invalid_user_id' 
      });
    }
    
    // Add token expiration information to the request
    req.tokenExp = decoded.exp;
    req.tokenIat = decoded.iat;
    
    // Check token expiration - should be handled by verify but adding as extra safety
    const currentTime = Math.floor(Date.now() / 1000);
    if (req.tokenExp && req.tokenExp < currentTime) {
      return res.status(401).json({ 
        message: 'Token has expired',
        error: 'token_expired',
        expiredAt: new Date(req.tokenExp * 1000).toISOString()
      });
    }
    
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    
    // Provide specific error based on JWT error type
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token has expired, please login again',
        error: 'token_expired',
        expiredAt: error.expiredAt
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token',
        error: 'invalid_token' 
      });
    } else {
      return res.status(401).json({ 
        message: 'Token validation failed',
        error: 'token_validation_failed' 
      });
    }
  }
};