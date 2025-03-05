// config/mysql.js
const { Sequelize } = require('sequelize');

// Create Sequelize instance with your MySQL database details from .env
const sequelize = new Sequelize(
  process.env.DB_NAME || 'authdb',
  process.env.DB_USER || 'root',
  process.env.DB_PASS || 'admin',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false, // Disable logging for production
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Test the connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('MySQL connection established successfully.');
    return true;
  } catch (error) {
    console.error('Unable to connect to MySQL database:', error);
    return false;
  }
};

module.exports = sequelize;
module.exports.testConnection = testConnection;