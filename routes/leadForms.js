const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const LeadForm = require('../models/LeadForm');
const UnstructuredLeadForm = require('../models/UnstructuredLeadForm');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/lead-forms/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    // More permissive MIME type checking for text files
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/octet-stream',
    ];

    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      console.log('Rejected file:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        extname: path.extname(file.originalname).toLowerCase(),
      });
      cb(
        new Error(
          'Invalid file type. Only images (JPEG, PNG), PDFs, documents (DOC, DOCX), and text files (TXT) are allowed.'
        )
      );
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// @route   GET /api/lead-forms
// @desc    Get lead forms (admins see all, users see only assigned to them)
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search, assignedTo, dateFilter, bank, cardType } =
      req.query;

    // Build query
    let query = {};

    // Role-based filtering
    if (req.user.role === 'user') {
      if (assignedTo && assignedTo.trim()) {
        query.assignee = assignedTo;
      } else {
        query.$or = [
          { assignee: req.user.id },
          { assignee: { $exists: false } },
          { assignee: null },
        ];
      }
    } else if (req.user.role === 'admin' && assignedTo && assignedTo.trim()) {
      query.assignee = assignedTo;
    }

    // Additional filters
    if (status) query.status = status;
    if (bank) query.bank = bank;
    if (cardType) query.cardType = cardType;

    // Search filter
    if (search && search.trim()) {
      const searchConditions = [
        { fullName: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
        { phone: { $regex: search.trim(), $options: 'i' } },
        { cardNumber: { $regex: search.trim(), $options: 'i' } },
      ];

      if (query.$or) {
        const assigneeConditions = query.$or;
        query.$and = [{ $or: assigneeConditions }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
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

    const leadForms = await LeadForm.find(query)
      .populate('assignee', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await LeadForm.countDocuments(query);

    res.json({
      success: true,
      data: {
        leadForms,
        total,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalLeadForms: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('Get lead forms error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching lead forms',
    });
  }
});

// @route   GET /api/lead-forms/unstructured
// @desc    Get unstructured lead forms (admins see all, users see only assigned to them)
// @access  Private
router.get('/unstructured-lead-forms', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search, assignedTo, dateFilter, type } = req.query;

    // Build query
    let query = {};

    if (type) query.type = type;

    // Role-based filtering
    if (req.user.role === 'user') {
      if (assignedTo && assignedTo.trim()) {
        query.assignee = assignedTo;
      } else {
        query.$or = [
          { assignee: req.user.id },
          { assignee: { $exists: false } },
          { assignee: null },
        ];
      }
    } else if (req.user.role === 'admin' && assignedTo && assignedTo.trim()) {
      query.assignee = assignedTo;
    }

    // Additional filters
    if (status) query.dialingStatus = status;

    // Search filter
    if (search && search.trim()) {
      const searchConditions = [
        { 'rawData.line': { $regex: search.trim(), $options: 'i' } },
        { rawData: { $regex: search.trim(), $options: 'i' } },
        { fileName: { $regex: search.trim(), $options: 'i' } },
      ];

      if (query.$or) {
        const assigneeConditions = query.$or;
        query.$and = [{ $or: assigneeConditions }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
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

    const unstructuredForms = await UnstructuredLeadForm.find(query)
      .populate('assignee', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await UnstructuredLeadForm.countDocuments(query);

    res.json({
      success: true,
      data: {
        unstructuredForms,
        total,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalUnstructuredForms: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('Get unstructured lead forms error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching unstructured lead forms',
    });
  }
});

// @route   GET /api/lead-forms/:id
// @desc    Get lead form by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const leadForm = await LeadForm.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignee', 'name email');

    if (!leadForm) {
      return res.status(404).json({
        success: false,
        message: 'Lead form not found',
      });
    }

    res.json({
      success: true,
      data: { leadForm },
    });
  } catch (error) {
    console.error('Get lead form error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching lead form',
    });
  }
});

// @route   POST /api/lead-forms/bulk-upload
// @desc    Bulk upload lead forms from text file (admin only)
// @access  Private (Admin)
router.post(
  '/bulk-upload',
  [authenticateToken, requireAdmin, upload.single('file')],
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      // only allow text files (for now)
      if (
        req.file.mimetype !== 'text/plain' &&
        path.extname(req.file.originalname) !== '.txt'
      ) {
        return res.status(400).json({
          success: false,
          message: 'Only .txt files are allowed',
        });
      }

      const filePath = req.file.path;
      const fileContent = fs.readFileSync(filePath, 'utf8');

      const lines = fileContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');

      const results = {
        total: lines.length,
        structured: 0,
        unstructured: 0,
        failed: 0,
        errors: [],
      };

      for (const [index, line] of lines.entries()) {
        try {
          const parts = line.split('|').map((part) => part.trim());

          // check format (must have 16 fields)
          if (parts.length < 16) {
            const unstructuredLeadForm = new UnstructuredLeadForm({
              type: 'row',
              rawData: { line },
              assignee: null,
              dialingStatus: 'not_dialed',
            });
            await unstructuredLeadForm.save();
            results.unstructured++;
            continue;
          }

          // basic field checks (example: 16-digit card number, 2-digit month/year, 3-digit cvv)
          const cardNumberPattern = /^\d{16}$/;
          const monthPattern = /^\d{2}$/;
          const yearPattern = /^\d{2}$/;
          const cvvPattern = /^\d{3}$/;

          if (
            !cardNumberPattern.test(parts[0]) ||
            !monthPattern.test(parts[1]) ||
            !yearPattern.test(parts[2]) ||
            !cvvPattern.test(parts[3])
          ) {
            const unstructuredLeadForm = new UnstructuredLeadForm({
              type: 'row',
              rawData: { line },
              assignee: null,
              dialingStatus: 'not_dialed',
            });
            await unstructuredLeadForm.save();
            results.unstructured++;
            continue;
          }

          // if all checks pass → save as structured lead
          const leadData = {
            cardNumber: parts[0],
            expirationMonth: parts[1],
            expirationYear: parts[2],
            cvv: parts[3],
            fullName: parts[4],
            streetAddress: parts[5],
            city: parts[6],
            state: parts[7],
            zipCode: parts[8],
            phone: parts[9],
            email: parts[10],
            bank: parts[11],
            cardType: parts[12],
            cardClass: parts[13],
            cardCategory: parts[14],
            country: parts[15],
            countryFullName: parts[16] || 'UNITED STATES',
            createdBy: req.user._id,
          };

          const leadForm = new LeadForm(leadData);
          await leadForm.save();
          results.structured++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            line: index + 1,
            error: error.message,
          });
        }
      }

      fs.unlinkSync(filePath);

      res.status(200).json({
        success: true,
        message: 'Upload completed succesfully',
        data: results,
      });
    } catch (error) {
      console.error('Bulk upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during bulk upload',
      });
    }
  }
);

