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
    const uploadDir = path.join(__dirname, '..', 'uploads', 'user-files');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
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

// Upload one or more files for a user
router.post(
  '/upload/:userId',
  [authenticateToken, requireAdmin, upload.array('files')],
  async (req, res) => {
    try {
      // Support both the new `files` array field and a single `file` fallback
      const uploadedFiles = req.files && req.files.length ? req.files : [];

      if (!uploadedFiles.length) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const docs = uploadedFiles.map((file) => ({
        userId: req.user._id,
        fileName: file.originalname,
        filePath: `/uploads/user-files/${file.filename}`,
        type: file.mimetype.startsWith('image/') ? 'image' : 'document',
      }));

      const savedFiles = await UserFile.insertMany(docs);

      res.status(201).json({
        success: true,
        message: `${savedFiles.length} file(s) uploaded successfully`,
        data: savedFiles,
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
      const file = await UserFile.findById(req.params.id);

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
    const file = await UserFile.findById(req.params.id);

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
