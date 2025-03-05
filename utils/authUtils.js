const jwt = require('jsonwebtoken');

// Generate a JWT token with user information
const generateToken = (userData, expiresIn = '1h') => {
  const payload = {
    user: userData
  };
  
  return new Promise((resolve, reject) => {
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn },
      (err, token) => {
        if (err) {
          console.error('JWT generation error:', err.message);
          reject(err);
        } else {
          resolve(token);
        }
      }
    );
  });
};

// Validate password strength
const validatePasswordStrength = (password) => {
  // Initialize result object
  const result = {
    isValid: false,
    score: 0,
    feedback: []
  };

  // Check minimum length
  if (password.length < 8) {
    result.feedback.push('Password should be at least 8 characters long');
  } else {
    result.score += 1;
  }

  // Check for uppercase letters
  if (!/[A-Z]/.test(password)) {
    result.feedback.push('Password should contain at least one uppercase letter');
  } else {
    result.score += 1;
  }

  // Check for lowercase letters
  if (!/[a-z]/.test(password)) {
    result.feedback.push('Password should contain at least one lowercase letter');
  } else {
    result.score += 1;
  }

  // Check for numbers
  if (!/\d/.test(password)) {
    result.feedback.push('Password should contain at least one number');
  } else {
    result.score += 1;
  }

  // Check for special characters
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    result.feedback.push('Password should contain at least one special character');
  } else {
    result.score += 1;
  }

  // Set validity based on score
  result.isValid = result.score >= 3;

  return result;
};

// Track login attempts (in-memory for simplicity - would use Redis/DB in production)
const loginAttempts = {};

const trackLoginAttempt = (email, success) => {
  if (!loginAttempts[email]) {
    loginAttempts[email] = {
      attempts: 0,
      lastAttempt: null,
      lockedUntil: null,
      successfulLogins: 0
    };
  }

  const now = new Date();
  const record = loginAttempts[email];

  // Reset attempts if last attempt was more than 30 minutes ago
  if (record.lastAttempt && (now - record.lastAttempt) > 30 * 60 * 1000) {
    record.attempts = 0;
    record.lockedUntil = null;
  }

  // Update record
  record.lastAttempt = now;
  
  if (success) {
    record.attempts = 0;
    record.successfulLogins += 1;
    return { locked: false, attemptsRemaining: 5 };
  } else {
    record.attempts += 1;
    
    // Lock account after 5 failed attempts
    if (record.attempts >= 5) {
      // Lock for 15 minutes
      const lockTime = new Date(now.getTime() + 15 * 60 * 1000);
      record.lockedUntil = lockTime;
      return { 
        locked: true, 
        attemptsRemaining: 0,
        lockedUntil: lockTime
      };
    }
    
    return { 
      locked: false, 
      attemptsRemaining: 5 - record.attempts
    };
  }
};

const isAccountLocked = (email) => {
  if (!loginAttempts[email]) {
    return { locked: false };
  }

  const record = loginAttempts[email];
  const now = new Date();

  if (record.lockedUntil && now < record.lockedUntil) {
    return { 
      locked: true, 
      lockedUntil: record.lockedUntil,
      remainingTime: Math.ceil((record.lockedUntil - now) / 1000 / 60) // in minutes
    };
  }

  return { locked: false };
};

module.exports = {
  generateToken,
  validatePasswordStrength,
  trackLoginAttempt,
  isAccountLocked
};