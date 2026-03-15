const express = require('express');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const LeadForm = require('../models/LeadForm');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const binlookup = require('binlookup')();

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { number } = req.query;

    if (!number || number.length < 4) {
      return res
        .status(400)
        .json({ error: 'Card number must be at least 4 digits' });
    }

    const bin = number.replace(/\s/g, '').slice(0, 6);

    console.log(bin);

    const result = await binlookup(bin);

    console.log(result);

    res.json(result);
  } catch (error) {
    console.error('Card lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