// @route   POST /api/lead-forms/unstructured/upload-file
// @desc    Upload unstructured lead form file (admin only)
// @access  Private (Admin)
router.post(
  '/unstructured-lead-forms/upload-file',
  [authenticateToken, requireAdmin, upload.single('file')],
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      // For now store locally. If you’re using cloud (S3, Cloudinary),
      // replace req.file.path with the returned cloud URL.
      const fileUrl = `/uploads/lead-forms/${req.file.filename}`;

      const unstructuredLeadForm = new UnstructuredLeadForm({
        type: 'file',
        rawData: null,
        link: fileUrl,
        fileName: req.file.originalname,
        assignee: null,
        dialingStatus: 'not_dialed',
      });

      await unstructuredLeadForm.save();

      res.status(201).json({
        success: true,
        message: 'Unstructured file uploaded successfully',
        data: unstructuredLeadForm,
      });
    } catch (error) {
      console.error('Unstructured file upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during unstructured file upload',
      });
    }
  }
);

// @route   POST /api/lead-forms
// @desc    Create new lead form (admin only)
// @access  Private (Admin)
router.post(
  '/',
  [
    authenticateToken,
    requireAdmin,
    upload.array('files', 5),
    body('cardNumber')
      .trim()
      .notEmpty()
      .withMessage('Card number is required')
      .matches(/^\d{16}$/)
      .withMessage('Must be 16 digits'),
    body('expirationMonth')
      .trim()
      .notEmpty()
      .withMessage('Expiration month is required')
      .matches(/^\d{2}$/)
      .withMessage('Must be 2 digits'),
    body('expirationYear')
      .trim()
      .notEmpty()
      .withMessage('Expiration year is required')
      .matches(/^\d{2}$/)
      .withMessage('Must be 2 digits'),
    body('cvv')
      .trim()
      .notEmpty()
      .withMessage('CVV is required')
      .matches(/^\d{3}$/)
      .withMessage('Must be 3 digits'),
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('streetAddress')
      .trim()
      .notEmpty()
      .withMessage('Street address is required'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('state')
      .trim()
      .notEmpty()
      .withMessage('State is required')
      .isLength({ min: 2, max: 2 })
      .withMessage('State must be 2 characters')
      .toUpperCase(),
    body('zipCode').trim().notEmpty().withMessage('ZIP code is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail(),
    body('bank').trim().notEmpty().withMessage('Bank is required'),
    body('cardType')
      .trim()
      .notEmpty()
      .withMessage('Card type is required')
      .isIn(['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'])
      .withMessage('Invalid card type'),
    body('cardClass').trim().notEmpty().withMessage('Card class is required'),
    body('cardCategory')
      .trim()
      .notEmpty()
      .withMessage('Card category is required'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'processed'])
      .withMessage('Invalid status'),
    body('assignee').optional().isMongoId().withMessage('Invalid assignee ID'),
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

      // Handle uploaded files
      const uploadedFiles = req.files
        ? req.files.map((file) => ({
            filename: file.filename,
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          }))
        : [];

      const leadFormData = {
        cardNumber: req.body.cardNumber,
        expirationMonth: req.body.expirationMonth,
        expirationYear: req.body.expirationYear,
        cvv: req.body.cvv,
        fullName: req.body.fullName,
        streetAddress: req.body.streetAddress,
        city: req.body.city,
        state: req.body.state,
        zipCode: req.body.zipCode,
        phone: req.body.phone,
        email: req.body.email,
        bank: req.body.bank,
        cardType: req.body.cardType,
        cardClass: req.body.cardClass,
        cardCategory: req.body.cardCategory,
        country: req.body.country || 'United States',
        countryFullName: req.body.countryFullName || 'UNITED STATES',
        status: req.body.status || 'active',
        assignee: req.body.assignee || null,
        createdBy: req.user._id,
      };

      const leadForm = new LeadForm(leadFormData);
      await leadForm.save();

      await leadForm.populate('createdBy', 'name email');
      if (leadForm.assignee) {
        await leadForm.populate('assignee', 'name email');
      }

      res.status(201).json({
        success: true,
        message: 'Lead form created successfully',
        data: { leadForm },
      });
    } catch (error) {
      console.error('Create lead form error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error creating lead form',
      });
    }
  }
);

