const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const EventEmitter = require('events');

// Load environment variables from the backend folder's .env regardless of the
// directory `node` was started from (prevents "env not loaded" surprises).
dotenv.config({ path: path.join(__dirname, '.env') });

// Create global event emitter
const events = require('./events');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const clientRoutes = require('./routes/clients');
const leadFormRoutes = require('./routes/leadForms');
const lookupRoutes = require('./routes/lookup');
const userFileRoutes = require('./routes/userFiles');
const sheetRoutes = require('./routes/sheets');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://13.51.165.117',
      'https://unicall-frontend.vercel.app',
      'https://unicallsolution.com',
      'https://www.unicallsolution.com',
      process.env.CLIENT_URL,
    ].filter(Boolean),
    credentials: true,
  })
);
// Gzip-compress all responses — smaller payloads = faster over the network
app.use(compression());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directories exist (created on a fresh deploy)
const fs = require('fs');
['uploads', 'uploads/avatars', 'uploads/lead-forms', 'uploads/user-files'].forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Serve static files from uploads directory.
// Cache uploaded images/files in the browser so repeat loads are instant.
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    maxAge: '7d',
    etag: true,
  })
);

// Connect to MongoDB — cache the connection across (serverless) invocations so
// we don't pay a fresh TLS handshake / new pool on every request or cold start.
mongoose.set('strictQuery', true);

let cached = global.__mongooseConn;
if (!cached) cached = global.__mongooseConn = { promise: null };

const connectDB = () => {
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
    });
  }
  return cached.promise;
};

connectDB()
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => {
    cached.promise = null; // allow a retry on the next invocation
    console.error('MongoDB connection error:', error);
  });

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://13.51.165.117',
      'https://unicall-frontend.vercel.app',
      'https://unicallsolution.com',
      'https://www.unicallsolution.com',
      process.env.CLIENT_URL,
    ].filter(Boolean),
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
app.use('/api/sheets', sheetRoutes);

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

// Only listen when not running on Vercel
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
