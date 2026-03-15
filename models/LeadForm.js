const mongoose = require('mongoose');

const leadFormSchema = new mongoose.Schema({
  // Card Information (exactly from your sample)
  cardNumber: {
    type: String,
    required: [true, 'Card number is required'],
    match: [/^\d{16}$/, 'Must be 16 digits'],
  },
  expirationMonth: {
    type: String,
    required: [true, 'Expiration month is required'],
    match: [/^\d{2}$/, 'Must be 2 digits'],
  },
  expirationYear: {
    type: String,
    required: [true, 'Expiration year is required'],
    match: [/^\d{2}$/, 'Must be 2 digits'],
  },
  cvv: {
    type: String,
    required: [true, 'CVV is required'],
    match: [/^\d{3}$/, 'Must be 3 digits'],
  },

  // Personal Information (exact fields from sample)
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
  },
  streetAddress: {
    type: String,
    required: [true, 'Street address is required'],
  },
  city: {
    type: String,
    required: [true, 'City is required'],
  },
  state: {
    type: String,
    required: [true, 'State is required'],
    uppercase: true,
  },
  zipCode: {
    type: String,
    required: [true, 'ZIP code is required'],
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
  },

  // Bank/Card Details (exact values from sample)
  bank: {
    type: String,
    required: [true, 'Bank is required'],
    default: 'Wells Fargo Bank, N.A.',
  },
  cardType: {
    type: String,
    required: [true, 'Card type is required'],
    enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'],
    default: 'VISA',
  },
  cardClass: {
    type: String,
    required: [true, 'Card class is required'],
    default: 'CLASSIC',
  },
  cardCategory: {
    type: String,
    required: [true, 'Card category is required'],
    default: 'Debit',
  },

  // Country Information
  country: {
    type: String,
    required: [true, 'Country is required'],
    default: 'United States',
  },
  countryFullName: {
    type: String,
    required: [true, 'Full country name is required'],
    default: 'UNITED STATES',
  },

  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  // System Fields
  status: {
    type: String,
    enum: ['active', 'inactive', 'processed'],
    default: 'inactive',
  },
  dialingStatus: {
    type: String,
    enum: ['not_dialed', 'dialed'],
    default: 'not_dialed',
  },
  source: {
    type: String,
    default: 'manual_entry',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for all searchable fields
leadFormSchema.index({ cardNumber: 1 });
leadFormSchema.index({ fullName: 1 });
leadFormSchema.index({ email: 1 });
leadFormSchema.index({ phone: 1 });
leadFormSchema.index({ bank: 1 });
leadFormSchema.index({ status: 1 });
leadFormSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LeadForm', leadFormSchema);