// @route   PUT /api/lead-forms/:id
// @desc    Update lead form (admin only)
// @access  Private (Admin)
router.put(
  '/:id',
  [
    authenticateToken,
    body('cardNumber')
      .optional()
      .trim()
      .matches(/^\d{16}$/)
      .withMessage('Must be 16 digits'),
    body('expirationMonth')
      .optional()
      .trim()
      .matches(/^\d{2}$/)
      .withMessage('Must be 2 digits'),
    body('expirationYear')
      .optional()
      .trim()
      .matches(/^\d{2}$/)
      .withMessage('Must be 2 digits'),
    body('cvv')
      .optional()
      .trim()
      .matches(/^\d{3}$/)
      .withMessage('Must be 3 digits'),
    body('state')
      .optional()
      .trim()
      .isLength({ min: 2, max: 2 })
      .withMessage('State must be 2 characters')
      .toUpperCase(),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail(),
    body('cardType')
      .optional()
      .trim()
      .isIn(['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'])
      .withMessage('Invalid card type'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'processed'])
      .withMessage('Invalid status'),
    body('assignee').optional().isMongoId().withMessage('Invalid assignee ID'),
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

      const leadForm = await LeadForm.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate('assignee', 'name email');

      if (!leadForm) {
        return res.status(404).json({
          success: false,
          message: 'Lead form not found',
        });
      }

      res.json({
        success: true,
        message: 'Lead form updated successfully',
        data: { leadForm },
      });
    } catch (error) {
      console.error('Update lead form error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating lead form',
      });
    }
  }
);

