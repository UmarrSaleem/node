const { check } = require('express-validator');

exports.createCommentValidation = [
  check('content', 'Comment content is required').notEmpty().trim(),
];

exports.updateCommentValidation = [
  check('content', 'Comment content is required').notEmpty().trim(),
];