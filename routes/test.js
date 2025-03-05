// routes/test.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Test endpoint to verify API is working
router.get('/', (req, res) => {
  res.json({
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    env: {
      node_env: process.env.NODE_ENV,
      port: process.env.PORT
    }
  });
});

// Test MongoDB connection
router.get('/mongo', async (req, res) => {
  try {
    // Check if mongoose is connected
    const isConnected = mongoose.connection.readyState === 1;
    
    if (isConnected) {
      res.json({
        status: 'success',
        message: 'MongoDB is connected',
        dbName: mongoose.connection.db.databaseName
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'MongoDB is not connected',
        readyState: mongoose.connection.readyState
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error checking MongoDB connection',
      error: error.message
    });
  }
});

// Test MySQL connection
router.get('/mysql', async (req, res) => {
  try {
    const sequelize = require('../config/mysql');
    await sequelize.authenticate();
    
    res.json({
      status: 'success',
      message: 'MySQL is connected',
      config: {
        database: sequelize.config.database,
        host: sequelize.config.host,
        dialect: sequelize.config.dialect
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error checking MySQL connection',
      error: error.message
    });
  }
});

// Add a test comment to MongoDB
router.post('/add-test-comment', async (req, res) => {
  try {
    const { MongoComment } = require('../models/Comment');
    const userId = req.body.userId || '65fb25b1d15c8b3368f0e9f1'; // Default test user ID
    
    const comment = await MongoComment.create({
      content: "This is a test comment created at " + new Date().toISOString(),
      author: mongoose.Types.ObjectId(userId)
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Test comment created in MongoDB',
      comment
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error creating test comment',
      error: error.message
    });
  }
});

module.exports = router;