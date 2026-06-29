/**
 * Quick test for the OTP email sender pool.
 *
 * Usage:
 *   node scripts/testEmail.js recipient@example.com [howManyToSend]
 *
 * Sends one (or N) test codes so you can confirm credential  khawaja@bluegenstudios.coms work and watch
 * the round-robin rotate through your EMAIL_SENDERS pool.
 */
require('dotenv').config();
const { sendOtpEmail, getSenders } = require('../utils/mailer');

const to = process.argv[2];
const count = parseInt(process.argv[3], 10) || 1;

if (!to) {
  console.error('Usage: node scripts/testEmail.js recipient@example.com [count]');
  process.exit(1);
}

const pool = getSenders();
if (!pool.length) {
  console.error(
    'No senders configured. Set EMAIL_SENDERS (or EMAIL_USER/EMAIL_PASS) in backend/.env'
  );
  process.exit(1);
}

console.log(`Sender pool (${pool.length}):`, pool.map((s) => s.user).join(', '));

(async () => {
  for (let i = 0; i < count; i++) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    try {
      const info = await sendOtpEmail({
        to, // admin inbox in real use
        otp,
        agentName: 'Test Agent',
        agentEmail: 'agent@example.com', // shown as the requesting agent
      });
      console.log(
        `✓ [${i + 1}/${count}] sent code ${otp} to ${to} (messageId: ${info.messageId})`
      );
    } catch (err) {
      console.error(`✗ [${i + 1}/${count}] failed:`, err.message);
    }
  }
  process.exit(0);
})();
