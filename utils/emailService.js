const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Create a transporter for sending emails
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate a random token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Send a verification email
const sendVerificationEmail = async (user, token) => {
  const verificationLink = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/verify-email/${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Email Verification',
    html: `
      <h1>Verify Your Email</h1>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for registering! Please verify your email address by clicking the link below:</p>
      <a href="${verificationLink}">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not create an account, please ignore this email.</p>
    `
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
};

// Send a password reset email
const sendPasswordResetEmail = async (user, token) => {
  const resetLink = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password/${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Password Reset',
    html: `
      <h1>Reset Your Password</h1>
      <p>Hi ${user.firstName},</p>
      <p>You requested a password reset. Please click the link below to reset your password:</p>
      <a href="${resetLink}">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you did not request a password reset, please ignore this email.</p>
    `
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

// Send a welcome email after verification
const sendWelcomeEmail = async (user) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Welcome to Our Platform!',
    html: `
      <h1>Welcome!</h1>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for verifying your email address. Your account is now fully activated!</p>
      <p>You can now log in and start using our services.</p>
    `
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

module.exports = {
  generateToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
};