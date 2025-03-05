// config/db.js
const mongoose = require('mongoose');
const sequelize = require('./mysql');
const mysql = require('mysql2/promise');

// Create a MySQL connection pool
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'admin',
  database: process.env.DB_NAME || 'authdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(poolConfig);

// Connect to MongoDB
const connectMongo = async () => {
  try {
    // Use the MONGODB_URI from your .env file
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/auth_app';
    
    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB Connected Successfully!');
    return true;
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
    return false;
  }
};

// Connect to MySQL
const connectMySQL = async () => {
  try {
    // Use the DB_* variables from your .env file
    console.log('Connecting to MySQL...');
    
    await sequelize.authenticate();
    
    console.log('MySQL Connected Successfully!');
    return true;
  } catch (err) {
    console.error('MySQL Connection Error:', err.message);
    return false;
  }
};

// Test the pool connection
const testPoolConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL pool connection established successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL pool connection error:', error.message);
    return false;
  }
};

module.exports = {
  connectMongo,
  connectMySQL,
  pool,
  testPoolConnection
};