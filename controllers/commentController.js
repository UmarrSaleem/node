// controllers/commentController.js
const mongoose = require('mongoose');
const { MongoComment, MySQLComment } = require('../models/Comment');
const { MongoUser, MySQLUser } = require('../models/User');
const { validationResult } = require('express-validator');

// Create a new comment
exports.createComment = async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { content, parentId } = req.body;
  const mongoUserId = req.user.mongoId;
  const mysqlUserId = req.user.mysqlId;

  try {
    let mongoComment;
    let mysqlCommentId;
    let successData = { mongo: false, mysql: false };
    
    // Create comment in MongoDB if user exists there
    if (mongoUserId) {
      try {
        // Create a new comment in MongoDB
        mongoComment = new MongoComment({
          content,
          userId: mongoUserId,  // Now this matches the schema field name
          parentId: parentId || null
        });

        await mongoComment.save();
        console.log(`Comment successfully created in MongoDB with ID: ${mongoComment.id}`);
        successData.mongo = true;
      } catch (mongoError) {
        console.error('MongoDB comment creation failed:', mongoError.message);
      }
    }

    // Create comment in MySQL if user exists there
    if (mysqlUserId) {
      try {
        // Create in MySQL
        mysqlCommentId = await MySQLComment.createComment({
          content,
          userId: mysqlUserId,
          mongoUserId: mongoComment ? mongoComment.id : null,
          parentId: null, // For now, we're not handling nested comments in MySQL
          mongoParentId: parentId || null
        });
        
        console.log(`Comment successfully created in MySQL with ID: ${mysqlCommentId}`);
        successData.mysql = true;
      } catch (mysqlError) {
        console.error('MySQL comment creation failed:', mysqlError.message);
      }
    }

    // Generate response based on which operations succeeded
    let statusMessage = '';
    let statusCode = 200;
    
    if (successData.mongo && successData.mysql) {
      statusMessage = 'Comment created successfully in both databases.';
    } else if (successData.mongo) {
      statusMessage = 'Comment created in MongoDB only.';
      statusCode = 206; // Partial Content
    } else if (successData.mysql) {
      statusMessage = 'Comment created in MySQL only.';
      statusCode = 206; // Partial Content
    } else {
      // Both failed
      return res.status(500).json({ message: 'Failed to create comment in both databases' });
    }

    // Return success response
    res.status(statusCode).json({
      message: statusMessage,
      comment: successData.mongo ? {
        id: mongoComment.id,
        content: mongoComment.content,
        userId: mongoComment.userId,
        parentId: mongoComment.parentId,
        createdAt: mongoComment.createdAt
      } : {
        id: mysqlCommentId,
        content,
        userId: mysqlUserId,
        parentId: null,
        createdAt: new Date()
      },
      creationStatus: successData
    });
  } catch (error) {
    console.error('Error in comment creation:', error.message);
    return res.status(500).json({
      message: 'Server error during comment creation',
      error: error.message
    });
  }
};

// Get all comments
exports.getAllComments = async (req, res) => {
  try {
    // Get comments from MongoDB
    const mongoComments = await MongoComment.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'firstName lastName username');
    
    // Get comments from MySQL
    let mysqlComments = [];
    try {
      mysqlComments = await MySQLComment.getAllComments();
    } catch (error) {
      console.error('Error fetching MySQL comments:', error.message);
      // Continue with MongoDB comments only
    }
    
    // Format MongoDB comments with null check for userId
    const formattedMongoComments = mongoComments.map(comment => {
      // Check if userId exists and is populated
      const user = comment.userId || {};
      
      return {
        id: comment._id,
        content: comment.content,
        user: comment.userId ? {
          id: user._id || user,
          firstName: user.firstName || 'Unknown',
          lastName: user.lastName || 'User',
          username: user.username || 'unknown'
        } : {
          id: comment.userId || 'unknown',
          firstName: 'Unknown',
          lastName: 'User',
          username: 'unknown'
        },
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        source: 'MongoDB'
      };
    });
    
    // Format MySQL comments
    const formattedMySQLComments = mysqlComments.map(comment => ({
      id: comment.id,
      content: comment.content,
      user: {
        id: comment.userId,
        firstName: comment.firstName || 'Unknown',
        lastName: comment.lastName || 'User',
        username: comment.username || 'unknown'
      },
      parentId: comment.parentId,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      source: 'MySQL'
    }));

    // Combine comments from both databases
    const comments = [
      ...formattedMongoComments,
      ...formattedMySQLComments
    ];

    // Sort combined comments by createdAt in descending order
    comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return res.status(200).json({
      comments,
      count: comments.length
    });
  } catch (error) {
    console.error('Error fetching comments:', error.message);
    return res.status(500).json({
      message: 'Server error while fetching comments',
      error: error.message
    });
  }
};