// @route   PUT /api/unstructured-lead-forms/:id
// @desc    Update unstructured lead form (admin only)
// @access  Private (Admin)
router.put(
  '/unstructured-lead-forms/:id',
  [
    authenticateToken,
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'processed'])
      .withMessage('Invalid status'),
    body('assignee').optional().isMongoId().withMessage('Invalid assignee ID'),
    body('dialingStatus')
      .optional()
      .isIn(['not_dialed', 'dialed'])
      .withMessage('Invalid dialing status'),
    body('rawData')
      .optional()
      .isObject()
      .withMessage('Raw data must be a JSON object'),
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

      const leadForm = await UnstructuredLeadForm.findOneAndUpdate(
        { _id: req.params.id, type: 'row' }, // ensure it's unstructured
        req.body,
        { new: true, runValidators: true }
      ).populate('assignee', 'name email');

      if (!leadForm) {
        return res.status(404).json({
          success: false,
          message: 'Unstructured lead form not found',
        });
      }

      res.json({
        success: true,
        message: 'Unstructured lead form updated successfully',
        data: { leadForm },
      });
    } catch (error) {
      console.error('Update unstructured lead form error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating unstructured lead form',
      });
    }
  }
);

// @route   DELETE /api/lead-forms/:id
// @desc    Delete lead form (admin only)
// @access  Private (Admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const leadForm = await LeadForm.findByIdAndDelete(req.params.id);

    if (!leadForm) {
      return res.status(404).json({
        success: false,
        message: 'Lead form not found',
      });
    }

    res.json({
      success: true,
      message: 'Lead form deleted successfully',
    });
  } catch (error) {
    console.error('Delete lead form error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting lead form',
    });
  }
});

// @route   DELETE /api/lead-forms/unstructured-lead-forms/:id
// @desc    Delete lead form unstructured (admin only)
// @access  Private (Admin)
router.delete(
  '/unstructured-lead-forms/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const leadForm = await UnstructuredLeadForm.findByIdAndDelete(
        req.params.id
      );

      if (!leadForm) {
        return res.status(404).json({
          success: false,
          message: 'Lead form not found',
        });
      }

      if (leadForm.link) {
        const filePath = path.join(process.cwd(), leadForm.link);

        fs.unlink(filePath, (err) => {
          if (err) {
            console.error('Error deleting file from disk:', err);
          }
        });
      }

      res.json({
        success: true,
        message: 'Lead form deleted successfully',
      });
    } catch (error) {
      console.error('Delete lead form error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error deleting lead form',
      });
    }
  }
);

// @route   GET /api/lead-forms/stats/dashboard
// @desc    Get lead form statistics for dashboard
// @access  Private
router.get('/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    // Get stats by bank
    const bankStats = await LeadForm.aggregate([
      {
        $group: {
          _id: '$bank',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get stats by card type
    const cardTypeStats = await LeadForm.aggregate([
      {
        $group: {
          _id: '$cardType',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get stats by status
    const statusStats = await LeadForm.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get stats by assignee
    const assigneeStats = await LeadForm.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'assignee',
          foreignField: '_id',
          as: 'assigneeInfo',
        },
      },
      {
        $unwind: {
          path: '$assigneeInfo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: {
            assigneeId: '$assignee',
            assigneeName: '$assigneeInfo.name',
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          assigneeId: '$_id.assigneeId',
          assigneeName: '$_id.assigneeName',
          count: 1,
        },
      },
    ]);

    const totalLeadForms = await LeadForm.countDocuments();

    res.json({
      success: true,
      data: {
        totalLeadForms,
        bankStats,
        cardTypeStats,
        statusStats,
        assigneeStats,
      },
    });
  } catch (error) {
    console.error('Get lead form stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching lead form statistics',
    });
  }
});

// @route   GET /api/lead-forms/files/:filename
// @desc    Serve uploaded files
// @access  Private
router.get('/files/:filename', authenticateToken, (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.resolve(
      __dirname,
      '../uploads/lead-forms/',
      filename
    );

    if (!fs.existsSync(filePath)) {
      console.log(123);

      return res.status(404).json({
        success: false,
        message: 'File not found',
      });
    }

    res.status(200).sendFile(filePath);
  } catch (error) {
    console.error('File serving error:', error);
    res.status(500).json({
      success: false,
      message: 'Error serving file',
    });
  }
});

module.exports = router;
