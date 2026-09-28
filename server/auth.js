const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const TOKEN_COOKIE = 'auth_token';
const LAST_ACTIVITY_COOKIE = 'last_activity';
const FLASH_COOKIE = 'flash_msg';
const SESSION_IDLE_MS = Math.max(5, Number(process.env.SESSION_IDLE_MINUTES || 60)) * 60 * 1000;
const SESSION_COOKIE_MAX_AGE = SESSION_IDLE_MS + (5 * 60 * 1000);

const cookieBaseOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
};

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function verifyPassword(password, hash) {
  if (await bcrypt.compare(password, hash)) return true;
  const md5 = crypto.createHash('md5').update(password).digest('hex');
  return md5 === hash;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function getLastActivity(req) {
  const raw = req.signedCookies[LAST_ACTIVITY_COOKIE];
  const ts = parseInt(raw, 10);
  return Number.isFinite(ts) ? ts : null;
}

function setLastActivity(res) {
  res.cookie(LAST_ACTIVITY_COOKIE, String(Date.now()), {
    ...cookieBaseOptions,
    signed: true,
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

function clearLastActivity(res) {
  res.clearCookie(LAST_ACTIVITY_COOKIE, { ...cookieBaseOptions, signed: true });
}

function isSessionIdleExpired(lastActivity) {
  if (!lastActivity) return true;
  return Date.now() - lastActivity > SESSION_IDLE_MS;
}

function clearSession(res) {
  res.clearCookie(TOKEN_COOKIE, cookieBaseOptions);
  clearLastActivity(res);
}

function attachUser(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    req.user = null;
    return next();
  }

  const lastActivity = getLastActivity(req);
  if (isSessionIdleExpired(lastActivity)) {
    clearSession(res);
    req.user = null;
    req.sessionExpired = true;
    return next();
  }

  setLastActivity(res);
  req.user = payload;
  next();
}

function wantsJsonResponse(req) {
  if (req.xhr) return true;
  const accept = req.get('Accept') || '';
  if (accept.includes('application/json')) return true;
  const contentType = req.get('Content-Type') || '';
  if (contentType.includes('application/json')) return true;
  if (req.path.includes('/time-in') || req.path.startsWith('/api/')) return true;
  return false;
}

function sendUnauthenticated(req, res) {
  if (wantsJsonResponse(req)) {
    return res.status(401).json({
      type: 'error',
      message: 'Please log in again.',
      sessionExpired: Boolean(req.sessionExpired),
    });
  }
  if (req.sessionExpired) {
    return redirectWithFlash(
      res,
      '/login',
      'error',
      'Session Expired',
      'You were signed out after 1 hour of inactivity. Please sign in again.'
    );
  }
  return res.redirect('/login');
}

function requireLogin(req, res, next) {
  if (!req.user) {
    return sendUnauthenticated(req, res);
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthenticated(req, res);
    }
    const role = req.user.role;
    const allowed = roles.includes(role) || (role === 'admin' && roles.includes('supervisor'));
    if (!allowed) {
      if (wantsJsonResponse(req)) {
        return res.status(403).json({ type: 'error', message: 'You do not have permission for this action.' });
      }
      return res.redirect('/');
    }
    next();
  };
}

function setAuthCookie(res, user) {
  res.cookie(TOKEN_COOKIE, signToken(user), {
    ...cookieBaseOptions,
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  setLastActivity(res);
}

function clearAuthCookie(res) {
  clearSession(res);
}

function setFlash(res, type, title, message) {
  const payload = JSON.stringify({ type, title, message });
  res.cookie(FLASH_COOKIE, payload, {
    httpOnly: true,
    signed: true,
    maxAge: 60 * 1000,
  });
}

function getFlash(req, res) {
  const raw = req.signedCookies[FLASH_COOKIE];
  if (raw) res.clearCookie(FLASH_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function redirectWithFlash(res, path, type, title, message) {
  setFlash(res, type, title, message);
  res.redirect(path);
}

async function fetchUserByEmail(email) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

function last10Digits(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

async function fetchUserByPhone(phone) {
  const needle = last10Digits(phone);
  if (needle.length < 10) return null;

  const [rows] = await pool.execute(
    "SELECT * FROM users WHERE phone IS NOT NULL AND TRIM(phone) != ''"
  );
  return rows.find((row) => last10Digits(row.phone) === needle) || null;
}

module.exports = {
  TOKEN_COOKIE,
  LAST_ACTIVITY_COOKIE,
  SESSION_IDLE_MS,
  attachUser,
  requireLogin,
  requireRole,
  setAuthCookie,
  clearAuthCookie,
  setFlash,
  getFlash,
  redirectWithFlash,
  verifyPassword,
  hashPassword,
  fetchUserByEmail,
  fetchUserByPhone,
};
