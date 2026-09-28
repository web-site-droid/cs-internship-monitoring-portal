const crypto = require('crypto');
const pool = require('./db');
const isPostgres = Boolean(pool.isPostgres);
const { hashPassword } = require('./auth');
const { isSmsConfigured, sendPasswordResetSms } = require('./sms');

let tableReady = false;

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getExpiryMinutes() {
  return Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES || 15);
}

async function ensurePasswordResetTable() {
  if (tableReady) return;

  if (isPostgres) {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_codes (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.execute(
      'CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id ON password_reset_codes (user_id)'
    );
  } else {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash VARCHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  tableReady = true;
}

async function createAndSendResetCode(user) {
  await ensurePasswordResetTable();

  if (!user.phone) {
    const err = new Error('This account has no mobile number on file. Update your profile phone number first.');
    err.code = 'SMS_NO_PHONE';
    throw err;
  }

  if (!isSmsConfigured()) {
    const err = new Error('SMS_NOT_CONFIGURED');
    err.code = 'SMS_NOT_CONFIGURED';
    throw err;
  }

  const code = generateResetCode();
  const codeHash = hashResetCode(code);
  const expiryMinutes = getExpiryMinutes();
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  await pool.execute('UPDATE password_reset_codes SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [
    user.id,
  ]);

  await pool.execute(
    'INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)',
    [user.id, codeHash, expiresAt]
  );

  await sendPasswordResetSms({
    to: user.phone,
    name: user.name,
    code,
  });

  return { expiresMinutes: expiryMinutes };
}

async function resetPasswordWithCode(phone, code, newPassword) {
  await ensurePasswordResetTable();

  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  const normalizedCode = String(code || '').trim();

  if (!normalizedPhone || !normalizedCode || !newPassword) {
    return { ok: false, error: 'Mobile number, reset code, and new password are required.' };
  }

  if (newPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const needle = normalizedPhone.slice(-10);
  const [users] = await pool.execute(
    "SELECT id, phone FROM users WHERE phone IS NOT NULL AND TRIM(phone) != ''"
  );
  const matched = users.find((row) => String(row.phone || '').replace(/\D/g, '').slice(-10) === needle);
  if (!matched) {
    return { ok: false, error: 'Invalid reset code or mobile number. Please request a new code.' };
  }

  const userId = matched.id;
  const codeHash = hashResetCode(normalizedCode);

  const [rows] = await pool.execute(
    `SELECT id FROM password_reset_codes
     WHERE user_id = ? AND code_hash = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, codeHash]
  );

  if (!rows.length) {
    return { ok: false, error: 'Invalid or expired reset code. Please request a new one.' };
  }

  const hashedPassword = await hashPassword(newPassword);
  await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
  const { rememberLoginPassword } = require('./helpers');
  await rememberLoginPassword(userId, newPassword);
  await pool.execute('UPDATE password_reset_codes SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [
    userId,
  ]);

  return { ok: true };
}

module.exports = {
  createAndSendResetCode,
  resetPasswordWithCode,
  ensurePasswordResetTable,
};
