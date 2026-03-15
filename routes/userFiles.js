const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const UserFile = require('../models/UserFile');

const router = express.Router();

// --- Multer setup ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/user-files/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage });

// --- Routes ---

// Upload a file for a user
router.post(
  '/upload/:userId',
  [authenticateToken, requireAdmin, upload.single('file')],
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const newFile = new UserFile({
        userId: req.user._id,
        fileName: req.file.originalname,
        filePath: `/uploads/user-files/${req.file.filename}`,
        type: req.file.mimetype.startsWith('image/') ? 'image' : 'document',
      });

      await newFile.save();

      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        data: newFile,
      });
    } catch (error) {
      console.error('UserFile upload error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get all files for a specific user
router.get('/:userId', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const files = await UserFile.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });
    res.json({ success: true, data: files });
  } catch (error) {
    console.error('Fetch user files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download a file by ID
router.get(
  '/download/:id',
  [authenticateToken, requireAdmin],
  async (req, res) => {
    try {
      const file = await UserFile.findById(req.user._id);

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      const filePath = path.join(__dirname, '..', file.filePath);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }

      res.download(filePath, file.fileName);
    } catch (error) {
      console.error('Download user file error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete a file by ID
router.delete('/:id', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const file = await UserFile.findById(req.user._id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(__dirname, '..', file.filePath);

    // Remove file from disk if it exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await file.deleteOne();

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete user file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
