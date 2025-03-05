// models/Comment.js
const mongoose = require('mongoose');
const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql');

// MongoDB Comment Schema
const CommentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  edited: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create MongoDB Comment model
const MongoComment = mongoose.model('Comment', CommentSchema);

// MySQL Comment Model
const MySQLComment = sequelize.define('Comment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  mongo_user_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mongo_comment_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  mongo_parent_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  edited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'comments',
  timestamps: false
});

// Create table if it doesn't exist
MySQLComment.createTable = async function() {
  try {
    await sequelize.sync({ alter: true });
    console.log('MySQL Comments table is ready');
    return true;
  } catch (error) {
    console.error('Error creating MySQL Comments table:', error);
    return false;
  }
};

// Find all MySQL comments
MySQLComment.findAllWithUsers = async function() {
  try {
    // Try advanced query with joins first
    try {
      const query = `
        SELECT 
          c.id, 
          c.content, 
          c.user_id, 
          c.parent_id,
          c.mongo_parent_id,
          c.edited, 
          c.created_at, 
          c.updated_at,
          u.firstName, 
          u.lastName, 
          u.username
        FROM 
          comments c
        LEFT JOIN 
          users u ON c.user_id = u.id
        ORDER BY 
          c.created_at DESC
      `;
      
      const results = await sequelize.query(query, { 
        type: sequelize.QueryTypes.SELECT,
        raw: true
      });
      
      return results;
    } catch (joinError) {
      console.error('Error with joined query:', joinError);
      
      // Fallback to simple query without join
      const fallbackQuery = `
        SELECT 
          id, 
          content, 
          user_id,
          parent_id,
          mongo_parent_id,
          edited, 
          created_at, 
          updated_at
        FROM 
          comments
        ORDER BY
          created_at DESC
      `;
      
      const results = await sequelize.query(fallbackQuery, {
        type: sequelize.QueryTypes.SELECT,
        raw: true
      });
      
      return results;
    }
  } catch (error) {
    console.error('Error finding MySQL comments:', error);
    return [];
  }
};

