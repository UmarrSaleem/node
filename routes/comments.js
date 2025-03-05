// routes/comments.js
const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const auth = require('../middleware/auth');
const { createCommentValidation, updateCommentValidation } = require('../middleware/commentValidators');

// @route   POST /api/comments
// @desc    Create a new comment
// @access  Private
router.post('/', auth, createCommentValidation, commentController.createComment);

// @route   GET /api/comments
// @desc    Get all comments
// @access  Public
router.get('/', commentController.getAllComments);

// @route   GET /api/comments/:id
// @desc    Get comment by ID
// @access  Public
router.get('/:id', commentController.getCommentById);

// @route   PUT /api/comments/:id
// @desc    Update comment
// @access  Private
router.put('/:id', auth, updateCommentValidation, commentController.updateComment);

// @route   DELETE /api/comments/:id
// @desc    Delete comment
// @access  Private
router.delete('/:id', auth, commentController.deleteComment);

// @route   GET /api/comments/user/:userId
// @desc    Get comments by user ID
// @access  Public
router.get('/user/:userId', commentController.getCommentsByUser);

// Add sample debug route to verify API is accessible
router.get('/test', (req, res) => {
  res.json({ message: 'Comments API is working!' });
});

module.exports = router;