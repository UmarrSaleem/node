// app.js
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const dotenv = require('dotenv');
const cors = require('cors');
const { connectMongo, connectMySQL } = require('./config/db');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Configure CORS
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:4000',
    'http://authintaction-app.s3-website-us-east-1.amazonaws.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  credentials: true
}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Import routes
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const commentsRouter = require('./routes/comments');
const testRouter = require('./routes/test');

// Mount API routes
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api/auth', authRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/test', testRouter);

// Add simple test endpoint to check API
app.get('/api-status', (req, res) => {
  res.json({ status: 'API is running', time: new Date().toISOString() });
});

// Connect to databases
Promise.allSettled([
  connectMongo(),
  connectMySQL()
]).then(results => {
  console.log('Database connection attempts completed');
  
  // Log connection results
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Database connection ${index} failed:`, result.reason);
    } else {
      console.log(`Database connection ${index} succeeded`);
    }
  });
  
  // Create MySQL tables if they don't exist
  try {
    const { MySQLComment } = require('./models/Comment');
    MySQLComment.createTable().then(success => {
      if (success) {
        console.log('MySQL tables initialization complete');
      }
    }).catch(err => {
      console.error('Error initializing MySQL tables:', err);
    });
  } catch (err) {
    console.error('Error requiring MySQL models:', err);
  }
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  console.log(`404 Not Found: ${req.method} ${req.url}`);
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Log the error
  console.error('Error:', err);

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;