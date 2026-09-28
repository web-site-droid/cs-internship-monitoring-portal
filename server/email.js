const nodemailer = require('nodemailer');

let transporterPromise = null;

function normalizeAppPassword(pass) {
  return String(pass || '').replace(/\s+/g, '').trim();
}

function getGmailCredentials() {
  const user = (process.env.GMAIL_USER || process.env.SMTP_USER || '').trim();
  const pass = normalizeAppPassword(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS);
  return { user, pass };
}

function isEmailConfigured() {
  const { user, pass } = getGmailCredentials();
  return Boolean(user && pass);
}

function getMailFrom() {
  const { user } = getGmailCredentials();
  return process.env.MAIL_FROM || `"LSSTI Portal" <${user}>`;
}

function usesGmailService() {
  const host = (process.env.SMTP_HOST || '').trim().toLowerCase();
  return !host || host.includes('gmail.com') || Boolean(process.env.GMAIL_USER);
}

function getSmtpOptions() {
  const { user, pass } = getGmailCredentials();

  if (usesGmailService()) {
    return {
      service: 'gmail',
      auth: { user, pass },
    };
  }

  const host = process.env.SMTP_HOST.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return {
    host,
    port,
    secure,
    auth: { user, pass },
  };
}

async function getTransporter() {
  if (!isEmailConfigured()) {
    const err = new Error('Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  if (!transporterPromise) {
    transporterPromise = nodemailer.createTransport(getSmtpOptions());
  }

  return transporterPromise;
}

function formatMailError(err) {
  const msg = err?.message || 'Unknown email error';
  if (/invalid login|authentication|535|534/i.test(msg)) {
    return 'Gmail rejected the login. Use a Google App Password (not your normal Gmail password).';
  }
  if (/self signed|certificate|TLS/i.test(msg)) {
    return 'Secure connection to Gmail failed. Check SMTP settings and try again.';
  }
  return msg;
}

async function sendMail({ to, subject, text, html }) {
  const transporter = await getTransporter();
  try {
    return await transporter.sendMail({
      from: getMailFrom(),
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    const wrapped = new Error(formatMailError(err));
    wrapped.code = 'SMTP_SEND_FAILED';
    wrapped.cause = err;
    throw wrapped;
  }
}

async function sendPasswordResetCode({ to, name, code }) {
  const portalName = 'Student Internship Monitoring Portal';
  const minutes = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES || 15);
  const subject = `${portalName} — Your password reset code`;
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const text = [
    greeting,
    '',
    `Your password reset code is: ${code}`,
    '',
    'Enter this code on the forgot password page to set a new password.',
    `The code expires in ${minutes} minutes.`,
    '',
    'If you did not request this, you can ignore this email.',
    '',
    portalName,
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#14532d;">
      <p>${greeting}</p>
      <p>Enter this code on the forgot password page to set a new password:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;color:#166534;text-align:center;">${code}</p>
      <p style="color:#475569;font-size:14px;text-align:center;">Expires in ${minutes} minutes</p>
      <p style="color:#64748b;font-size:13px;margin-top:24px;">If you did not request this, you can ignore this email.<br>${portalName}</p>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

module.exports = {
  isEmailConfigured,
  formatMailError,
  sendMail,
  sendPasswordResetCode,
};
