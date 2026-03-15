const express = require('express');
const { body, validationResult } = require('express-validator');
const Client = require('../models/Client');
const { authenticateToken, requireUser } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/clients
// @desc    Get clients (users see only their clients, admins see all)
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { bank, status, search, createdBy, dateFilter } = req.query;

    console.log('Clients query parameters:', req.query);

    // Build query based on user role
    let query = {};
    
    // Users can only see their own clients
    if (req.user.role === 'user') {
      query.createdBy = req.user._id;
    }
    // Admins can see all clients (no filter on createdBy unless specified)

    // Apply filters
    if (bank) query.bank = bank;
    if (status) query.status = status;

    // Search filter
    if (search && search.trim()) {
      query.$or = [
        { firstName: { $regex: search.trim(), $options: 'i' } },
        { lastName: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
        { phone: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    // User filter (for admin only)
    if (createdBy && createdBy.trim() && req.user.role === 'admin') {
      query.createdBy = createdBy;
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
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          query.createdAt = { $gte: lastMonthStart, $lte: lastMonthEnd };
          break;
        case 'this-year':
          startDate = new Date(now.getFullYear(), 0, 1);
          query.createdAt = { $gte: startDate };
          break;
      }
    }

    console.log('Built MongoDB query:', JSON.stringify(query, null, 2));

    const clients = await Client.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Client.countDocuments(query);

    console.log(`Found ${clients.length} clients out of ${total} total`);

    res.json({
      success: true,
      data: {
        clients,
        total,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalClients: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching clients'
    });
  }
});

// @route   GET /api/clients/dashboard-metrics
// @desc    Get dashboard metrics for clients (role-based)
// @access  Private
router.get('/dashboard-metrics', authenticateToken, async (req, res) => {
  try {
    const { dateFilter } = req.query;
    console.log('Dashboard metrics query parameters:', req.query);

    // Build base query based on user role
    let baseQuery = {};
    
    // Users can only see their own clients
    if (req.user.role === 'user') {
      baseQuery.createdBy = req.user._id;
    }
    // Admins can see all clients

    // Apply date filter
    if (dateFilter && dateFilter !== 'all-time') {
      const now = new Date();
      let startDate;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          baseQuery.createdAt = { $gte: startDate };
          break;
        case 'this-week':
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          baseQuery.createdAt = { $gte: startOfWeek };
          break;
        case 'this-month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          baseQuery.createdAt = { $gte: startDate };
          break;
        case 'last-month':
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          baseQuery.createdAt = { $gte: lastMonthStart, $lte: lastMonthEnd };
          break;
        case 'this-year':
          startDate = new Date(now.getFullYear(), 0, 1);
          baseQuery.createdAt = { $gte: startDate };
          break;
      }
    }

    console.log('Built base query for metrics:', JSON.stringify(baseQuery, null, 2));

    // Get total counts for each status
    const [totalClients, paidWire, pending, followup, deactivated] = await Promise.all([
      Client.countDocuments(baseQuery),
      Client.countDocuments({ ...baseQuery, status: 'paid-wire' }),
      Client.countDocuments({ ...baseQuery, status: 'pending' }),
      Client.countDocuments({ ...baseQuery, status: 'followup' }),
      Client.countDocuments({ ...baseQuery, status: 'deactivated' })
    ]);

    // For calculating percentage changes, we would need historical data
    // For now, returning basic metrics
    const metrics = {
      totalClients,
      paidWire,
      pending,
      followup,
      deactivated,
      // TODO: Calculate percentage changes based on previous period
      totalClientsChange: "+0.00%",
      paidWireChange: "+0.00%",
      pendingChange: "+0.00%",
      followupChange: "+0.00%",
      deactivatedChange: "+0.00%"
    };

    console.log('Dashboard metrics calculated:', metrics);

    res.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    console.error('Get dashboard metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching dashboard metrics'
    });
  }
});

// @route   GET /api/clients/:id
// @desc    Get client by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    let query = { _id: req.params.id };
    
    // Users can only see their own clients
    if (req.user.role === 'user') {
      query.createdBy = req.user._id;
    }

    const client = await Client.findOne(query)
      .populate('createdBy', 'name email');
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    res.json({
      success: true,
      data: { client }
    });

  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching client'
    });
  }
});

