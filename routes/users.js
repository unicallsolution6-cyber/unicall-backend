const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const events = require('../events');

const router = express.Router();

// Configure multer for profile image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/avatars/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Allow only image files
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only JPEG, PNG, and GIF images are allowed.'
        )
      );
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private (Admin)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search, role, dateFilter } = req.query;

    console.log('Users query parameters:', req.query);

    // Build query
    let query = { isActive: true };

    // Search filter
    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // Role filter
    if (role && role !== 'all') {
      query.role = role;
    }

    // Date filter
    if (dateFilter && dateFilter !== 'all-time') {
      const now = new Date();
      let startDate;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          query.createdAt = { $gte: startDate };
          break;
        case 'this-week':
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          query.createdAt = { $gte: startOfWeek };
          break;
        case 'this-month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          query.createdAt = { $gte: startDate };
          break;
        case 'last-month':
          const lastMonthStart = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
          );
          const lastMonthEnd = new Date(
            now.getFullYear(),
            now.getMonth(),
            0,
            23,
            59,
            59
          );
          query.createdAt = { $gte: lastMonthStart, $lte: lastMonthEnd };
          break;
        case 'this-year':
          startDate = new Date(now.getFullYear(), 0, 1);
          query.createdAt = { $gte: startDate };
          break;
      }
    }

    console.log(
      'Built MongoDB query for users:',
      JSON.stringify(query, null, 2)
    );

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await User.countDocuments(query);

    console.log(
      `Found ${users.length} users out of ${total} total matching filters`
    );

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalUsers: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching users',
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID (admin only)
// @access  Private (Admin)
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user',
    });
  }
});

// @route   POST /api/users
// @desc    Create new user (admin only)
// @access  Private (Admin)
router.post(
  '/',
  [
    authenticateToken,
    requireAdmin,
    body('name')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('role')
      .optional()
      .isIn(['user', 'admin'])
      .withMessage('Role must be either user or admin'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { name, email, password, role = 'user' } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email',
        });
      }

      // Create user
      const user = new User({
        name,
        email,
        password,
        role,
      });

      await user.save();

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: { user },
      });
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error creating user',
      });
    }
  }
);

// @route   PUT /api/users/:id
// @desc    Update user (admin only)
// @access  Private (Admin)
router.put(
  '/:id',
  [
    authenticateToken,
    requireAdmin,
    upload.single('avatar'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('role')
      .optional()
      .isIn(['user', 'admin'])
      .withMessage('Role must be either user or admin'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { name, email, role, isActive, password, phone, removeImage } =
        req.body;

      // Check if user exists
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check if email is being changed and already exists
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email already exists',
          });
        }
      }

      // Update user
      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (role) updateData.role = role;
      if (phone !== undefined) updateData.phone = phone;
      if (typeof isActive === 'boolean') updateData.isActive = isActive;

      // Handle avatar upload or removal
      if (req.file) {
        // New avatar uploaded
        updateData.avatar = `/uploads/avatars/${req.file.filename}`;

        // Delete old avatar if it exists and isn't the default
        if (user.avatar && user.avatar !== '/user.png') {
          const oldAvatarPath = path.join(__dirname, '../..', user.avatar);
          if (fs.existsSync(oldAvatarPath)) {
            fs.unlinkSync(oldAvatarPath);
          }
        }
      } else if (removeImage === 'true') {
        // Remove current avatar
        if (user.avatar && user.avatar !== '/user.png') {
          const oldAvatarPath = path.join(__dirname, '../..', user.avatar);
          if (fs.existsSync(oldAvatarPath)) {
            fs.unlinkSync(oldAvatarPath);
          }
        }
        updateData.avatar = '/user.png'; // Reset to default
      }

      // Hash password if provided
      if (password) {
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(password, salt);
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        success: true,
        message: 'User updated successfully',
        data: { user: updatedUser },
      });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating user',
      });
    }
  }
);

// @route   DELETE /api/users/:id
// @desc    Deactivate user (admin only)
// @access  Private (Admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Don't allow admin to deactivate themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account',
      });
    }

    // Soft delete - just deactivate
    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deactivating user',
    });
  }
});

// @route   POST /api/users/logout-all
// @desc    Logout all users by updating their token invalidation timestamp (admin only)
// @access  Private (Admin)
router.post(
  '/logout-all',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      console.log('Admin requesting to logout all users:', req.user.email);

      // Update all active users with a logout timestamp
      // This will be used to invalidate tokens issued before this time
      const logoutTimestamp = new Date();

      const result = await User.updateMany(
        { isActive: true, _id: { $ne: req.user._id } }, // Don't logout the admin performing the action
        {
          $set: {
            lastLogoutAll: logoutTimestamp,
            updatedAt: logoutTimestamp,
          },
        }
      );

      events.emit('logoutAll', {
        exceptUserId: req.user._id.toString(),
        timestamp: logoutTimestamp,
      });

      console.log(
        `Logout all users completed. ${result.modifiedCount} users logged out.`
      );

      res.json({
        success: true,
        data: {
          loggedOutUsers: result.modifiedCount,
          timestamp: logoutTimestamp,
        },
        message: `Successfully logged out ${result.modifiedCount} users`,
      });
    } catch (error) {
      console.error('Logout all users error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error logging out users',
      });
    }
  }
);

module.exports = router;
