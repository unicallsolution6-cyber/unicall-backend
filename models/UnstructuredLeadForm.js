const mongoose = require('mongoose');

const unstructuredLeadFormSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['row', 'file'],
    required: true,
    default: 'row',
  },
  rawData: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  link: {
    type: String,
    default: null,
  },
  fileName: {
    type: String,
    default: null,
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  dialingStatus: {
    type: String,
    enum: ['not_dialed', 'dialed', null],
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for querying
unstructuredLeadFormSchema.index({ type: 1 });
unstructuredLeadFormSchema.index({ assignee: 1 });
unstructuredLeadFormSchema.index({ createdAt: -1 });

module.exports = mongoose.model(
  'UnstructuredLeadForm',
  unstructuredLeadFormSchema
);
