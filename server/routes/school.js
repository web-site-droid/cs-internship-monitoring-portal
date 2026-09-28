const express = require('express');
const pool = require('../db');
const { requireRole, redirectWithFlash } = require('../auth');
const { getOrganizationList, sendMessage, getUserMessageThreads, markDirectMessagesRead, getAllStudentsWithPerformance, getAllPortalUsers, getUserNotifications, getNotificationCount, markAllNotificationsRead } = require('../helpers');
const { renderValidate, renderReports, postReport, renderCertificate, postGeneralCertificateUpload } = require('../controllers/sharedPages');
const { upload: certificateUpload } = require('../certificateUpload');

const router = express.Router();

router.get('/dashboard', requireRole('school'), async (req, res) => {
  const [users, students] = await Promise.all([
    getAllPortalUsers(),
    getAllStudentsWithPerformance(),
  ]);

  res.render('school/dashboard', {
    pageTitle: 'Company Dashboard',
    pageHeading: `Welcome, ${req.user.name.split(' ')[0]}!`,
    pageSubtitle: 'Validate student activity and provide feedback',
    activeNav: 'dashboard',
    studentCount: students.length,
    staffCount: users.filter((account) => account.role === 'supervisor').length,
    userCount: users.length,
    clearedCount: students.filter((student) => student.clearance_status === 'cleared').length,
    users,
  });
});

router.get('/validate', requireRole('school'), (req, res) => renderValidate(req, res));

router.get('/review-reports', requireRole('school'), (req, res) => {
  res.redirect('/school/dashboard');
});

router.get('/performance', requireRole('school'), async (req, res) => {
  const students = await getAllStudentsWithPerformance();
  res.render('school/performance', {
    pageTitle: 'Performance Records',
    pageHeading: 'Access Performance Records',
    pageSubtitle: 'View student hours, reports, and evaluation summaries',
    activeNav: 'performance',
    students,
  });
});

router.get('/reports', requireRole('school'), (req, res) => renderReports(req, res, '/school/reports'));
router.post('/reports', requireRole('school'), (req, res) => postReport(req, res, '/school/reports'));

router.post('/reports/certificate', requireRole('school'), (req, res) => {
  certificateUpload.single('certificate')(req, res, (err) => {
    if (err) {
      return redirectWithFlash(
        res,
        '/school/reports',
        'error',
        'Upload Failed',
        err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB).' : 'Invalid file. Use PDF, JPG, PNG, or WebP.'
      );
    }
    postGeneralCertificateUpload(req, res, '/school/reports');
  });
});

router.get('/reports/certificate/download', requireRole('school'), (req, res) => {
  const { downloadSharedCertificate } = require('../controllers/sharedPages');
  return downloadSharedCertificate(req, res, '/school/reports');
});

router.get('/reports/:id/certificate', requireRole('school'), (req, res) =>
  renderCertificate(req, res, parseInt(req.params.id, 10), '/school/reports')
);

router.get('/register', requireRole('school'), async (req, res) => {
  const organizations = await getOrganizationList();
  res.render('school/register', {
    pageTitle: 'Company Profile',
    pageHeading: 'Company Registration',
    pageSubtitle: 'Manage your organization details on the portal',
    activeNav: 'register',
    organizations,
  });
});

router.post('/register', requireRole('school'), async (req, res) => {
  const action = req.body.action || 'register';

  if (action === 'register') {
    const name = (req.body.name || '').trim();
    const contactPerson = (req.body.contact_person || '').trim();
    const contactEmail = (req.body.contact_email || '').trim();
    const address = (req.body.address || '').trim();

    if (!name) {
      return redirectWithFlash(res, '/school/register', 'error', 'Registration Failed', 'Organization name is required.');
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return redirectWithFlash(res, '/school/register', 'error', 'Registration Failed', 'Enter a valid contact email.');
    }

    await pool.execute(
      'INSERT INTO organizations (name, contact_person, contact_email, address, registered_by) VALUES (?, ?, ?, ?, ?)',
      [name, contactPerson, contactEmail, address, req.user.id]
    );
    return redirectWithFlash(res, '/school/register', 'success', 'Registered', 'Your company profile has been saved.');
  }

  if (action === 'approve') {
    const orgId = parseInt(req.body.org_id, 10) || 0;
    const approve = parseInt(req.body.approve, 10) || 0;
    if (orgId > 0) {
      await pool.execute('UPDATE organizations SET approved = ? WHERE id = ?', [approve, orgId]);
      redirectWithFlash(res, '/school/register', 'success', 'Updated', approve ? 'Organization approved.' : 'Approval removed.');
      return;
    }
  }

  res.redirect('/school/register');
});

router.get('/notifications', requireRole('school'), async (req, res) => {
  const notifications = await getUserNotifications(req.user.id);
  const unreadCount = await getNotificationCount(req.user.id);
  res.render('school/notifications', {
    pageTitle: 'Notifications',
    pageHeading: 'Notifications',
    pageSubtitle: 'Alerts and updates from the internship administrator',
    activeNav: 'notifications',
    notifications,
    unreadCount,
  });
});

router.post('/notifications/read', requireRole('school'), async (req, res) => {
  await markAllNotificationsRead(req.user.id);
  redirectWithFlash(res, '/school/notifications', 'success', 'All Read', 'All notifications marked as read.');
});

router.get('/messages', requireRole('school'), async (req, res) => {
  await markDirectMessagesRead(req.user.id);
  const threads = await getUserMessageThreads(req.user.id);
  const messages = threads.flatMap((thread) => thread.messages);
  const [contacts] = await pool.query(
    "SELECT id, name, role FROM users WHERE role IN ('student','supervisor') AND id <> ? ORDER BY role, name",
    [req.user.id]
  );
  res.render('partials/messages-page', {
    pageTitle: 'Send Message',
    pageHeading: 'Send Message',
    pageSubtitle: 'Reply to students and message staff',
    activeNav: 'messages',
    threads,
    messages,
    contacts,
    formAction: '/school/messages',
  });
});

router.post('/messages', requireRole('school'), async (req, res) => {
  const receiverId = parseInt(req.body.receiver_id, 10) || 0;
  const subject = (req.body.subject || '').trim();
  const message = (req.body.message || '').trim();
  if (receiverId <= 0 || !message) {
    return redirectWithFlash(res, '/school/messages', 'error', 'Message Failed', 'Recipient and message are required.');
  }
  await sendMessage(req.user.id, receiverId, subject, message);
  redirectWithFlash(res, '/school/messages', 'success', 'Message Sent', 'Your message has been delivered to the administrator.');
});

module.exports = router;
