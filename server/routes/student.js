const express = require('express');
const pool = require('../db');
const { requireRole, redirectWithFlash } = require('../auth');
const { upload: timeInUpload, publicUploadPath } = require('../ojtTimeInUpload');
const { upload: taskProofUpload } = require('../taskProofUpload');
const { renderCertificate } = require('../controllers/sharedPages');
const {
  getStudentStats,
  getStudentClearanceDetails,
  getStudentNotifications,
  getNotificationCount,
  markAllNotificationsRead,
  ensureInternshipHoursColumns,
  getStudentOjtSite,
  getTodayTimeIn,
  getActiveOjtSession,
  getTodayOjtSessions,
  getStudentOjtHistory,
  verifyOjtLocation,
  recordOjtTimeIn,
  recordOjtTimeOut,
  getStudentDailyTasks,
  getStudentTaskHistory,
  getTaskDisplayStatus,
  getStudentAttendanceByDate,
  getInternshipStartDate,
  submitTaskProgress,
  submitDailyProgressReport,
  isProgressReadyForTimeOut,
  setDailyTaskStatus,
  formatDateKey,
  sendMessage,
  getUserMessageThreads,
  markDirectMessagesRead,
  getStudentHoursProgress,
  isStudentInternshipCleared,
  isOjtTestBypass,
  ensureDailyTasksTable,
} = require('../helpers');

const router = express.Router();

async function loadStudentOjtContext(studentId) {
  const today = formatDateKey(new Date());
  const attendanceLocked = await isStudentInternshipCleared(studentId);
  const ojtSite = attendanceLocked ? null : await getStudentOjtSite(studentId);
  const todaySessions = ojtSite ? await getTodayOjtSessions(studentId, today) : [];
  const todayTimeIn = ojtSite ? await getActiveOjtSession(studentId, today) : null;
  const ojtHistory = ojtSite
    ? (await getStudentOjtHistory(studentId)).filter((r) => r.time_in_date !== today)
    : [];
  const todayTasks = ojtSite ? await getStudentDailyTasks(studentId, today) : [];
  const progressStatus = ojtSite && todayTimeIn?.within_geofence
    ? await isProgressReadyForTimeOut(studentId, today)
    : { ready: false };

  return {
    today,
    ojtSite,
    todayTimeIn,
    todaySessions,
    activeSession: todayTimeIn,
    todayTasks,
    progressStatus,
    progressReady: Boolean(progressStatus.ready),
    ojtTestBypass: isOjtTestBypass(),
    attendanceLocked,
  };
}

router.get('/dashboard', requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  await ensureDailyTasksTable();
  const [stats, clearance, notifications, ojt, taskCountRows] = await Promise.all([
    getStudentStats(studentId),
    getStudentClearanceDetails(studentId),
    getStudentNotifications(studentId),
    loadStudentOjtContext(studentId),
    pool.execute(
      `SELECT COUNT(*) AS total FROM student_daily_tasks
       WHERE student_id = ?
         AND student_progress IS NOT NULL
         AND TRIM(student_progress) <> ''
         AND proof_photo IS NOT NULL
         AND TRIM(proof_photo) <> ''`,
      [studentId]
    ),
  ]);
  const submittedTaskCount = Number(taskCountRows[0][0]?.total || 0);
  const hoursProgress = {
    completed_hours: clearance.validated_hours,
    required_hours: clearance.required_hours,
    remaining_hours: Math.max(0, Math.round((clearance.required_hours - clearance.validated_hours) * 100) / 100),
    progress: clearance.progress,
  };
  res.render('student/dashboard', {
    pageTitle: 'Student Dashboard',
    pageHeading: `Welcome, ${req.user.name.split(' ')[0]}!`,
    pageSubtitle: 'Your BSCS internship progress at a glance',
    activeNav: 'dashboard',
    stats,
    submittedTaskCount,
    clearance,
    recentNotifications: notifications.slice(0, 3),
    hoursProgress,
    ojt,
  });
});

