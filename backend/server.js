require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();

// Connect to MongoDB
connectDB();

// ===== MIDDLEWARE =====
app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ===== ROUTES =====
app.use('/api/auth', require('./routes/auth'));
app.use('/api/scans', require('./routes/scans'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '🛡️ ReputGuard API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🛡️  ReputGuard Backend running on http://localhost:${PORT}`);
  console.log(`📡  API Health: http://localhost:${PORT}/api/health`);
  console.log(`🌍  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
