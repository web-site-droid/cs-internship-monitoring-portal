require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { applyVercelDefaults, applyPerformanceDefaults, getRequiredEnvErrors, renderConfigErrorHtml } = require('./env');
const { ensureDatabaseReady } = require('./bootstrap-db');
const {
  attachUser,
  getFlash,
  setAuthCookie,
  clearAuthCookie,
  redirectWithFlash,
  verifyPassword,
  hashPassword,
  fetchUserByEmail,
  requireLogin,
  SESSION_IDLE_MS,
} = require('./auth');
const { getUnreadMessageCount, getNotificationCount, getUserProfile, getUserNavData, ensureUserNameColumns, buildFullName, validateRegistrationInput, rememberLoginPassword } = require('./helpers');
const { upload } = require('./profileUpload');
const { resolveUploadPath, uploadsRoot, usesEphemeralUploads } = require('./uploadPaths');
const viewHelpers = require('./viewHelpers');
const { groupMessagesIntoThreads } = require('./messageThreads');

const studentRoutes = require('./routes/student');
const supervisorRoutes = require('./routes/supervisor');
const schoolRoutes = require('./routes/school');
const apiRoutes = require('./routes/api');

const app = express();
app.set('trust proxy', 1);

applyVercelDefaults();
applyPerformanceDefaults();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-cookie-secret'));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/img', express.static(path.join(__dirname, '../img')));
if (usesEphemeralUploads()) {
  app.use('/uploads', express.static(uploadsRoot()));
}

app.get('/health', (_req, res) => {
  const configErrors = getRequiredEnvErrors();
  res.status(configErrors.length ? 503 : 200).json({
    ok: configErrors.length === 0,
    errors: configErrors,
  });
});

function roleHome(role) {
  if (role === 'admin') return '/supervisor/dashboard';
  return `/${role}/dashboard`;
}

app.get(['/', '/login'], (req, res) => {
  attachUser(req, res, () => {
    if (req.user) return res.redirect(roleHome(req.user.role));
    res.locals.user = null;
    res.locals.flash = getFlash(req, res);
    res.locals.h = viewHelpers;
    res.locals.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    res.render('index', { openSignin: req.path === '/login' });
  });
});

app.use((req, res, next) => {
  const configErrors = getRequiredEnvErrors();
  if (configErrors.length) {
    return res.status(503).type('html').send(renderConfigErrorHtml(configErrors));
  }
  next();
});

