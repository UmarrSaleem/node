const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const { signupValidation, loginValidation, updateProfileValidation, passwordValidation } = require('../middleware/validators');

// @route   POST /api/auth/signup
// @desc    Register a user
// @access  Public
router.post('/signup', signupValidation, authController.signup);

// @route   POST /api/auth/login
// @desc    Login user & get token
// @access  Public
router.post('/login', loginValidation, authController.login);

// @route   GET /api/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, authController.getProfile);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, updateProfileValidation, authController.updateProfile);

// @route   GET /api/auth/verify-email/:token
// @desc    Verify email with token
// @access  Public
router.get('/verify-email/:token', authController.verifyEmail);

// @route   POST /api/auth/resend-verification
// @desc    Resend verification email
// @access  Public
router.post('/resend-verification', authController.resendVerificationEmail);

// @route   POST /api/auth/forgot-password
// @desc    Request password reset email
// @access  Public
router.post('/forgot-password', authController.requestPasswordReset);

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', passwordValidation, authController.resetPassword);

module.exports = router;