const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const EventEmitter = require('events');

// Load environment variables
dotenv.config();

// Create global event emitter
const events = require('./events');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const clientRoutes = require('./routes/clients');
const leadFormRoutes = require('./routes/leadForms');
const lookupRoutes = require('./routes/lookup');
const userFileRoutes = require('./routes/userFiles');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://13.51.165.117',
    ], // Next.js default ports
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://13.51.165.117',
    ],
    credentials: true,
  },
});

// Store io instance globally so routes can use it
app.set('io', io);

// Track user IDs with sockets
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('registerUser', (userId) => {
    socket.userId = userId;
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Listen for global logout event
events.on('logoutAll', ({ exceptUserId, timestamp }) => {
  console.log('logout all event received');
  io.sockets.sockets.forEach((sock) => {
    if (sock.userId && sock.userId !== exceptUserId) {
      sock.emit('forceLogout', { timestamp });
    }
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use(
  '/api/users',
  (req, res, next) => {
    req.events = events;
    next();
  },
  userRoutes
);
app.use('/api/clients', clientRoutes);
app.use('/api/lead-forms', leadFormRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/user-files', userFileRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, events };