app.use(async (req, res, next) => {
  try {
    await Promise.race([
      ensureDatabaseReady(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    next();
  } catch (err) {
    console.error('Database bootstrap failed:', err.message);
    next();
  }
});

app.use(attachUser);

function shouldSkipNavData(req) {
  if (req.method !== 'GET') return true;
  const path = req.path || '';
  if (path.startsWith('/api/')) return true;
  if (path.includes('/time-in') || path.includes('/time-out')) return true;
  if (path === '/health') return true;
  return false;
}

app.use(async (req, res, next) => {
  if (req.user) {
    try {
      const freshUser = await getUserProfile(req.user.id);
      if (freshUser) {
        req.user.name = freshUser.name;
        req.user.email = freshUser.email;
        req.user.role = freshUser.role;
        setAuthCookie(res, {
          id: freshUser.id,
          name: freshUser.name,
          email: freshUser.email,
          role: freshUser.role,
        });
      }
    } catch (err) {
      console.error('Could not refresh signed-in role:', err.message);
    }
  }

  res.locals.user = req.user;
  res.locals.flash = getFlash(req, res);
  res.locals.h = viewHelpers;
  res.locals.groupInboxThreads = groupMessagesIntoThreads;
  res.locals.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  res.locals.sessionIdleMs = SESSION_IDLE_MS;

  if (!req.user) {
    res.locals.unreadCount = 0;
    res.locals.notificationCount = 0;
    res.locals.profilePhoto = null;
    return next();
  }

  if (shouldSkipNavData(req)) {
    res.locals.unreadCount = 0;
    res.locals.notificationCount = 0;
    res.locals.profilePhoto = null;
    return next();
  }

  try {
    const nav = await getUserNavData(req.user.id, req.user.role);
    res.locals.unreadCount = nav.unreadCount;
    res.locals.notificationCount = nav.notificationCount;
    res.locals.profilePhoto = nav.profilePhoto;
    next();
  } catch (err) {
    next(err);
  }
});

// ── Auth ─────────────────────────────────────────────────────────────

app.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  if (!email || !password) {
    return redirectWithFlash(res, '/login', 'error', 'Login Failed', 'Email and password are required.');
  }

  const user = await fetchUserByEmail(email);
  if (user && (await verifyPassword(password, user.password))) {
    setAuthCookie(res, user);
    return res.redirect(roleHome(user.role));
  }

  redirectWithFlash(res, '/login', 'error', 'Login Failed', 'Invalid email or password. Please try again.');
});

const DEMO_ACCOUNTS = {
  student: 'student@example.com',
  supervisor: 'supervisor@example.com',
  school: 'school@example.com',
};

app.post('/login/demo', async (req, res) => {
  const role = req.body.role || 'student';
  const email = DEMO_ACCOUNTS[role];
  if (!email) {
    return redirectWithFlash(res, '/login', 'error', 'Login Failed', 'Invalid demo account.');
  }
  const user = await fetchUserByEmail(email);
  if (!user) {
    return redirectWithFlash(res, '/login', 'error', 'Login Failed', 'Demo account not found. Import init_db.sql first.');
  }
  setAuthCookie(res, user);
  res.redirect('/');
});

app.get(['/forgot-password', '/reset-password'], (req, res) => {
  res.redirect('/login');
});

app.post(['/forgot-password', '/reset-password'], (req, res) => {
  res.redirect('/login');
});

app.get('/register', (req, res) => {
  redirectWithFlash(res, '/login', 'error', 'Registration Closed', 'Only an administrator can create accounts.');
});

app.post('/register', (req, res) => {
  redirectWithFlash(res, '/login', 'error', 'Registration Closed', 'Only an administrator can create accounts.');
});

app.get('/logout', (req, res) => {
  clearAuthCookie(res);
  if (req.query.reason === 'timeout') {
    return redirectWithFlash(
      res,
      '/login',
      'error',
      'Session Expired',
      'You were signed out after 1 hour of inactivity. Please sign in again.'
    );
  }
  res.redirect('/');
});

app.get('/profile', requireLogin, async (req, res) => {
  const profile = await getUserProfile(req.user.id);
  res.render('profile', {
    pageTitle: 'My Profile',
    pageHeading: 'My Profile',
    pageSubtitle: 'Update your photo and personal information',
    activeNav: 'profile',
    profile: profile || req.user,
  });
});

app.post('/profile', requireLogin, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Profile photo must be 2 MB or smaller.'
        : 'Invalid image file. Use JPG, PNG, or WEBP.';
      return redirectWithFlash(res, '/profile', 'error', 'Upload Failed', msg);
    }
    next();
  });
}, async (req, res) => {
  const pool = require('./db');
  const action = req.body.action || 'update';

  if (action === 'update') {
    const firstName = (req.body.first_name || '').trim();
    const lastName = (req.body.last_name || '').trim();
    const middleInitial = (req.body.middle_initial || '').trim();
    const name = buildFullName(firstName, middleInitial, lastName) || (req.body.name || '').trim();
    const email = (req.body.email || '').trim();
    const phone = (req.body.phone || '').trim();
    const addressStreet = (req.body.address_street || '').trim();
    const addressBarangay = (req.body.address_barangay || '').trim();
    const addressCity = (req.body.address_city || '').trim();
    const addressProvince = (req.body.address_province || '').trim();
    const address = [addressStreet, addressBarangay, addressCity, addressProvince].join('|');
    const hasAddress = addressStreet || addressBarangay || addressCity || addressProvince;
    const studentNumber = (req.body.student_number || '').trim();
    const departmentMajor = (req.body.department_major || req.body.course_program || '').trim();
    const courseProgram = req.user.role === 'student'
      ? (departmentMajor || viewHelpers.PROGRAM_NAME)
      : (req.body.course_program || '').trim();
    const emergencyContact = (req.body.emergency_contact || '').trim();
    const emergencyPhone = (req.body.emergency_phone || '').trim();

    if (!firstName || !lastName || !email) {
      return redirectWithFlash(res, '/profile', 'error', 'Update Failed', 'First name, last name, and email are required.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return redirectWithFlash(res, '/profile', 'error', 'Update Failed', 'Enter a valid email address.');
    }
    if (phone && !/^[\d\s+\-()]{7,20}$/.test(phone)) {
      return redirectWithFlash(res, '/profile', 'error', 'Update Failed', 'Enter a valid contact number.');
    }
    if (req.user.role === 'student') {
      if (!phone) {
        return redirectWithFlash(res, '/profile', 'error', 'Update Failed', 'Phone number is required.');
      }
      if (!courseProgram) {
        return redirectWithFlash(res, '/profile', 'error', 'Update Failed', 'Department / major is required.');
      }
    }

    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [
      email,
      req.user.id,
    ]);
    if (existing.length) {
      return redirectWithFlash(res, '/profile', 'error', 'Update Failed', 'That email is already used by another account.');
    }

    let photoPath = null;
    if (req.file) {
      photoPath = `/uploads/profiles/${req.file.filename}`;
      const [[old]] = await pool.execute('SELECT profile_photo FROM users WHERE id = ? LIMIT 1', [req.user.id]);
      if (old?.profile_photo) {
        const oldFile = resolveUploadPath(old.profile_photo);
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
    }

    const fields = [name, firstName, lastName, middleInitial || null, email, phone || null, hasAddress ? address : null];
    let sql = `UPDATE users SET name = ?, first_name = ?, last_name = ?, middle_initial = ?,
               email = ?, phone = ?, address = ?`;

    if (req.user.role === 'student') {
      sql += `, student_number = ?, course_program = ?,
              emergency_contact = ?, emergency_phone = ?`;
      fields.push(
        studentNumber || null,
        courseProgram || null,
        emergencyContact || null,
        emergencyPhone || null
      );
    }

    if (photoPath) {
      sql += ', profile_photo = ?';
      fields.push(photoPath);
    }

    sql += ' WHERE id = ?';
    fields.push(req.user.id);
    await pool.execute(sql, fields);

    const [updated] = await pool.execute('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (updated[0]) setAuthCookie(res, updated[0]);

    return redirectWithFlash(res, '/profile', 'success', 'Profile Updated', 'Your profile has been saved successfully.');
  }

  if (action === 'password') {
    if (req.user.role !== 'admin') {
      return redirectWithFlash(res, '/profile', 'error', 'Not Allowed', 'Only an administrator can change passwords.');
    }
    const currentPassword = req.body.current_password || '';
    const newPassword = req.body.new_password || '';
    const confirmPassword = req.body.confirm_password || '';

    if (!currentPassword || !newPassword || !confirmPassword) {
      return redirectWithFlash(res, '/profile', 'error', 'Password Failed', 'All password fields are required.');
    }
    if (newPassword.length < 6) {
      return redirectWithFlash(res, '/profile', 'error', 'Password Failed', 'New password must be at least 6 characters.');
    }
    if (newPassword !== confirmPassword) {
      return redirectWithFlash(res, '/profile', 'error', 'Password Failed', 'New password and confirmation do not match.');
    }

    const [rows] = await pool.execute('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const user = rows[0];
    if (!user || !(await verifyPassword(currentPassword, user.password))) {
      return redirectWithFlash(res, '/profile', 'error', 'Password Failed', 'Current password is incorrect.');
    }

    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(newPassword), req.user.id]);
    await rememberLoginPassword(req.user.id, newPassword);
    return redirectWithFlash(res, '/profile', 'success', 'Password Updated', 'Your password has been changed successfully.');
  }

  res.redirect('/profile');
});