// Get comment by ID
exports.getCommentById = async (req, res) => {
  const { id } = req.params;
  
  try {
    let comment = null;
    let source = '';
    
    // First try MongoDB
    if (mongoose.Types.ObjectId.isValid(id)) {
      try {
        comment = await MongoComment.findById(id)
          .populate('userId', 'firstName lastName username');
          
        if (comment) {
          source = 'MongoDB';
          
          // Format MongoDB comment
          comment = {
            id: comment._id,
            content: comment.content,
            user: comment.userId ? {
              id: comment.userId._id || comment.userId,
              firstName: comment.userId.firstName || 'Unknown',
              lastName: comment.userId.lastName || 'User',
              username: comment.userId.username || 'unknown'
            } : {
              id: 'unknown',
              firstName: 'Unknown',
              lastName: 'User',
              username: 'unknown'
            },
            parentId: comment.parentId,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt
          };
        }
      } catch (error) {
        console.error('Error fetching MongoDB comment:', error.message);
      }
    }
    
    // If not found in MongoDB, try MySQL
    if (!comment) {
      try {
        const mysqlComment = await MySQLComment.getCommentById(id);
        
        if (mysqlComment) {
          comment = {
            id: mysqlComment.id,
            content: mysqlComment.content,
            user: {
              id: mysqlComment.userId,
              firstName: mysqlComment.firstName || 'Unknown',
              lastName: mysqlComment.lastName || 'User',
              username: mysqlComment.username || 'unknown'
            },
            parentId: mysqlComment.parentId,
            createdAt: mysqlComment.createdAt,
            updatedAt: mysqlComment.updatedAt
          };
          source = 'MySQL';
        }
      } catch (error) {
        console.error('Error fetching MySQL comment:', error.message);
      }
    }
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    return res.status(200).json({
      comment,
      source
    });
  } catch (error) {
    console.error('Error fetching comment:', error.message);
    return res.status(500).json({
      message: 'Server error while fetching comment',
      error: error.message
    });
  }
};

// Update comment
exports.updateComment = async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const mongoUserId = req.user.mongoId;
  const mysqlUserId = req.user.mysqlId;
  
  // Validate input
  if (!content) {
    return res.status(400).json({ message: 'Comment content is required' });
  }
  
  try {
    let comment = null;
    let updatedInMongo = false;
    let updatedInMySQL = false;
    
    // First try MongoDB
    if (mongoose.Types.ObjectId.isValid(id)) {
      try {
        comment = await MongoComment.findById(id);
        
        // Check if comment exists and belongs to the user
        if (comment && comment.userId.toString() === mongoUserId) {
          comment.content = content;
          comment.updatedAt = Date.now();
          comment.edited = true;
          await comment.save();
          updatedInMongo = true;
        }
      } catch (error) {
        console.error('Error updating MongoDB comment:', error.message);
      }
    }
    
    // Try MySQL
    try {
      const mysqlComment = await MySQLComment.getCommentById(id);
      
      if (mysqlComment && mysqlComment.userId == mysqlUserId) {
        await MySQLComment.updateComment(id, content);
        updatedInMySQL = true;
      }
    } catch (error) {
      console.error('Error updating MySQL comment:', error.message);
    }
    
    if (!updatedInMongo && !updatedInMySQL) {
      return res.status(404).json({ 
        message: 'Comment not found or you do not have permission to update it' 
      });
    }
    
    // Get updated comment
    if (updatedInMongo) {
      try {
        comment = await MongoComment.findById(id)
          .populate('userId', 'firstName lastName username');
          
        comment = {
          id: comment._id,
          content: comment.content,
          user: comment.userId ? {
            id: comment.userId._id || comment.userId,
            firstName: comment.userId.firstName || 'Unknown',
            lastName: comment.userId.lastName || 'User',
            username: comment.userId.username || 'unknown'
          } : {
            id: 'unknown',
            firstName: 'Unknown',
            lastName: 'User',
            username: 'unknown'
          },
          parentId: comment.parentId,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          source: 'MongoDB'
        };
      } catch (error) {
        console.error('Error fetching updated MongoDB comment:', error.message);
      }
    } else if (updatedInMySQL) {
      try {
        const updatedMySQLComment = await MySQLComment.getCommentById(id);
        
        comment = {
          id: updatedMySQLComment.id,
          content: updatedMySQLComment.content,
          user: {
            id: updatedMySQLComment.userId,
            firstName: updatedMySQLComment.firstName || 'Unknown',
            lastName: updatedMySQLComment.lastName || 'User',
            username: updatedMySQLComment.username || 'unknown'
          },
          parentId: updatedMySQLComment.parentId,
          createdAt: updatedMySQLComment.createdAt,
          updatedAt: updatedMySQLComment.updatedAt,
          source: 'MySQL'
        };
      } catch (error) {
        console.error('Error fetching updated MySQL comment:', error.message);
      }
    }
    
    return res.status(200).json({
      message: 'Comment updated successfully',
      comment,
      updatedInMongo,
      updatedInMySQL
    });
  } catch (error) {
    console.error('Error updating comment:', error.message);
    return res.status(500).json({
      message: 'Server error while updating comment',
      error: error.message
    });
  }
};

