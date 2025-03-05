// const { check } = require('express-validator');

// exports.signupValidation = [
//   check('firstName', 'First name is required').notEmpty().trim(),
//   check('lastName', 'Last name is required').notEmpty().trim(),
//   check('username', 'Username is required').notEmpty().trim(),
//   check('email', 'Please include a valid email').isEmail().normalizeEmail(),
//   check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
// ];

// exports.loginValidation = [
//   check('email', 'Please include a valid email').isEmail().normalizeEmail(),
//   check('password', 'Password is required').exists(),
// ];

// exports.updateProfileValidation = [
//   check('firstName', 'First name is required').notEmpty().trim(),
//   check('lastName', 'Last name is required').notEmpty().trim(),
//   check('username', 'Username is required').notEmpty().trim(),
// ];

// exports.passwordValidation = [
//   check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
//   check('token', 'Reset token is required').exists(),
// ];

const { check, oneOf } = require('express-validator');

exports.signupValidation = [
  check('firstName', 'First name is required').notEmpty().trim(),
  check('lastName', 'Last name is required').notEmpty().trim(),
  check('username', 'Username is required').notEmpty().trim(),
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
];

// Updated login validation to support either email or username
exports.loginValidation = oneOf([
  // Option 1: Login with email
  [
    check('email', 'Please include a valid email').isEmail().normalizeEmail(),
    check('password', 'Password is required').exists(),
  ],
  // Option 2: Login with username
  [
    check('username', 'Username is required').notEmpty().trim(),
    check('password', 'Password is required').exists(),
  ]
], 'Please provide either a valid email or username');

exports.updateProfileValidation = [
  check('firstName', 'First name is required').notEmpty().trim(),
  check('lastName', 'Last name is required').notEmpty().trim(),
  check('username', 'Username is required').notEmpty().trim(),
];

exports.passwordValidation = [
  check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
  check('token', 'Reset token is required').exists(),
];