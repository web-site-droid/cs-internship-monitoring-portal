require('dotenv').config();
const { isEmailConfigured, sendPasswordResetCode } = require('../server/email');

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: node scripts/test-gmail.js recipient@example.com');
    process.exit(1);
  }

  if (!isEmailConfigured()) {
    console.error('Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
    process.exit(1);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  console.log(`Sending test reset code ${code} to ${to}...`);

  try {
    await sendPasswordResetCode({ to, name: 'Test User', code });
    console.log('Email sent successfully. Check the inbox (and spam folder).');
  } catch (err) {
    console.error('Failed to send email:', err.message);
    process.exit(1);
  }
}

main();
