const { MongoUser, MySQLUser } = require('../models/User');
const { pool } = require('../config/db'); // Import pool from db.js
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { trackLoginAttempt, isAccountLocked, generateToken } = require('../utils/authUtils');
const emailService = require('../utils/emailService');
const bcrypt = require('bcrypt'); // Make sure this is available

// Register a new user
exports.signup = async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstName, lastName, username, email, password } = req.body;

  try {
    // Check if user already exists in MongoDB
    let mongoUserByEmail = await MongoUser.findOne({ email });
    if (mongoUserByEmail) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    let mongoUserByUsername = await MongoUser.findOne({ username });
    if (mongoUserByUsername) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    let mongoUser;
    let mysqlUserId;
    let successData = { mongo: false, mysql: false };
    let emailSent = false;
    
    // Generate verification token
    const verificationToken = emailService.generateToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    try {
      // Create a new user in MongoDB
      mongoUser = new MongoUser({
        firstName,
        lastName,
        username,
        email,
        password,
        verificationToken,
        verificationTokenExpires
      });

      await mongoUser.save();
      console.log(`User successfully registered in MongoDB with ID: ${mongoUser.id}`);
      successData.mongo = true;
    } catch (mongoError) {
      console.error('MongoDB user creation failed:', mongoError.message);
      // Continue to try MySQL registration even if MongoDB fails
    }

    try {
      // Check if user already exists in MySQL
      let mysqlUserByEmail = await MySQLUser.findByEmail(email);
      if (mysqlUserByEmail) {
        console.log('Email already exists in MySQL');
        if (successData.mongo) {
          // If MongoDB succeeded but MySQL failed due to duplicate, we should note this
          console.log('User exists in MySQL but was newly created in MongoDB - data inconsistency!');
        }
        // Don't return yet, handle complete registration status at the end
      } else {
        let mysqlUserByUsername = await MySQLUser.findByUsername(username);
        if (mysqlUserByUsername) {
          console.log('Username already exists in MySQL');
          // Continue processing
        } else {
          // Create in MySQL if doesn't exist
          mysqlUserId = await MySQLUser.createUser({
            firstName,
            lastName,
            username,
            email,
            password,
            verificationToken,
            verificationTokenExpires
          });
          console.log(`User successfully registered in MySQL with ID: ${mysqlUserId}`);
          successData.mysql = true;
        }
      }
    } catch (mysqlError) {
      console.error('MySQL user creation failed:', mysqlError.message);
      // Continue with the response even if MySQL fails
    }

    // Try to send verification email
    if (successData.mongo || successData.mysql) {
      try {
        const userObject = {
          firstName,
          lastName,
          email
        };
        
        emailSent = await emailService.sendVerificationEmail(userObject, verificationToken);
      } catch (emailError) {
        console.error('Error sending verification email:', emailError.message);
      }
    }

    // Generate response based on which operations succeeded
    let statusMessage = '';
    let statusCode = 200;
    
    if (successData.mongo && successData.mysql) {
      statusMessage = `User registered successfully in both databases. ${emailSent ? 'Verification email sent.' : 'Could not send verification email.'}`;
    } else if (successData.mongo) {
      statusMessage = `User registered in MongoDB only. ${emailSent ? 'Verification email sent.' : 'Could not send verification email.'}`;
      statusCode = 206; // Partial Content
    } else if (successData.mysql) {
      statusMessage = `User registered in MySQL only. ${emailSent ? 'Verification email sent.' : 'Could not send verification email.'}`;
      statusCode = 206; // Partial Content
    } else {
      // Both failed
      return res.status(500).json({ message: 'Failed to register user in both databases' });
    }

    // Create JWT token with references to databases where user exists
    const payload = {
      user: {
        mongoId: successData.mongo ? mongoUser.id : null,
        mysqlId: successData.mysql ? mysqlUserId : null
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
        res.status(statusCode).json({ 
          token,
          user: {
            id: successData.mongo ? mongoUser.id : mysqlUserId,
            firstName,
            lastName,
            username,
            email,
            isVerified: false
          },
          message: statusMessage,
          registrationStatus: successData,
          emailSent
        });
      }
    );
  } catch (error) {
    console.error('Error in signup:', error.message);
    console.error('Full error:', error);
    return res.status(500).json({ 
      message: 'Server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Login user
exports.login = async (req, res) => {
  console.log('==== Login Request ====');
  console.log('Request body:', req.body);
  
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  // Extract login info - support both email and username
  const { email, username, password, rememberMe } = req.body;
  
  // Determine which identifier was provided (email or username)
  const identifier = email || username;
  const isUsingEmail = !!email;
  
  console.log('Login attempt details:', { 
    email: email || 'not provided', 
    username: username || 'not provided',
    rememberMe: !!rememberMe,
    identifier,
    isUsingEmail 
  });
  
  if (!identifier) {
    console.log('No identifier provided');
    return res.status(400).json({ message: 'Email or username is required' });
  }

  // For testing/debugging, create a temporary user with preset credentials
  if (identifier === 'testuser@example.com' && password === 'password123') {
    console.log('TEST USER: Bypassing normal authentication for test credentials');
    const testPayload = { 
      // Use dummy IDs that won't be found in DB
      mongoId: '111111111111111111111111',
      mysqlId: 999999
    };
    
    const token = await generateToken(testPayload, '1h');
    
    return res.json({
      token,
      user: {
        id: '111111111111111111111111',
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
        email: 'testuser@example.com',
        isVerified: true
      },
      message: 'Test user authenticated',
      authenticated: true,
      isVerified: true,
      tokenExpiration: '1h'
    });
  }

  try {
    // Check if account is locked due to multiple failed attempts
    const lockStatus = isAccountLocked(identifier);
    if (lockStatus.locked) {
      console.log('Account locked:', lockStatus);
      return res.status(429).json({
        message: 'Account temporarily locked due to multiple failed login attempts',
        lockedUntil: lockStatus.lockedUntil,
        remainingTime: lockStatus.remainingTime,
        error: 'account_locked'
      });
    }

    let source = [];
    let authSuccess = false;
    let userData = null;
    let mongoUser = null;
    let mysqlUser = null;
    let mongoId = null;
    let mysqlId = null;
    let isVerified = false;

    console.log(`Login attempt with ${isUsingEmail ? 'email' : 'username'}: ${identifier}`);
    
    // First try MongoDB
    try {
      // Find user by either email or username
      if (isUsingEmail) {
        mongoUser = await MongoUser.findOne({ email: identifier });
        console.log('MongoDB user search by email:', mongoUser ? 'Found' : 'Not found');
      } else {
        mongoUser = await MongoUser.findOne({ username: identifier });
        console.log('MongoDB user search by username:', mongoUser ? 'Found' : 'Not found');
      }
      
      if (mongoUser) {
        source.push('MongoDB user found');
        isVerified = mongoUser.isVerified;
        console.log('MongoDB user details:', {
          id: mongoUser.id,
          username: mongoUser.username,
          email: mongoUser.email,
          isVerified: mongoUser.isVerified,
          passwordLength: mongoUser.password ? mongoUser.password.length : 0
        });
        
        // Verify password for MongoDB user
        console.log('Attempting MongoDB password verification');
        const isMongoMatch = await mongoUser.comparePassword(password);
        console.log('MongoDB password verification result:', isMongoMatch);
        
        if (isMongoMatch) {
          console.log('MongoDB authentication successful');
          authSuccess = true;
          mongoId = mongoUser.id;
          userData = {
            id: mongoUser.id,
            firstName: mongoUser.firstName,
            lastName: mongoUser.lastName,
            username: mongoUser.username,
            email: mongoUser.email,
            isVerified: mongoUser.isVerified
          };
        } else {
          console.log('MongoDB password mismatch');
        }
      } else {
        console.log('User not found in MongoDB');
      }
    } catch (mongoError) {
      console.error('Error during MongoDB login:', mongoError.message);
    }
    
    // Try MySQL next (even if MongoDB succeeded, to check existence in both)
    try {
      // Find user by either email or username
      if (isUsingEmail) {
        mysqlUser = await MySQLUser.findByEmail(identifier);
        console.log('MySQL user search by email:', mysqlUser ? 'Found' : 'Not found');
      } else {
        mysqlUser = await MySQLUser.findByUsername(identifier);
        console.log('MySQL user search by username:', mysqlUser ? 'Found' : 'Not found');
      }
      
      if (mysqlUser) {
        source.push('MySQL user found');
        mysqlId = mysqlUser.id;
        console.log('MySQL user details:', {
          id: mysqlUser.id,
          username: mysqlUser.username,
          email: mysqlUser.email,
          isVerified: mysqlUser.isVerified,
          passwordLength: mysqlUser.password ? mysqlUser.password.length : 0
        });
        
        // If MongoDB didn't have verification status, use MySQL's
        if (!mongoUser) {
          isVerified = mysqlUser.isVerified === 1; // MySQL uses 1/0 for boolean
        }
        
        // Only verify MySQL password if MongoDB auth failed
        if (!authSuccess) {
          console.log('Attempting MySQL password verification');
          const isMySQLMatch = await MySQLUser.comparePassword(password, mysqlUser.password);
          console.log('MySQL password verification result:', isMySQLMatch);
          
          if (isMySQLMatch) {
            console.log('MySQL authentication successful');
            authSuccess = true;
            userData = {
              id: mysqlUser.id,
              firstName: mysqlUser.firstName,
              lastName: mysqlUser.lastName,
              username: mysqlUser.username,
              email: mysqlUser.email,
              isVerified: mysqlUser.isVerified === 1
            };
          } else {
            console.log('MySQL password mismatch');
          }
        }
      } else {
        console.log('User not found in MySQL');
      }
    } catch (mysqlError) {
      console.error('Error during MySQL login:', mysqlError.message);
    }
    
    // If authentication failed in both databases
    if (!authSuccess) {
      // Track failed login attempt
      const attemptResult = trackLoginAttempt(identifier, false);
      console.log('Authentication failed. Attempt tracking result:', attemptResult);
      
      let message = 'Invalid credentials';
      let status = 401;
      const responseData = { 
        message,
        detail: source.length ? 'Password verification failed' : 'User not found in any database'
      };
      
      if (attemptResult.locked) {
        status = 429; // Too many requests
        message = 'Account locked due to too many failed attempts';
        responseData.message = message;
        responseData.lockedUntil = attemptResult.lockedUntil;
        responseData.error = 'account_locked';
      } else if (attemptResult.attemptsRemaining < 5) {
        responseData.attemptsRemaining = attemptResult.attemptsRemaining;
        responseData.warning = `Account will be locked after ${attemptResult.attemptsRemaining} more failed attempts`;
      }
      
      console.log('Sending authentication failure response:', responseData);
      return res.status(status).json(responseData);
    }
    
    // Track successful login
    const trackResult = trackLoginAttempt(identifier, true);
    console.log('Authentication successful. Attempt tracking result:', trackResult);
    
    // Generate appropriate message based on which databases contained the user
    let statusMessage = '';
    if (mongoId && mysqlId) {
      statusMessage = 'User exists in both databases. Authentication successful.';
    } else if (mongoId) {
      statusMessage = 'User exists in MongoDB only. Authentication successful.';
    } else {
      statusMessage = 'User exists in MySQL only. Authentication successful.';
    }

    // Add verification warning if not verified
    if (!isVerified) {
      statusMessage += ' Warning: Email not verified.';
    }

    // Determine token expiration time (remember me feature)
    const tokenExpiration = rememberMe ? '7d' : '1h';
    console.log('Token expiration set to:', tokenExpiration);

    // Create JWT token
    const payload = {
      mongoId,
      mysqlId
    };

    try {
      console.log('Generating authentication token with payload:', payload);
      const token = await generateToken(payload, tokenExpiration);
      
      const response = { 
        token,
        user: userData,
        message: statusMessage,
        databases: {
          mongo: !!mongoId,
          mysql: !!mysqlId
        },
        authenticated: authSuccess,
        isVerified,
        tokenExpiration
      };
      
      console.log('Sending successful authentication response');
      res.json(response);
    } catch (tokenError) {
      console.error('Error generating token:', tokenError.message);
      return res.status(500).json({ message: 'Error generating authentication token' });
    }
  } catch (error) {
    console.error('Error in login process:', error.message);
    res.status(500).json({ 
      message: 'Server error during login process',
      detail: error.message
    });
  }
};

// Check if user exists (For debugging only)
exports.checkUser = async (req, res) => {
  const { email } = req.params;
  
  try {
    console.log(`Checking if user exists with email: ${email}`);
    
    // Check MongoDB
    const mongoUser = await MongoUser.findOne({ email });
    
    // Check MySQL
    const mysqlUser = await MySQLUser.findByEmail(email);
    
    return res.json({
      exists: {
        mongo: !!mongoUser,
        mysql: !!mysqlUser
      },
      mongoDetails: mongoUser ? {
        id: mongoUser._id,
        username: mongoUser.username,
        isVerified: mongoUser.isVerified,
        hasPassword: !!mongoUser.password,
        passwordLength: mongoUser.password?.length
      } : null,
      mysqlDetails: mysqlUser ? {
        id: mysqlUser.id,
        username: mysqlUser.username,
        isVerified: !!mysqlUser.isVerified,
        hasPassword: !!mysqlUser.password,
        passwordLength: mysqlUser.password?.length
      } : null
    });
  } catch (error) {
    console.error('Error checking user:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Verify email
exports.verifyEmail = async (req, res) => {
  const { token } = req.params;
  
  try {
    // Check MongoDB for the token
    let user = await MongoUser.findOne({ 
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });
    
    let mysqlUser = null;
    
    // If not found in MongoDB, check MySQL
    if (!user) {
      mysqlUser = await MySQLUser.findByVerificationToken(token);
      
      if (!mysqlUser) {
        return res.status(400).json({ 
          message: 'Invalid or expired verification token',
          error: 'invalid_token'
        });
      }
    }
    
    let verifiedInMongo = false;
    let verifiedInMySQL = false;
    
    // Verify in MongoDB if found
    if (user) {
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
      await user.save();
      verifiedInMongo = true;
    }
    
    // Verify in MySQL if found
    if (mysqlUser) {
      await MySQLUser.verifyEmail(mysqlUser.id);
      verifiedInMySQL = true;
    }
    
    // Send welcome email
    const userForEmail = user || mysqlUser;
    await emailService.sendWelcomeEmail({
      firstName: userForEmail.firstName,
      email: userForEmail.email
    });
    
    return res.status(200).json({
      message: 'Email verification successful. You can now log in.',
      success: true,
      verifiedInMongo,
      verifiedInMySQL
    });
  } catch (error) {
    console.error('Error in email verification:', error.message);
    return res.status(500).json({ 
      message: 'Server error during email verification',
      error: error.message
    });
  }
};

// Request password reset
exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  
  try {
    // Check if user exists in MongoDB
    let mongoUser = await MongoUser.findOne({ email });
    let mysqlUser = await MySQLUser.findByEmail(email);
    
    if (!mongoUser && !mysqlUser) {
      // Don't reveal that the user doesn't exist for security reasons
      return res.status(200).json({ 
        message: 'If a user with that email exists, a password reset link has been sent.',
        success: false 
      });
    }
    
    // Generate reset token
    const resetToken = emailService.generateToken();
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    // Update MongoDB if user exists there
    if (mongoUser) {
      mongoUser.resetPasswordToken = resetToken;
      mongoUser.resetPasswordExpires = resetTokenExpires;
      await mongoUser.save();
    }
    
    // Update MySQL if user exists there
    if (mysqlUser) {
      await MySQLUser.setResetPasswordToken(mysqlUser.id, resetToken, resetTokenExpires);
    }
    
    // Send password reset email
    const userForEmail = mongoUser || mysqlUser;
    const emailSent = await emailService.sendPasswordResetEmail({
      firstName: userForEmail.firstName,
      email: userForEmail.email
    }, resetToken);
    
    if (!emailSent) {
      return res.status(500).json({ 
        message: 'Error sending password reset email',
        success: false 
      });
    }
    
    return res.status(200).json({
      message: 'Password reset email sent successfully',
      success: true
    });
  } catch (error) {
    console.error('Error requesting password reset:', error.message);
    return res.status(500).json({ 
      message: 'Server error during password reset request',
      error: error.message
    });
  }
};

// Reset password with token
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return res.status(400).json({ 
      message: 'Token and password are required',
      error: 'missing_fields'
    });
  }
  
  try {
    // Check MongoDB for the token
    let mongoUser = await MongoUser.findOne({ 
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    let mysqlUser = null;
    
    // If not found in MongoDB, check MySQL
    if (!mongoUser) {
      mysqlUser = await MySQLUser.findByResetToken(token);
      
      if (!mysqlUser) {
        return res.status(400).json({ 
          message: 'Invalid or expired reset token',
          error: 'invalid_token'
        });
      }
    }
    
    let resetInMongo = false;
    let resetInMySQL = false;
    
    // Reset password in MongoDB if found
    if (mongoUser) {
      mongoUser.password = password;
      mongoUser.resetPasswordToken = undefined;
      mongoUser.resetPasswordExpires = undefined;
      await mongoUser.save();
      resetInMongo = true;
    }
    
    // Reset password in MySQL if found
    if (mysqlUser) {
      await MySQLUser.resetPassword(mysqlUser.id, password);
      resetInMySQL = true;
    }
    
    return res.status(200).json({
      message: 'Password reset successful. You can now log in with your new password.',
      success: true,
      resetInMongo,
      resetInMySQL
    });
  } catch (error) {
    console.error('Error resetting password:', error.message);
    return res.status(500).json({ 
      message: 'Server error during password reset',
      error: error.message
    });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    let user = null;
    
    // Try to fetch from MongoDB first if we have a MongoDB ID
    if (req.user.mongoId) {
      user = await MongoUser.findById(req.user.mongoId).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires');
      if (user) {
        return res.json({
          user,
          source: 'MongoDB',
          message: 'Profile retrieved from MongoDB database'
        });
      }
    }
    
    // If no MongoDB user or no MongoDB ID, try MySQL
    if (req.user.mysqlId) {
      user = await MySQLUser.findById(req.user.mysqlId);
      if (user) {
        return res.json({
          user,
          source: 'MySQL',
          message: 'Profile retrieved from MySQL database'
        });
      }
    }
    
    // If we still don't have a user, return 404
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
  } catch (error) {
    console.error('Error fetching profile:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  const { firstName, lastName, username } = req.body;
  
  // Validate inputs
  if (!firstName || !lastName || !username) {
    return res.status(400).json({ message: 'First name, last name, and username are required' });
  }
  
  try {
    let updatedInMongo = false;
    let updatedInMySQL = false;
    let user = null;
    
    // Update in MongoDB if we have a MongoDB ID
    if (req.user.mongoId) {
      // Check if username is already taken by another user
      const existingUser = await MongoUser.findOne({ 
        username, 
        _id: { $ne: req.user.mongoId } 
      });
      
      if (existingUser) {
        return res.status(400).json({ message: 'Username is already taken' });
      }
      
      user = await MongoUser.findById(req.user.mongoId);
      if (user) {
        user.firstName = firstName;
        user.lastName = lastName;
        user.username = username;
        await user.save();
        updatedInMongo = true;
      }
    }
    
    // Update in MySQL if we have a MySQL ID
    if (req.user.mysqlId) {
      // Check if username is already taken by another user
      const existingMySQLUser = await MySQLUser.findByUsername(username);
      
      if (existingMySQLUser && existingMySQLUser.id !== req.user.mysqlId) {
        // Only return error if MongoDB update didn't happen
        if (!updatedInMongo) {
          return res.status(400).json({ message: 'Username is already taken' });
        }
      } else {
        await MySQLUser.updateProfile(req.user.mysqlId, { firstName, lastName, username });
        updatedInMySQL = true;
      }
    }
    
    if (!updatedInMongo && !updatedInMySQL) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get updated user info
    if (updatedInMongo) {
      user = await MongoUser.findById(req.user.mongoId).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires');
    } else if (updatedInMySQL) {
      user = await MySQLUser.findById(req.user.mysqlId);
    }
    
    return res.status(200).json({
      message: 'Profile updated successfully',
      user,
      updatedInMongo,
      updatedInMySQL
    });
  } catch (error) {
    console.error('Error updating profile:', error.message);
    return res.status(500).json({ 
      message: 'Server error during profile update',
      error: error.message 
    });
  }
};

// Resend verification email
exports.resendVerificationEmail = async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  
  try {
    // Check if user exists and is not already verified
    let mongoUser = await MongoUser.findOne({ email, isVerified: false });
    let mysqlUser = await MySQLUser.findByEmail(email);
    
    // If user doesn't exist or is already verified in both databases
    if ((!mongoUser || mongoUser.isVerified) && 
        (!mysqlUser || mysqlUser.isVerified === 1)) {
      return res.status(400).json({ 
        message: 'Email is either already verified or not registered',
        success: false
      });
    }
    
    // Generate new verification token
    const verificationToken = emailService.generateToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Update MongoDB if user exists and is not verified
    if (mongoUser && !mongoUser.isVerified) {
      mongoUser.verificationToken = verificationToken;
      mongoUser.verificationTokenExpires = verificationTokenExpires;
      await mongoUser.save();
    }
    
    // Update MySQL if user exists and is not verified
    if (mysqlUser && mysqlUser.isVerified === 0) {
      await MySQLUser.updateVerificationToken(
        mysqlUser.id, 
        verificationToken, 
        verificationTokenExpires
      );
    }
    
    // Send verification email
    const userForEmail = mongoUser || mysqlUser;
    const emailSent = await emailService.sendVerificationEmail({
      firstName: userForEmail.firstName,
      email: userForEmail.email
    }, verificationToken);
    
    if (!emailSent) {
      return res.status(500).json({ 
        message: 'Error sending verification email',
        success: false 
      });
    }
    
    return res.status(200).json({
      message: 'Verification email sent successfully',
      success: true
    });
  } catch (error) {
    console.error('Error resending verification email:', error.message);
    return res.status(500).json({ 
      message: 'Server error while resending verification email',
      error: error.message 
    });
  }
};