router.get('/hours', requireRole('student'), async (req, res) => {
  await ensureInternshipHoursColumns();
  const studentId = req.user.id;
  const [entriesRaw, taskHistory, attendanceByDate, sessionRows] = await Promise.all([
    pool.execute(
      'SELECT * FROM internship_hours WHERE student_id = ? ORDER BY created_at DESC',
      [studentId]
    ).then(([rows]) => rows),
    getStudentTaskHistory(studentId, 500),
    getStudentAttendanceByDate(studentId),
    pool.execute(
      `SELECT time_in_date, time_in_at, time_out_at, auto_hours, daily_progress_report
       FROM ojt_time_ins
       WHERE student_id = ?
       ORDER BY time_in_at DESC`,
      [studentId]
    ).then(([rows]) => rows),
  ]);
  const totalValidated = entriesRaw.reduce(
    (sum, e) => (e.status === 'validated' ? sum + Number(e.hours) : sum),
    0
  );

  const tasksByDate = {};
  taskHistory.forEach((task) => {
    const key = task.task_date;
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push({
      id: task.id,
      title: task.title,
      status: task.status || 'pending',
      review_note: task.review_note || '',
      displayStatus: getTaskDisplayStatus(task),
      student_progress: task.student_progress || '',
    });
  });

  function taskResultLabel(task) {
    if (task.status === 'approved') return 'Approved';
    if (task.status === 'rejected') return 'Rejected';
    if (task.student_progress) return 'Pending';
    return '';
  }

  function studentLogForDate(dateKey, dailyReport) {
    const lines = (tasksByDate[dateKey] || []).map((task) => {
      const label = taskResultLabel(task);
      const progress = task.student_progress ? `: ${task.student_progress}` : '';
      const note = task.status === 'rejected' && task.review_note ? ` — ${task.review_note}` : '';
      return `${task.title}${label ? ` [${label}]` : ''}${progress}${note}`;
    });
    if (dailyReport && String(dailyReport).trim()) lines.unshift(String(dailyReport).trim());
    return lines.join('\n');
  }

  function dayResult(dateKey) {
    const labels = [];
    const tasks = tasksByDate[dateKey] || [];
    if (tasks.some((task) => task.status === 'approved')) labels.push('Approved');
    if (tasks.some((task) => task.status === 'rejected')) labels.push('Rejected');
    if (tasks.some((task) => task.status !== 'approved' && task.status !== 'rejected' && task.student_progress)) {
      labels.push('Pending');
    }
    return labels.join(', ');
  }

  const sessionDates = new Set();
  const sessionEntries = sessionRows.map((session) => {
    const logDate = formatDateKey(session.time_in_date);
    sessionDates.add(logDate);
    const hours = session.auto_hours != null ? Number(session.auto_hours) : null;
    return {
      log_date: logDate,
      time_in_at: session.time_in_at,
      time_out_at: session.time_out_at,
      hours,
      description: studentLogForDate(logDate, session.daily_progress_report),
      result: dayResult(logDate),
      sort_at: session.time_in_at || session.time_in_date,
    };
  });

  const otherEntries = entriesRaw
    .filter((entry) => entry.submit_ip !== 'ojt-auto' || !sessionDates.has(formatDateKey(entry.log_date)))
    .map((entry) => ({
      log_date: formatDateKey(entry.log_date),
      time_in_at: null,
      time_out_at: null,
      hours: Number(entry.hours),
      description: entry.description || studentLogForDate(formatDateKey(entry.log_date), ''),
      result: dayResult(formatDateKey(entry.log_date)),
      sort_at: entry.created_at || entry.log_date,
    }));

  const entries = [...sessionEntries, ...otherEntries].sort(
    (a, b) => new Date(b.sort_at) - new Date(a.sort_at)
  );

  const entriesByDate = {};
  entries.forEach((entry) => {
    if (!entriesByDate[entry.log_date]) entriesByDate[entry.log_date] = [];
    entriesByDate[entry.log_date].push({
      hours: entry.hours,
      status: 'validated',
      description: entry.description || '',
    });
  });

  const today = formatDateKey(new Date());
  const internshipStartDate = getInternshipStartDate(attendanceByDate, tasksByDate);

  res.render('student/hours', {
    pageTitle: 'Hour Log History',
    pageHeading: 'Hour Log History',
    pageSubtitle: 'Your time in, time out, and daily student logs',
    activeNav: 'hours',
    entries,
    entriesByDate,
    tasksByDate,
    attendanceByDate,
    internshipStartDate,
    totalValidated,
    today,
  });
});

router.post('/time-in/verify', requireRole('student'), async (req, res) => {
  const latitude = parseFloat(req.body.latitude);
  const longitude = parseFloat(req.body.longitude);
  const result = await verifyOjtLocation(req.user.id, latitude, longitude);

  if (result.error) {
    return res.status(result.attendance_locked ? 403 : 400).json({
      type: 'error',
      title: result.attendance_locked ? 'Internship Complete' : 'Location Check Failed',
      message: result.error,
    });
  }

  return res.json({
    type: 'success',
    within_geofence: result.within_geofence,
    distance: result.distance,
    site: result.site,
    message: result.message,
  });
});