// ── Role routes ──────────────────────────────────────────────────────

app.use('/student', studentRoutes);
app.use('/supervisor', supervisorRoutes);
app.use('/school', schoolRoutes);
app.use('/api', apiRoutes);

// ── Legacy PHP redirects ─────────────────────────────────────────────

const legacyMap = {
  '/login.php': '/login',
  '/register.php': '/register',
  '/logout.php': '/logout',
  '/index.php': '/',
  '/student/dashboard.php': '/student/dashboard',
  '/student/hours.php': '/student/hours',
  '/student/messages.php': '/student/messages',
  '/student_dashboard.php': '/student/dashboard',
  '/student_hours.php': '/student/hours',
  '/supervisor/dashboard.php': '/supervisor/dashboard',
  '/supervisor/validate.php': '/supervisor/validate',
  '/supervisor/reports.php': '/supervisor/reports',
  '/supervisor/messages.php': '/supervisor/messages',
  '/supervisor_dashboard.php': '/supervisor/dashboard',
  '/company_dashboard.php': '/supervisor/validate',
  '/school/dashboard.php': '/school/dashboard',
  '/school/register.php': '/school/register',
  '/school/validate.php': '/school/validate',
  '/school/reports.php': '/school/reports',
  '/school/messages.php': '/school/messages',
  '/school_dashboard.php': '/school/dashboard',
  '/admin_reports.php': '/school/reports',
  '/api/validate.php': '/api/validate',
};

Object.entries(legacyMap).forEach(([from, to]) => {
  app.get(from, (_req, res) => res.redirect(301, to));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>LSSTI Portal</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#14532d">
<h1>The portal could not open this page</h1>
<p>Refresh the page. If it keeps happening, check the Vercel logs and the database connection.</p>
</body></html>`);
});

// ── Local dev server ─────────────────────────────────────────────────

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`LSSTI Internship Portal running at http://localhost:${port}`);
  });
}

module.exports = app;