// @route   POST /api/clients
// @desc    Create new client (users only)
// @access  Private (User)
router.post('/', [
  authenticateToken,
  requireUser, // Only users can create clients
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  // Optional fields - no validation required
  body('phone').optional().trim(),
  body('cell').optional().trim(),
  body('ssn').optional().trim(),
  body('dob').optional().trim(),
  body('mmn').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('zipCode').optional().trim(),
  body('routingNumber').optional().trim(),
  body('accountNumber').optional().trim(),
  body('dlNumber').optional().trim(),
  body('dlClass').optional().trim(),
  body('issueDate').optional().trim(),
  body('expDate').optional().trim(),
  body('eyeColor').optional().trim(),
  body('height').optional().trim(),
  body('bank').optional().isIn(['chase', 'bofa', 'wells', 'citi', 'mixed']),
  body('status').optional().isIn(['paid-wire', 'pending', 'followup', 'deactivated']),
  body('notes').optional().trim(),
  body('bank')
    .isIn(['chase', 'bofa', 'wells', 'citi', 'mixed'])
    .withMessage('Invalid bank selection'),
  body('status')
    .optional()
    .isIn(['paid-wire', 'pending', 'followup', 'deactivated'])
    .withMessage('Invalid status'),
  body('cards')
    .optional()
    .isArray()
    .withMessage('Cards must be an array'),
  body('cards.*.cardHolderName')
    .optional()
    .trim()
    .isString()
    .withMessage('Card holder name must be a string'),
  body('cards.*.cardNumber')
    .optional()
    .trim()
    .isString()
    .withMessage('Card number must be a string'),
  body('cards.*.expiryDate')
    .optional()
    .trim()
    .isString()
    .withMessage('Expiry date must be a string'),
  body('cards.*.cvv')
    .optional()
    .trim()
    .isString()
    .withMessage('CVV must be a string'),
  body('cards.*.cardType')
    .optional()
    .isIn(['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'UNKNOWN'])
    .withMessage('Invalid card type'),
  body('notes')
    .optional()
    .trim()
    .isString()
    .withMessage('Notes must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const clientData = {
      ...req.body,
      createdBy: req.user._id
    };

    const client = new Client(clientData);
    await client.save();

    // Populate the created client with creator info
    await client.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: { client }
    });

  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating client'
    });
  }
});

// @route   PUT /api/clients/:id
// @desc    Update client (users can only update their own clients)
// @access  Private
router.put('/:id', [
  authenticateToken,
  body('firstName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('First name cannot be empty'),
  body('lastName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Last name cannot be empty'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  // Optional fields for all the new client data
  body('phone').optional().trim(),
  body('cell').optional().trim(),
  body('ssn').optional().trim(),
  body('dob').optional().trim(),
  body('mmn').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('zipCode').optional().trim(),
  body('routingNumber').optional().trim(),
  body('accountNumber').optional().trim(),
  body('dlNumber').optional().trim(),
  body('dlClass').optional().trim(),
  body('issueDate').optional().trim(),
  body('expDate').optional().trim(),
  body('eyeColor').optional().trim(),
  body('height').optional().trim(),
  body('bank')
    .optional()
    .isIn(['chase', 'bofa', 'wells', 'citi', 'mixed'])
    .withMessage('Invalid bank selection'),
  body('status')
    .optional()
    .isIn(['paid-wire', 'pending', 'followup', 'deactivated'])
    .withMessage('Invalid status'),
  body('cards')
    .optional()
    .isArray()
    .withMessage('Cards must be an array'),
  body('cards.*.cardHolderName')
    .optional()
    .trim()
    .isString()
    .withMessage('Card holder name must be a string'),
  body('cards.*.cardNumber')
    .optional()
    .trim()
    .isString()
    .withMessage('Card number must be a string'),
  body('cards.*.expiryDate')
    .optional()
    .trim()
    .isString()
    .withMessage('Expiry date must be a string'),
  body('cards.*.cvv')
    .optional()
    .trim()
    .isString()
    .withMessage('CVV must be a string'),
  body('cards.*.cardType')
    .optional()
    .isIn(['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'UNKNOWN'])
    .withMessage('Invalid card type'),
  body('notes')
    .optional()
    .trim()
    .isString()
    .withMessage('Notes must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    let query = { _id: req.params.id };
    
    // Users can only update their own clients
    if (req.user.role === 'user') {
      query.createdBy = req.user._id;
    }

    const client = await Client.findOneAndUpdate(
      query,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found or you do not have permission to update this client'
      });
    }

    res.json({
      success: true,
      message: 'Client updated successfully',
      data: { client }
    });

  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating client'
    });
  }
});

// @route   DELETE /api/clients/:id
// @desc    Delete client (users can only delete their own clients)
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    let query = { _id: req.params.id };
    
    // Users can only delete their own clients
    if (req.user.role === 'user') {
      query.createdBy = req.user._id;
    }

    const client = await Client.findOneAndDelete(query);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found or you do not have permission to delete this client'
      });
    }

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });

  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting client'
    });
  }
});

// @route   GET /api/clients/stats/dashboard
// @desc    Get client statistics for dashboard
// @access  Private
router.get('/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    let matchQuery = {};
    
    // Users can only see stats for their own clients
    if (req.user.role === 'user') {
      matchQuery.createdBy = req.user._id;
    }

    // Get stats by bank
    const bankStats = await Client.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$bank',
          count: { $sum: 1 },
          statusBreakdown: {
            $push: '$status'
          }
        }
      }
    ]);

    // Get stats by status
    const statusStats = await Client.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalClients = await Client.countDocuments(matchQuery);

    res.json({
      success: true,
      data: {
        totalClients,
        bankStats,
        statusStats
      }
    });

  } catch (error) {
    console.error('Get client stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching client statistics'
    });
  }
});

module.exports = router;