router.post('/time-in', requireRole('student'), (req, res, next) => {
  timeInUpload.single('photo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Photo must be 3 MB or smaller.'
        : 'Invalid photo. Use JPG, PNG, or WEBP.';
      return res.status(400).json({ type: 'error', title: 'Upload Failed', message: msg });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      type: 'error',
      title: 'Photo Required',
      message: 'Take a photo with the camera to complete time-in.',
    });
  }

  const latitude = parseFloat(req.body.latitude);
  const longitude = parseFloat(req.body.longitude);
  const accuracy = req.body.accuracy != null ? parseFloat(req.body.accuracy) : null;
  const photoPath = publicUploadPath(req.file.path);
  const result = await recordOjtTimeIn(req.user.id, latitude, longitude, accuracy, photoPath);

  if (result.error && !result.success) {
    return res.status(result.attendance_locked ? 403 : 400).json({
      type: 'error',
      title: result.attendance_locked
        ? 'Internship Complete'
        : (result.within_geofence === false ? 'Outside OJT Site' : 'Time In Failed'),
      message: result.error,
      distance: result.distance,
    });
  }

  return res.json({
    type: 'success',
    title: 'Timed In',
    message: 'Photo and GPS verified. Complete your tasks, then time out to auto-log your hours.',
    timeIn: result.timeIn,
    distance: result.distance,
  });
});

router.post('/time-out/verify', requireRole('student'), async (req, res) => {
  const latitude = parseFloat(req.body.latitude);
  const longitude = parseFloat(req.body.longitude);
  const result = await verifyOjtLocation(req.user.id, latitude, longitude);

  if (result.error) {
    return res.status(result.attendance_locked ? 403 : 400).json({
      type: 'error',
      title: result.attendance_locked ? 'Internship Complete' : 'Location Check Failed',
      message: result.error,
    });
  }

  return res.json({
    type: 'success',
    within_geofence: result.within_geofence,
    distance: result.distance,
    site: result.site,
    message: result.message,
  });
});

router.post('/time-out', requireRole('student'), (req, res, next) => {
  timeInUpload.single('photo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Photo must be 3 MB or smaller.'
        : 'Invalid photo. Use JPG, PNG, or WEBP.';
      return res.status(400).json({ type: 'error', title: 'Upload Failed', message: msg });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      type: 'error',
      title: 'Photo Required',
      message: 'Take a photo with the camera to complete time-out.',
    });
  }

  const latitude = parseFloat(req.body.latitude);
  const longitude = parseFloat(req.body.longitude);
  const photoPath = publicUploadPath(req.file.path);
  const result = await recordOjtTimeOut(req.user.id, latitude, longitude, photoPath);

  if (result.error && !result.success) {
    return res.status(result.attendance_locked ? 403 : 400).json({
      type: 'error',
      title: result.attendance_locked
        ? 'Internship Complete'
        : (result.within_geofence === false ? 'Outside OJT Site' : result.progress_required ? 'Progress Required' : 'Time Out Failed'),
      message: result.error,
      distance: result.distance,
    });
  }

  return res.json({
    type: 'success',
    title: 'Timed Out',
    message: `${result.hours.toFixed(2)} hours were auto-logged for today and sent for company validation.`,
    timeIn: result.timeIn,
    hours: result.hours,
    distance: result.distance,
  });
});

router.post('/tasks/:id/progress', requireRole('student'), (req, res, next) => {
  taskProofUpload.single('photo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Photo must be 3 MB or smaller.'
        : 'Invalid photo. Use JPG, PNG, or WEBP.';
      return res.status(400).json({ type: 'error', message: msg });
    }
    next();
  });
}, async (req, res) => {
  const taskId = parseInt(req.params.id, 10) || 0;
  const progress = req.body.progress || '';
  const photoPath = req.file ? `/uploads/task-proof/${req.file.filename}` : null;
  const result = await submitTaskProgress(taskId, req.user.id, progress, photoPath);
  if (result.error) {
    return res.status(400).json({ type: 'error', message: result.error });
  }
  const progressStatus = await isProgressReadyForTimeOut(req.user.id);
  return res.json({
    type: 'success',
    status: result.status,
    progressReady: progressStatus.ready,
    message: progressStatus.ready
      ? 'All requirements met. You may now time out.'
      : 'Complete assigned tasks on Submit Reports before timing out.',
  });
});

router.post('/daily-progress', requireRole('student'), async (req, res) => {
  const result = await submitDailyProgressReport(req.user.id, req.body.progress);
  if (result.error) {
    return res.status(400).json({ type: 'error', message: result.error });
  }
  return res.json({
    type: 'success',
    progressReady: true,
    message: 'Daily progress submitted. You may now time out.',
  });
});