// Delete comment
exports.deleteComment = async (req, res) => {
  const { id } = req.params;
  const mongoUserId = req.user.mongoId;
  const mysqlUserId = req.user.mysqlId;
  
  try {
    let deletedInMongo = false;
    let deletedInMySQL = false;
    
    // First try MongoDB
    if (mongoose.Types.ObjectId.isValid(id)) {
      try {
        const comment = await MongoComment.findById(id);
        
        // Check if comment exists and belongs to the user
        if (comment && comment.userId.toString() === mongoUserId) {
          await MongoComment.findByIdAndDelete(id);
          deletedInMongo = true;
        }
      } catch (error) {
        console.error('Error deleting MongoDB comment:', error.message);
      }
    }
    
    // Try MySQL
    try {
      const mysqlComment = await MySQLComment.getCommentById(id);
      
      if (mysqlComment && mysqlComment.userId == mysqlUserId) {
        await MySQLComment.deleteComment(id);
        deletedInMySQL = true;
      }
    } catch (error) {
      console.error('Error deleting MySQL comment:', error.message);
    }
    
    if (!deletedInMongo && !deletedInMySQL) {
      return res.status(404).json({ 
        message: 'Comment not found or you do not have permission to delete it' 
      });
    }
    
    return res.status(200).json({
      message: 'Comment deleted successfully',
      deletedInMongo,
      deletedInMySQL
    });
  } catch (error) {
    console.error('Error deleting comment:', error.message);
    return res.status(500).json({
      message: 'Server error while deleting comment',
      error: error.message
    });
  }
};

// Get comments by user ID
exports.getCommentsByUser = async (req, res) => {
  const { userId } = req.params;
  
  try {
    let comments = [];
    
    // Try MongoDB
    if (mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const mongoComments = await MongoComment.find({ userId })
          .sort({ createdAt: -1 })
          .populate('userId', 'firstName lastName username');
          
        // Format MongoDB comments
        const formattedMongoComments = mongoComments.map(comment => {
          const userData = comment.userId || {};
          
          return {
            id: comment._id,
            content: comment.content,
            user: {
              id: userData._id || userData,
              firstName: userData.firstName || 'Unknown',
              lastName: userData.lastName || 'User',
              username: userData.username || 'unknown'
            },
            parentId: comment.parentId,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            source: 'MongoDB'
          };
        });
        
        comments = [...comments, ...formattedMongoComments];
      } catch (error) {
        console.error('Error fetching MongoDB user comments:', error.message);
      }
    }
    
    // Try MySQL
    try {
      const mysqlComments = await MySQLComment.getCommentsByUserId(userId);
      
      // Format MySQL comments
      const formattedMySQLComments = mysqlComments.map(comment => ({
        id: comment.id,
        content: comment.content,
        user: {
          id: comment.userId,
          firstName: comment.firstName || 'Unknown',
          lastName: comment.lastName || 'User',
          username: comment.username || 'unknown'
        },
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        source: 'MySQL'
      }));
      
      comments = [...comments, ...formattedMySQLComments];
    } catch (error) {
      console.error('Error fetching MySQL user comments:', error.message);
    }
    
    // Sort by createdAt in descending order
    comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return res.status(200).json({
      comments,
      count: comments.length
    });
  } catch (error) {
    console.error('Error fetching user comments:', error.message);
    return res.status(500).json({
      message: 'Server error while fetching user comments',
      error: error.message
    });
  }
};