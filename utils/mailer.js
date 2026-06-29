const nodemailer = require('nodemailer');

/**
 * Sender pool with round-robin rotation + automatic failover.
 *
 * Configure a pool of Gmail accounts (each with its own App Password):
 *   EMAIL_SENDERS="gmail1@x.com:apppass1,gmail2@x.com:apppass2,gmail3@x.com:apppass3"
 *
 * App passwords may be pasted with or without spaces ("abcd efgh ..." is fine).
 * Falls back to a single account via EMAIL_USER / EMAIL_PASS for backward compat.
 *
 * Optional:
 *   EMAIL_FROM_NAME -> display name on the "From" header (default: "Unicall")
 */
const parseSenders = () => {
  const raw = (process.env.EMAIL_SENDERS || '').trim();
  const senders = [];

  if (raw) {
    raw.split(',').forEach((pair) => {
      const trimmed = pair.trim();
      if (!trimmed) return;
      const idx = trimmed.indexOf(':');
      if (idx === -1) return;
      const user = trimmed.slice(0, idx).trim();
      // App passwords are shown in 4-char groups; strip whitespace
      const pass = trimmed.slice(idx + 1).trim().replace(/\s+/g, '');
      if (user && pass) senders.push({ user, pass });
    });
  }

  // Backward-compatible single-account fallback
  if (!senders.length && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    senders.push({
      user: process.env.EMAIL_USER,
      pass: String(process.env.EMAIL_PASS).replace(/\s+/g, ''),
    });
  }

  return senders;
};

let senders = null;
const transporters = new Map();
let rrIndex = 0; // round-robin cursor (module-scoped)

const getSenders = () => {
  if (!senders) senders = parseSenders();
  return senders;
};

const getTransporterFor = (sender) => {
  if (transporters.has(sender.user)) return transporters.get(sender.user);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: sender.user, pass: sender.pass },
  });

  transporters.set(sender.user, transporter);
  return transporter;
};

// Polished, email-client-safe HTML template for the OTP code.
// `requester` (optional) = { name, email } of the agent who triggered the login,
// shown when OTP is delivered to a central admin inbox.
const otpEmailTemplate = (otp, requester) => {
  const requestedByBlock =
    requester && requester.email
      ? `
                <div style="background:#0b0b0f;border:1px solid #34344e;border-radius:10px;padding:14px 16px;margin:0 0 22px;">
                  <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Login requested by</p>
                  <p style="margin:0;color:#e5e7eb;font-size:15px;font-weight:600;">${requester.name || 'Agent'}</p>
                  <p style="margin:2px 0 0;color:#9ca3af;font-size:13px;">${requester.email}</p>
                </div>`
      : '';

  const greeting =
    requester && requester.email ? 'Hi Admin,' : `Hi ${requester?.name || 'there'},`;

  const intro =
    requester && requester.email
      ? 'An agent is trying to sign in to Unicall. Share the code below with them to complete their sign-in. It is valid for'
      : 'Use the verification code below to complete your sign-in. This code is valid for';

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Unicall verification code</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0b0b0f;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0b0f;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#15151d;border:1px solid #26263a;border-radius:16px;overflow:hidden;">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#8b5cf6 0%,#ec4899 100%);padding:28px 32px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">UNICALL</h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Secure sign-in verification</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px;color:#e5e7eb;font-size:16px;">${greeting}</p>
                <p style="margin:0 0 24px;color:#9ca3af;font-size:14px;line-height:1.6;">
                  ${intro}
                  <strong style="color:#e5e7eb;">5 minutes</strong>.
                </p>
                ${requestedByBlock}

                <!-- OTP code -->
                <div style="text-align:center;margin:0 0 28px;">
                  <div style="display:inline-block;background:#0b0b0f;border:1px solid #34344e;border-radius:12px;padding:18px 28px;">
                    <span style="color:#ffffff;font-size:34px;font-weight:700;letter-spacing:10px;">${otp}</span>
                  </div>
                </div>

                <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;line-height:1.6;">
                  If you didn't try to sign in, you can safely ignore this email &mdash; your account is still secure.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #26263a;text-align:center;">
                <p style="margin:0;color:#6b7280;font-size:12px;">
                  &copy; ${new Date().getFullYear()} Unicall. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
};

/**
 * Send an OTP email. Rotates through the sender pool (round-robin) and, if a
 * sender fails, automatically retries with the next one until the pool is
 * exhausted. Throws only if every configured sender fails.
 *
 * @param {Object}        params
 * @param {string|string[]} params.to        recipient email(s)
 * @param {string}        params.otp          the verification code
 * @param {string}        [params.agentName]  name of the agent requesting login
 * @param {string}        [params.agentEmail] email of the agent requesting login
 *                                            (when set, recipient is treated as a
 *                                            central admin and the agent's details
 *                                            are shown in the email)
 */
const sendOtpEmail = async ({ to, otp, agentName, agentEmail }) => {
  const pool = getSenders();

  if (!pool.length) {
    throw new Error(
      'No email sender accounts configured. Set EMAIL_SENDERS (or EMAIL_USER/EMAIL_PASS).'
    );
  }

  // Send each admin their OWN email (not one shared "To") so a single failure
  // doesn't block the rest, and admins don't see each other's addresses.
  const recipientList = Array.isArray(to) ? to.filter(Boolean) : [to];
  const requester = agentEmail ? { name: agentName, email: agentEmail } : null;

  const fromName = process.env.EMAIL_FROM_NAME || 'Unicall';
  const subject = requester
    ? `Unicall login code for ${agentName || agentEmail}: ${otp}`
    : `Your Unicall verification code: ${otp}`;
  const html = otpEmailTemplate(otp, requester);
  const text = requester
    ? `Agent ${agentName || ''} (${agentEmail}) is signing in to Unicall.\nVerification code: ${otp}\nValid for 5 minutes. Share it with the agent to complete sign-in.`
    : `Hi ${agentName || 'there'},\n\nYour Unicall verification code is ${otp}. It is valid for 5 minutes.\n\nIf you didn't request this, you can ignore this email.`;

  // Deliver to a single recipient, rotating through senders with failover.
  const sendToOne = async (recipient) => {
    let lastErr;
    for (let i = 0; i < pool.length; i++) {
      const sender = pool[(rrIndex + i) % pool.length];
      try {
        const info = await getTransporterFor(sender).sendMail({
          // From must be the authenticated Gmail account for deliverability
          from: `${fromName} <${sender.user}>`,
          to: recipient,
          subject,
          html,
          text,
        });
        rrIndex = (rrIndex + i + 1) % pool.length;
        return { recipient, ok: true, info };
      } catch (err) {
        lastErr = err;
        console.error(`OTP send to ${recipient} failed via ${sender.user}:`, err.message);
      }
    }
    rrIndex = (rrIndex + 1) % pool.length;
    return { recipient, ok: false, error: lastErr };
  };

  const results = [];
  for (const recipient of recipientList) {
    results.push(await sendToOne(recipient));
  }

  const delivered = results.filter((r) => r.ok);
  console.log(
    `OTP delivered to ${delivered.length}/${recipientList.length} recipient(s): ${delivered
      .map((r) => r.recipient)
      .join(', ')}`
  );

  // Only fail if NObody received it
  if (!delivered.length) {
    throw (results[0] && results[0].error) || new Error('Failed to send OTP email');
  }

  return results;
};

module.exports = { sendOtpEmail, getSenders };