router.post('/tasks/:id/toggle', requireRole('student'), async (req, res) => {
  const taskId = parseInt(req.params.id, 10) || 0;
  const completed = req.body.completed === true || req.body.completed === 'true' || req.body.completed === 1;
  const result = await setDailyTaskStatus(taskId, req.user.id, completed);
  if (result.error) {
    return res.status(400).json({ type: 'error', message: result.error });
  }
  return res.json({ type: 'success', status: result.status });
});

router.get('/reports', requireRole('student'), async (req, res) => {
  const today = formatDateKey(new Date());
  const taskHistory = await getStudentTaskHistory(req.user.id, 500);
  const tasksByDate = {};
  taskHistory.forEach((task) => {
    const key = task.task_date;
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push({
      id: task.id,
      title: task.title,
      description: task.description || '',
      supervisor_name: task.supervisor_name,
      status: task.status,
      displayStatus: getTaskDisplayStatus(task),
      student_progress: task.student_progress || '',
      proof_photo: task.proof_photo || '',
      review_note: task.review_note || '',
      progress_submitted_at: task.progress_submitted_at,
      reviewed_at: task.reviewed_at,
    });
  });
  const todayTasks = tasksByDate[today] || [];
  const attendanceByDate = await getStudentAttendanceByDate(req.user.id);
  const internshipStartDate = getInternshipStartDate(attendanceByDate, tasksByDate);
  res.render('student/reports', {
    pageTitle: 'Submit Reports',
    pageHeading: 'Submit Reports',
    pageSubtitle: 'Complete assigned tasks with feedback and photo proof',
    activeNav: 'reports',
    todayTasks,
    taskHistory,
    tasksByDate,
    attendanceByDate,
    internshipStartDate,
    today,
  });
});

router.get('/clearance', requireRole('student'), async (req, res) => {
  const clearance = await getStudentClearanceDetails(req.user.id);
  res.render('student/clearance', {
    pageTitle: 'Clearance Status',
    pageHeading: 'View Clearance Status',
    pageSubtitle: 'Track your progress toward internship clearance',
    activeNav: 'clearance',
    clearance,
  });
});

router.get('/certificate/download', requireRole('student'), (req, res) => {
  const { downloadSharedCertificate } = require('../controllers/sharedPages');
  return downloadSharedCertificate(req, res, '/student/clearance');
});

router.get('/certificate/:id', requireRole('student'), (req, res) =>
  renderCertificate(req, res, parseInt(req.params.id, 10), '/student/clearance')
);

router.get('/notifications', requireRole('student'), async (req, res) => {
  const notifications = await getStudentNotifications(req.user.id);
  const unreadCount = await getNotificationCount(req.user.id);
  res.render('student/notifications', {
    pageTitle: 'Notifications',
    pageHeading: 'Receive Notifications',
    pageSubtitle: 'Status updates and feedback on your submissions',
    activeNav: 'notifications',
    notifications,
    unreadCount,
  });
});

router.post('/notifications/read', requireRole('student'), async (req, res) => {
  await markAllNotificationsRead(req.user.id);
  redirectWithFlash(res, '/student/notifications', 'success', 'All Read', 'All notifications marked as read.');
});

router.get('/messages', requireRole('student'), async (req, res) => {
  await markDirectMessagesRead(req.user.id);
  const threads = await getUserMessageThreads(req.user.id);
  const messages = threads.flatMap((thread) => thread.messages);
  const [contacts] = await pool.query(
    "SELECT id, name, role FROM users WHERE role IN ('supervisor','admin','school') ORDER BY role, name"
  );
  res.render('student/messages', {
    pageTitle: 'Send Message',
    pageHeading: 'Send Message',
    pageSubtitle: 'Message your supervisor/teacher or an admin',
    activeNav: 'messages',
    threads,
    messages,
    contacts,
  });
});

router.post('/messages', requireRole('student'), async (req, res) => {
  const receiverId = parseInt(req.body.receiver_id, 10) || 0;
  const subject = (req.body.subject || '').trim();
  const message = (req.body.message || '').trim();
  if (receiverId <= 0 || !message) {
    return redirectWithFlash(res, '/student/messages', 'error', 'Message Failed', 'Choose a supervisor/teacher or an admin, then write your message.');
  }
  const [[receiver]] = await pool.query(
    "SELECT id FROM users WHERE id = ? AND role IN ('supervisor','admin','school') LIMIT 1",
    [receiverId]
  );
  if (!receiver) {
    return redirectWithFlash(res, '/student/messages', 'error', 'Message Failed', 'Students can message a supervisor/teacher or an admin.');
  }
  await sendMessage(req.user.id, receiverId, subject, message);
  redirectWithFlash(res, '/student/messages', 'success', 'Message Sent', 'Your message has been delivered.');
});

module.exports = router;