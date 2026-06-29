const express = require('express');
const { body, validationResult } = require('express-validator');
const Sheet = require('../models/Sheet');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/sheets
// @desc    Get sheets (users see only their own, admins see all)
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { search, createdBy, dateFilter } = req.query;

    // Build query based on user role
    let query = {};

    // Users can only see their own sheets
    if (req.user.role === 'user') {
      query.createdBy = req.user._id;
    }
    // Admins can see all sheets, optionally filtered to a specific agent
    else if (createdBy && createdBy.trim()) {
      query.createdBy = createdBy;
    }

    // Search by sheet name
    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' };
    }

    // Date filter
    if (dateFilter && dateFilter !== 'all-time') {
      const now = new Date();
      let startDate;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          query.createdAt = { $gte: startDate };
          break;
        case 'this-week': {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          query.createdAt = { $gte: startOfWeek };
          break;
        }
        case 'this-month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          query.createdAt = { $gte: startDate };
          break;
        case 'last-month': {
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          query.createdAt = { $gte: lastMonthStart, $lte: lastMonthEnd };
          break;
        }
        case 'this-year':
          startDate = new Date(now.getFullYear(), 0, 1);
          query.createdAt = { $gte: startDate };
          break;
      }
    }

    const [sheets, total] = await Promise.all([
      Sheet.find(query)
        .populate('createdBy', 'name email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sheet.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        sheets,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Fetch sheets error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   GET /api/sheets/:id
// @desc    Get a single sheet (owner or admin)
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const sheet = await Sheet.findById(req.params.id).populate(
      'createdBy',
      'name email'
    );

    if (!sheet) {
      return res
        .status(404)
        .json({ success: false, message: 'Sheet not found' });
    }

    // Users can only access their own sheets
    if (
      req.user.role === 'user' &&
      sheet.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: sheet });
  } catch (error) {
    console.error('Fetch sheet error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/sheets
// @desc    Create a sheet
// @access  Private
router.post(
  '/',
  [authenticateToken, body('name').trim().notEmpty().withMessage('Name is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      const { name, content } = req.body;

      const sheet = await Sheet.create({
        name,
        content: content || '',
        createdBy: req.user._id,
      });

      const populated = await sheet.populate('createdBy', 'name email');

      res.status(201).json({
        success: true,
        message: 'Sheet created successfully',
        data: populated,
      });
    } catch (error) {
      console.error('Create sheet error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

// @route   PUT /api/sheets/:id
// @desc    Update a sheet (owner or admin)
// @access  Private
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const sheet = await Sheet.findById(req.params.id);

    if (!sheet) {
      return res
        .status(404)
        .json({ success: false, message: 'Sheet not found' });
    }

    // Users can only update their own sheets; admins can update any
    if (
      req.user.role === 'user' &&
      sheet.createdBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { name, content } = req.body;

    if (name !== undefined) {
      if (!name.trim()) {
        return res
          .status(400)
          .json({ success: false, message: 'Name is required' });
      }
      sheet.name = name.trim();
    }
    if (content !== undefined) {
      sheet.content = content;
    }

    await sheet.save();
    const populated = await sheet.populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'Sheet updated successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Update sheet error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   DELETE /api/sheets/:id
// @desc    Delete a sheet (owner or admin)
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const sheet = await Sheet.findById(req.params.id);

    if (!sheet) {
      return res
        .status(404)
        .json({ success: false, message: 'Sheet not found' });
    }

    // Users can only delete their own sheets; admins can delete any
    if (
      req.user.role === 'user' &&
      sheet.createdBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await sheet.deleteOne();

    res.json({ success: true, message: 'Sheet deleted successfully' });
  } catch (error) {
    console.error('Delete sheet error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
