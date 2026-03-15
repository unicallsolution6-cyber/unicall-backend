const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true
  },
  cell: {
    type: String,
    trim: true
  },
  ssn: {
    type: String,
    trim: true
  },
  dob: {
    type: String,
    trim: true
  },
  mmn: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  zipCode: {
    type: String,
    trim: true
  },
  routingNumber: {
    type: String,
    trim: true
  },
  accountNumber: {
    type: String,
    trim: true
  },
  dlNumber: {
    type: String,
    trim: true
  },
  dlClass: {
    type: String,
    trim: true
  },
  issueDate: {
    type: String,
    trim: true
  },
  expDate: {
    type: String,
    trim: true
  },
  eyeColor: {
    type: String,
    trim: true
  },
  height: {
    type: String,
    trim: true
  },
  bank: {
    type: String,
    enum: ['chase', 'bofa', 'wells', 'citi', 'mixed'],
    default: 'chase'
  },
  status: {
    type: String,
    enum: ['paid-wire', 'pending', 'followup', 'deactivated'],
    default: 'pending'
  },
  // Card information (optional)
  cards: [{
    cardHolderName: {
      type: String,
      trim: true
    },
    cardNumber: {
      type: String,
      trim: true
    },
    expiryDate: {
      type: String,
      trim: true
    },
    cvv: {
      type: String,
      trim: true
    },
    cardType: {
      type: String,
      enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'UNKNOWN'],
      default: 'VISA'
    }
  }],
  // Notes about the client (optional)
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  // Only users can create clients, so we track which user created this client
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
clientSchema.index({ createdBy: 1, createdAt: -1 });
clientSchema.index({ bank: 1 });
clientSchema.index({ status: 1 });

module.exports = mongoose.model('Client', clientSchema);
