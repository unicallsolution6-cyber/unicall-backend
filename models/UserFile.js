const mongoose = require('mongoose');

const userFileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['image', 'document'],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserFile', userFileSchema);