// Add the missing createComment method that's used in commentController.js
MySQLComment.createComment = async function(commentData) {
  try {
    // First, get user information if available
    let firstName = null;
    let lastName = null;
    let username = null;
    
    if (commentData.userId) {
      try {
        const query = `SELECT firstName, lastName, username FROM users WHERE id = ?`;
        const [userResults] = await sequelize.query(query, {
          replacements: [commentData.userId],
          type: sequelize.QueryTypes.SELECT,
          raw: true
        });
        
        if (userResults) {
          firstName = userResults.firstName;
          lastName = userResults.lastName;
          username = userResults.username;
        }
      } catch (userError) {
        console.error('Error fetching user info for comment:', userError.message);
        // Continue with null values
      }
    }
    
    // Insert the comment
    const query = `
      INSERT INTO comments 
        (content, user_id, mongo_user_id, parent_id, mongo_parent_id, first_name, last_name, username, edited, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await sequelize.query(query, {
      replacements: [
        commentData.content,
        commentData.userId,
        commentData.mongoUserId || null,
        commentData.parentId || null,
        commentData.mongoParentId || null,
        firstName,
        lastName,
        username,
        false, // not edited initially
        new Date(),
        new Date()
      ],
      type: sequelize.QueryTypes.INSERT
    });
    
    return result;
  } catch (error) {
    console.error('Error creating MySQL comment:', error);
    throw error;
  }
};

// Helper function to get all comments
MySQLComment.getAllComments = async function() {
  try {
    // Check if the users table exists first
    try {
      const tableCheckQuery = `
        SELECT COUNT(*) as table_exists 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'users'
      `;
      
      const [tableCheck] = await sequelize.query(tableCheckQuery, {
        type: sequelize.QueryTypes.SELECT,
        raw: true
      });
      
      if (!tableCheck || !tableCheck.table_exists) {
        throw new Error('Users table does not exist');
      }
    } catch (tableError) {
      console.error('Error checking users table:', tableError);
      throw tableError;
    }
    
    // Then try a simple query first without joins to check column names
    const simpleQuery = `
      SELECT * FROM users LIMIT 1
    `;
    
    try {
      const [userSample] = await sequelize.query(simpleQuery, {
        type: sequelize.QueryTypes.SELECT,
        raw: true
      });
      
      console.log('User sample:', userSample);
      
      // Determine which columns exist in the users table
      let userNameFields;
      
      if (userSample) {
        const hasFirstName = 'firstName' in userSample;
        const hasFirstNameSnake = 'first_name' in userSample;
        const hasLastName = 'lastName' in userSample;
        const hasLastNameSnake = 'last_name' in userSample;
        
        // Decide which fields to use in the query
        if (hasFirstName && hasLastName) {
          userNameFields = `u.firstName, u.lastName, u.username`;
        } else if (hasFirstNameSnake && hasLastNameSnake) {
          userNameFields = `u.first_name AS firstName, u.last_name AS lastName, u.username`;
        } else {
          // Fallback if expected name columns don't exist
          userNameFields = `NULL AS firstName, NULL AS lastName, u.username`;
        }
      } else {
        // If no user rows exist, use a safe fallback
        userNameFields = `NULL AS firstName, NULL AS lastName, NULL AS username`;
      }
      
      // Construct the main query
      const query = `
        SELECT 
          c.id, 
          c.content, 
          c.user_id as userId,
          c.parent_id as parentId,
          c.edited, 
          c.created_at as createdAt, 
          c.updated_at as updatedAt,
          ${userNameFields}
        FROM 
          comments c
        LEFT JOIN 
          users u ON c.user_id = u.id
        ORDER BY
          c.created_at DESC
      `;
      
      const results = await sequelize.query(query, { 
        type: sequelize.QueryTypes.SELECT,
        raw: true
      });
      
      return results;
      
    } catch (queryError) {
      console.error('Error with column detection or joined query:', queryError);
      
      // Fallback to a simple query without the join if there's an error
      const fallbackQuery = `
        SELECT 
          id, 
          content, 
          user_id as userId,
          parent_id as parentId,
          edited, 
          created_at as createdAt, 
          updated_at as updatedAt
        FROM 
          comments
        ORDER BY
          created_at DESC
      `;
      
      const results = await sequelize.query(fallbackQuery, {
        type: sequelize.QueryTypes.SELECT,
        raw: true
      });
      
      return results;
    }
  } catch (error) {
    console.error('Error finding MySQL comments:', error);
    
    // Last resort fallback - return empty array
    return [];
  }
};

// Get comment by ID
MySQLComment.getCommentById = async function(id) {
  try {
    const query = `
      SELECT 
        c.id, 
        c.content, 
        c.user_id as userId,
        c.parent_id as parentId,
        c.edited, 
        c.created_at as createdAt, 
        c.updated_at as updatedAt
      FROM 
        comments c
      WHERE
        c.id = ?
    `;
    
    const [results] = await sequelize.query(query, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT,
      raw: true
    });
    
    return results;
  } catch (error) {
    console.error('Error fetching MySQL comment by ID:', error);
    return null;
  }
};

// Update comment
MySQLComment.updateComment = async function(id, content) {
  try {
    const query = `
      UPDATE comments
      SET content = ?, updated_at = ?, edited = TRUE
      WHERE id = ?
    `;
    
    await sequelize.query(query, {
      replacements: [content, new Date(), id],
      type: sequelize.QueryTypes.UPDATE
    });
    
    return true;
  } catch (error) {
    console.error('Error updating MySQL comment:', error);
    return false;
  }
};

// Delete comment
MySQLComment.deleteComment = async function(id) {
  try {
    const query = `DELETE FROM comments WHERE id = ?`;
    
    await sequelize.query(query, {
      replacements: [id],
      type: sequelize.QueryTypes.DELETE
    });
    
    return true;
  } catch (error) {
    console.error('Error deleting MySQL comment:', error);
    return false;
  }
};

// Get comments by user ID
MySQLComment.getCommentsByUserId = async function(userId) {
  try {
    const query = `
      SELECT 
        c.id, 
        c.content, 
        c.user_id as userId,
        c.parent_id as parentId,
        c.edited, 
        c.created_at as createdAt, 
        c.updated_at as updatedAt
      FROM 
        comments c
      WHERE
        c.user_id = ?
      ORDER BY
        c.created_at DESC
    `;
    
    const results = await sequelize.query(query, {
      replacements: [userId],
      type: sequelize.QueryTypes.SELECT,
      raw: true
    });
    
    return results;
  } catch (error) {
    console.error('Error fetching MySQL comments by user ID:', error);
    return [];
  }
};

module.exports = { MongoComment, MySQLComment };