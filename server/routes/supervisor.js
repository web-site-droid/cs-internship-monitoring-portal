const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../db');
const { requireRole, redirectWithFlash } = require('../auth');
const viewHelpers = require('../viewHelpers');
const {
  getUsersByRole,
  validateEvaluationInput,
  sendMessage,
  getUserMessages,
  getUserMessageThreads,
  markDirectMessagesRead,
  getAllStudentsWithPerformance,
  getAllCommunications,
  updateProgramRequiredHours,
  updateStudentRequiredHours,
  grantStudentValidatedHours,
  getAllPortalUsers,
  getPortalUserById,
  updatePortalUser,
  createPortalAccount,
  importStudentsFromRows,
  DEFAULT_STUDENT_PASSWORD,
  deletePortalUser,
  isStudentInternshipCleared,
  validateRequiredHoursInput,
  updateProgramClearanceRequirements,
  getProgramCatalog,
  updateStudentOjtSite,
  assignDailyTask,
  reviewDailyTask,
  getStudentDailyTasks,
  todayDateKey,
  getSupervisorFeedbackTodayMap,
  hasSupervisorFeedbackToday,
  getStudentClearanceDetails,
  getPendingTaskSubmissions,
  createUserNotification,
  getUserNotifications,
  getNotificationCount,
  markAllNotificationsRead,
  groupStudentsByProgram,
} = require('../helpers');
const {
  renderValidate,
  renderReports,
  postReport,
  renderCertificate,
  downloadSharedCertificate,
  postGeneralCertificateUpload,
} = require('../controllers/sharedPages');
const { upload: certificateUpload } = require('../certificateUpload');

const router = express.Router();

async function buildBscsContext(students) {
  const programCatalog = await getProgramCatalog(students, viewHelpers.COURSE_PROGRAMS);
  const bscsGroup = programCatalog.find((g) => g.program === viewHelpers.PROGRAM_NAME)
    || programCatalog[0]
    || {
      program: viewHelpers.PROGRAM_NAME,
      students: students || [],
      student_count: (students || []).length,
      required_hours: 200,
      required_reports: 1,
      required_evaluations: 1,
      custom_requirements: [],
    };
  return { programCatalog, bscsGroup };
}

router.get('/dashboard', requireRole('supervisor'), async (req, res) => {
  const [[pendingHours]] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM internship_hours WHERE status = 'pending'"
  );
  const [[pendingLogs]] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM internship_logs WHERE status = 'pending'"
  );
  const pendingTasks = await getPendingTaskSubmissions(req.user.id);
  const students = await getAllStudentsWithPerformance();
  const { bscsGroup } = await buildBscsContext(students);
  const taskDate = todayDateKey();
  const feedbackTodayByStudent = await getSupervisorFeedbackTodayMap(req.user.id, taskDate);
  const users = req.user.role === 'admin' ? await getAllPortalUsers() : [];

  res.render('supervisor/dashboard', {
    pageTitle: 'Administrator Dashboard',
    pageHeading: `Welcome, ${req.user.name.split(' ')[0]}!`,
    pageSubtitle: 'Manage students, monitor internship progress, and clearance',
    activeNav: 'dashboard',
    pendingHours: pendingHours.cnt,
    pendingLogs: pendingLogs.cnt,
    pendingTasks: pendingTasks.length,
    studentCount: students.length,
    students,
    bscsGroup,
    feedbackTodayByStudent,
    users,
  });
});

router.get('/students', requireRole('supervisor'), (req, res) => {
  res.redirect('/supervisor/dashboard');
});

router.get('/ojt-locations', requireRole('supervisor', 'school'), async (req, res) => {
  const students = await getAllStudentsWithPerformance();
  const { bscsGroup } = await buildBscsContext(students);
  res.render('supervisor/ojt-locations', {
    pageTitle: 'OJT Site Locations',
    pageHeading: 'OJT Site Locations',
    pageSubtitle: 'Configure each student\'s internship GPS site and geofence radius',
    activeNav: 'ojt-locations',
    bscsGroup,
  });
});

router.get('/daily-tasks', requireRole('supervisor'), async (req, res) => {
  const students = await getAllStudentsWithPerformance();
  const { bscsGroup } = await buildBscsContext(students);
  const taskDate = todayDateKey();
  const tasksByStudent = {};
  for (const s of students) {
    tasksByStudent[s.id] = await getStudentDailyTasks(s.id, taskDate);
  }
  res.render('supervisor/daily-tasks', {
    pageTitle: 'Daily Tasks',
    pageHeading: 'Daily Tasks',
    pageSubtitle: 'Assign and monitor daily internship tasks for students',
    activeNav: 'daily-tasks',
    bscsGroup,
    taskDate,
    tasksByStudent,
  });
});

router.get('/validate', requireRole('supervisor', 'school'), (req, res) => renderValidate(req, res));

router.get('/review-reports', requireRole('supervisor'), (req, res) => {
  res.redirect('/supervisor/dashboard');
});

router.get('/reports', requireRole('supervisor', 'school'), (req, res) =>
  renderReports(req, res, req.baseUrl + '/reports')
);

router.post('/reports', requireRole('supervisor', 'school'), (req, res) =>
  postReport(req, res, req.baseUrl + '/reports')
);

router.post('/reports/certificate', requireRole('supervisor', 'school'), (req, res) => {
  certificateUpload.single('certificate')(req, res, (err) => {
    if (err) {
      return redirectWithFlash(
        res,
        req.baseUrl + '/reports',
        'error',
        'Upload Failed',
        err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB).' : 'Invalid file. Use PDF, JPG, PNG, or WebP.'
      );
    }
    postGeneralCertificateUpload(req, res, req.baseUrl + '/reports');
  });
});

router.get('/reports/certificate/download', requireRole('supervisor', 'school'), (req, res) =>
  downloadSharedCertificate(req, res, req.baseUrl + '/reports')
);

router.get('/reports/:id/certificate', requireRole('supervisor', 'school'), (req, res) =>
  renderCertificate(req, res, parseInt(req.params.id, 10), req.baseUrl + '/reports')
);

const studentImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function attendanceDateKey(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function attendanceTimeKey(value) {
  if (!value) return 'no-time';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'no-time';
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

async function loadAttendanceRecords() {
  const [rows] = await pool.query(
    `SELECT t.id, t.student_id, t.time_in_date, t.time_in_at, t.time_out_at,
            t.time_in_photo, t.time_out_photo, u.name AS student_name
     FROM ojt_time_ins t
     JOIN users u ON u.id = t.student_id
     ORDER BY t.time_in_date DESC, t.time_in_at ASC, u.name ASC`
  );
  return rows;
}

function buildAttendanceExplorer(rows) {
  const dates = [];
  rows.forEach((row) => {
    const date = attendanceDateKey(row.time_in_date);
    const time = attendanceTimeKey(row.time_in_at);
    let dateNode = dates[dates.length - 1];
    if (!dateNode || dateNode.key !== date) {
      dateNode = {
        key: date,
        name: viewHelpers.formatDate(row.time_in_date) || date || 'Unknown date',
        type: 'folder',
        children: [],
        present: 0,
        search: '',
      };
      dates.push(dateNode);
    }
    let timeNode = dateNode.children[dateNode.children.length - 1];
    if (!timeNode || timeNode.key !== time) {
      timeNode = {
        key: time,
        name: row.time_in_at ? viewHelpers.formatTime(row.time_in_at) : 'No time',
        type: 'folder',
        children: [],
        records: [],
      };
      dateNode.children.push(timeNode);
    }
    timeNode.records.push(row);
    dateNode.present += 1;
  });

  dates.forEach((dateNode) => {
    const studentNames = [];
    dateNode.children.forEach((timeNode) => {
      const names = timeNode.records.map((record) => record.student_name);
      studentNames.push(...names);
      const when = `${dateNode.name} ${timeNode.name}`;
      const photos = [];
      timeNode.records.forEach((record) => {
        const label = `${record.student_name} · ${dateNode.name} · ${timeNode.name}`;
        if (record.time_in_photo) {
          photos.push({
            type: 'photo',
            name: `${record.student_name} - Time In.jpg`,
            photoUrl: record.time_in_photo,
            photoTitle: 'Time In',
            photoLabel: label,
            search: `${record.student_name} time in ${when}`,
          });
        }
        if (record.time_out_photo) {
          photos.push({
            type: 'photo',
            name: `${record.student_name} - Time Out.jpg`,
            photoUrl: record.time_out_photo,
            photoTitle: 'Time Out',
            photoLabel: label,
            search: `${record.student_name} time out ${when}`,
          });
        }
      });
      const sheetName = 'Attendance Sheet.xlsx';
      timeNode.children = [
        {
          type: 'sheet',
          name: sheetName,
          href: `/supervisor/attendance/sheet?date=${encodeURIComponent(dateNode.key)}&time=${encodeURIComponent(timeNode.key)}`,
          search: `attendance sheet excel ${when} ${names.join(' ')}`,
        },
        ...photos,
      ];
      timeNode.hint = `${timeNode.records.length} present`;
      timeNode.search = `${when} ${names.join(' ')} attendance sheet`;
      delete timeNode.records;
    });
    dateNode.hint = `${dateNode.present} present`;
    dateNode.search = `${dateNode.name} ${studentNames.join(' ')}`;
    delete dateNode.present;
  });

  return { type: 'folder', name: 'Attendance', key: 'root', children: dates, search: 'attendance' };
}

router.get('/attendance/sheet', requireRole('supervisor', 'school'), async (req, res) => {
  const date = String(req.query.date || '');
  const time = String(req.query.time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(\d{2}:\d{2}|no-time)$/.test(time)) {
    return res.status(400).send('Invalid attendance folder.');
  }

  const rows = await loadAttendanceRecords();
  const matches = rows.filter((row) => attendanceDateKey(row.time_in_date) === date && attendanceTimeKey(row.time_in_at) === time);
  if (!matches.length) return res.status(404).send('Attendance sheet not found.');

  const dateLabel = viewHelpers.formatDate(matches[0].time_in_date) || date;
  const timeLabel = time === 'no-time' ? 'No time' : viewHelpers.formatTime(matches[0].time_in_at);
  const sheetRows = [
    ['Attendance Sheet'],
    ['Date', dateLabel],
    ['Time', timeLabel],
    [],
    ['No.', 'Student', 'Time In', 'Time Out', 'Status'],
    ...matches.map((row, index) => [
      index + 1,
      row.student_name,
      row.time_in_at ? viewHelpers.formatTime(row.time_in_at) : '',
      row.time_out_at ? viewHelpers.formatTime(row.time_out_at) : '',
      'Present',
    ]),
  ];
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = `Attendance-${date}-${time.replace(':', '')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

router.get('/attendance', requireRole('supervisor', 'school'), async (req, res) => {
  const rows = await loadAttendanceRecords();
  res.render('supervisor/attendance', {
    pageTitle: 'Attendance',
    pageHeading: 'Attendance',
    pageSubtitle: 'Open a date folder, then a time folder, to download the Excel attendance sheet and view pictures',
    activeNav: 'attendance',
    explorer: buildAttendanceExplorer(rows),
  });
});

router.get('/users/sample', requireRole('admin', 'school', 'supervisor'), (req, res) => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['First Name', 'Last Name', 'Middle Initial', 'Email', 'Phone', 'Student Number'],
    ['Juan', 'Dela Cruz', 'M', 'juan.delacruz@example.com', '09171234567', '2024-00123'],
  ]);
  sheet['!cols'] = [
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 32 }, { wch: 16 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="student-import-sample.xlsx"');
  res.send(buffer);
});

router.get('/users', requireRole('admin', 'school', 'supervisor'), async (req, res) => {
  const canManageUsers = req.user.role === 'admin' || req.user.role === 'school';
  let users = await getAllPortalUsers();
  if (!canManageUsers) users = users.filter((row) => row.role === 'student');
  const editId = canManageUsers ? parseInt(req.query.edit, 10) : 0;
  const editUser = editId ? await getPortalUserById(editId) : null;
  res.render('supervisor/users', {
    pageTitle: canManageUsers ? 'Users' : 'Students',
    pageHeading: canManageUsers ? 'Users' : 'Students',
    pageSubtitle: canManageUsers
      ? 'View every account, and add a student, staff, or admin'
      : 'Add students and view the student list',
    activeNav: 'users',
    users,
    editUser,
    canManageUsers,
    defaultStudentPassword: DEFAULT_STUDENT_PASSWORD,
  });
});

router.post('/users/student', requireRole('admin', 'school', 'supervisor'), async (req, res) => {
  const canChooseRole = req.user.role === 'admin' || req.user.role === 'school';
  const requested = canChooseRole ? String(req.body.role || 'student') : 'student';
  const role = ['student', 'supervisor', 'admin'].includes(requested) ? requested : 'student';
  const result = await createPortalAccount(req.body, role);
  if (result.error) {
    return redirectWithFlash(res, '/supervisor/users', 'error', 'Account Not Added', result.error);
  }
  const typeLabel = role === 'supervisor' ? 'Staff' : role === 'admin' ? 'Admin' : 'Student';
  const passwordNote = role === 'student'
    ? `password ${DEFAULT_STUDENT_PASSWORD}`
    : 'the password you set';
  redirectWithFlash(
    res,
    '/supervisor/users',
    'success',
    'Account Added',
    `${typeLabel} ${result.email} can sign in with ${passwordNote}.`
  );
});

router.post('/users/import', requireRole('admin', 'school', 'supervisor'), (req, res) => {
  studentImportUpload.single('students_file')(req, res, async (err) => {
    if (err) {
      return redirectWithFlash(res, '/supervisor/users', 'error', 'Import Failed', 'Upload an Excel file up to 5 MB.');
    }
    if (!req.file) {
      return redirectWithFlash(res, '/supervisor/users', 'error', 'Import Failed', 'Choose an Excel file first.');
    }
    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const result = await importStudentsFromRows(rows);
      if (!result.created.length && !result.skipped.length) {
        return redirectWithFlash(
          res,
          '/supervisor/users',
          'error',
          'Import Failed',
          'No student rows found. Use columns First Name, Last Name, and Email.'
        );
      }
      const summary = `Added ${result.created.length} student(s).${result.skipped.length ? ` Skipped ${result.skipped.length}: ${result.skipped.slice(0, 3).join(' ')}` : ''}`;
      redirectWithFlash(res, '/supervisor/users', result.created.length ? 'success' : 'error', 'Import Finished', summary);
    } catch (parseErr) {
      console.error('Student import failed:', parseErr);
      redirectWithFlash(res, '/supervisor/users', 'error', 'Import Failed', 'Could not read that Excel file.');
    }
  });
});

router.post('/users/:id/update', requireRole('admin', 'school'), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const error = await updatePortalUser(userId, req.body);
  if (error) {
    return redirectWithFlash(res, `/supervisor/users?edit=${userId}`, 'error', 'Account Not Updated', error);
  }
  redirectWithFlash(res, '/supervisor/users', 'success', 'Account Updated', 'The account information was saved.');
});

router.post('/users/:id/delete', requireRole('admin', 'school'), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const error = await deletePortalUser(userId, req.user.id);
  if (error) {
    return redirectWithFlash(res, '/supervisor/users', 'error', 'Delete Failed', error);
  }
  redirectWithFlash(res, '/supervisor/users', 'success', 'Account Deleted', 'The account was removed.');
});

router.post('/students/grant-hours', requireRole('supervisor'), async (req, res) => {
  const studentId = parseInt(req.body.student_id, 10);
  const hours = parseFloat(req.body.hours);
  const logDate = (req.body.log_date || '').trim();
  const note = (req.body.note || '').trim();
  if (!studentId) {
    return redirectWithFlash(res, '/supervisor/dashboard', 'error', 'Required', 'Select a student.');
  }
  const error = await grantStudentValidatedHours(req.user.id, studentId, hours, logDate || null, note);
  if (error) {
    return redirectWithFlash(res, '/supervisor/dashboard', 'error', 'Grant Failed', error);
  }
  await getStudentClearanceDetails(studentId);
  redirectWithFlash(
    res,
    '/supervisor/dashboard',
    'success',
    'Hours Granted',
    `${hours} validated hour(s) were added for the student.`
  );
});

router.get('/communications', requireRole('supervisor'), async (req, res) => {
  const communications = await getAllCommunications();
  res.render('supervisor/communications', {
    pageTitle: 'Monitor Communications',
    pageHeading: 'Monitor Communications',
    pageSubtitle: 'Overview of messages between students, companies, and admins',
    activeNav: 'communications',
    communications,
  });
});

router.get('/notify', requireRole('supervisor'), async (req, res) => {
  const students = await getUsersByRole('student');
  res.render('supervisor/notify', {
    pageTitle: 'Send Notifications',
    pageHeading: 'Send Notifications',
    pageSubtitle: 'Send alerts and updates to students or companies',
    activeNav: 'notify',
    students,
    companies: await getUsersByRole('school'),
  });
});

router.post('/notify', requireRole('supervisor'), async (req, res) => {
  const recipient = req.body.recipient || 'all_students';
  const subject = (req.body.subject || '').trim() || 'Notification from Administrator';
  const message = (req.body.message || '').trim();

  if (!message) {
    return redirectWithFlash(res, '/supervisor/notify', 'error', 'Failed', 'Message body is required.');
  }

  let receivers = [];
  if (recipient === 'all_students') {
    receivers = await getUsersByRole('student');
  } else if (recipient === 'all_companies') {
    receivers = await getUsersByRole('school');
  } else {
    const id = parseInt(recipient, 10);
    if (id > 0) receivers = [{ id }];
  }

  for (const r of receivers) {
    await createUserNotification(r.id, req.user.id, subject, message, 'broadcast');
  }

  redirectWithFlash(
    res,
    '/supervisor/notify',
    'success',
    'Notifications Sent',
    `Message delivered to ${receivers.length} recipient(s).`
  );
});

router.post('/evaluate', requireRole('supervisor'), async (req, res) => {
  const studentId = parseInt(req.body.student_id, 10) || 0;
  const score = parseInt(req.body.score, 10) || 0;
  const comments = (req.body.comments || '').trim();
  const error = validateEvaluationInput(studentId, score, comments);
  if (error) return redirectWithFlash(res, '/supervisor/dashboard', 'error', 'Evaluation Failed', error);

  if (await hasSupervisorFeedbackToday(req.user.id, studentId)) {
    return redirectWithFlash(
      res,
      '/supervisor/dashboard',
      'error',
      'Already Submitted',
      'You already gave feedback for this student today. You can give new feedback tomorrow.'
    );
  }

  const clearance = await getStudentClearanceDetails(studentId);
  const feedbackEligible = clearance.clearance_status === 'cleared'
    || clearance.validated_hours >= clearance.required_hours;
  if (!feedbackEligible) {
    return redirectWithFlash(
      res,
      '/supervisor/dashboard',
      'error',
      'Hours Not Complete',
      `Feedback is available only after the student completes ${clearance.required_hours} validated hours or is cleared.`
    );
  }

  await pool.execute(
    'INSERT INTO evaluations (supervisor_id, student_id, score, comments) VALUES (?, ?, ?, ?)',
    [req.user.id, studentId, score, comments]
  );
  redirectWithFlash(res, '/supervisor/dashboard', 'success', 'Feedback Submitted', 'Evaluation has been recorded for today.');
});

router.post('/students/required-hours', requireRole('supervisor'), async (req, res) => {
  const courseProgram = (req.body.course_program || '').trim();
  const requiredHours = parseInt(req.body.required_hours, 10);
  const error = await updateProgramRequiredHours(courseProgram, requiredHours);
  if (error) {
    return redirectWithFlash(res, '/supervisor/dashboard', 'error', 'Update Failed', error);
  }
  redirectWithFlash(
    res,
    '/supervisor/dashboard',
    'success',
    'Required Hours Updated',
    `Internship hour requirement saved for ${courseProgram || 'Unassigned Program'}.`
  );
});

router.post('/students/required-hours/selected', requireRole('supervisor'), async (req, res) => {
  const rawIds = req.body.student_ids;
  const studentIds = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map((id) => parseInt(id, 10))
    .filter((id) => id > 0);
  const requiredHours = parseInt(req.body.required_hours, 10);

  const hoursError = validateRequiredHoursInput(requiredHours);
  if (hoursError) {
    return redirectWithFlash(res, '/supervisor/dashboard', 'error', 'Update Failed', hoursError);
  }
  if (!studentIds.length) {
    return redirectWithFlash(res, '/supervisor/dashboard', 'error', 'No Selection', 'Select at least one student.');
  }

  for (const studentId of studentIds) {
    if (await isStudentInternshipCleared(studentId)) {
      return redirectWithFlash(
        res,
        '/supervisor/dashboard',
        'error',
        'Student Cleared',
        'Required hours cannot be changed for students who are already cleared.'
      );
    }
    const error = await updateStudentRequiredHours(studentId, requiredHours);
    if (error) {
      return redirectWithFlash(res, '/supervisor/dashboard', 'error', 'Update Failed', error);
    }
    await getStudentClearanceDetails(studentId);
  }

  redirectWithFlash(
    res,
    '/supervisor/dashboard',
    'success',
    'Required Hours Updated',
    `Set ${requiredHours} required hours for ${studentIds.length} student(s).`
  );
});

router.post('/students/clearance-requirements', requireRole('supervisor'), async (req, res) => {
  const courseProgram = (req.body.course_program || '').trim();
  const requirements = {
    required_hours: parseInt(req.body.required_hours, 10),
    required_reports: parseInt(req.body.required_reports, 10),
    required_evaluations: parseInt(req.body.required_evaluations, 10),
    custom_requirements: req.body.custom_requirements || '',
  };
  const error = await updateProgramClearanceRequirements(courseProgram, requirements);
  if (error) {
    return redirectWithFlash(res, '/supervisor/dashboard', 'error', 'Update Failed', error);
  }
  redirectWithFlash(
    res,
    '/supervisor/dashboard',
    'success',
    'Clearance Requirements Saved',
    `Clearance requirements updated for ${courseProgram || 'Unassigned Program'}.`
  );
});

function pickPlaceNameFromGeocode(data) {
  if (!data || typeof data !== 'object') return '';
  const address = data.address || {};
  return (
    data.name
    || address.amenity
    || address.building
    || address.tourism
    || address.shop
    || address.office
    || address.college
    || address.university
    || address.company
    || address.hospital
    || address.school
    || [address.road, address.suburb || address.village || address.town, address.city || address.municipality]
      .filter(Boolean)
      .join(', ')
    || (data.display_name || '').split(',')[0].trim()
    || ''
  );
}

router.get('/students/ojt-location/reverse-geocode', requireRole('supervisor', 'school'), async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'json');
    url.searchParams.set('zoom', '18');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LSSTI-Student-Information-System/1.0',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Could not look up place name.' });
    }

    const data = await response.json();
    res.json({ name: pickPlaceNameFromGeocode(data) });
  } catch {
    res.status(502).json({ error: 'Could not look up place name.' });
  }
});

router.post('/students/ojt-location', requireRole('supervisor', 'school'), async (req, res) => {
  const rawIds = req.body.student_ids;
  const studentIds = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map((id) => parseInt(id, 10))
    .filter((id) => id > 0);
  if (!studentIds.length) {
    const singleId = parseInt(req.body.student_id, 10) || 0;
    if (singleId > 0) studentIds.push(singleId);
  }
  if (!studentIds.length) {
    return redirectWithFlash(res, '/supervisor/ojt-locations', 'error', 'Update Failed', 'No students selected.');
  }

  const site = {
    site_name: req.body.site_name,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    radius_meters: parseInt(req.body.radius_meters, 10) || 150,
  };

  for (const studentId of studentIds) {
    const error = await updateStudentOjtSite(studentId, site);
    if (error) {
      return redirectWithFlash(res, '/supervisor/ojt-locations', 'error', 'Update Failed', error);
    }
  }

  const message = studentIds.length > 1
    ? `OJT location saved for ${studentIds.length} students at the same site.`
    : 'The student OJT site has been updated.';
  redirectWithFlash(res, '/supervisor/ojt-locations', 'success', 'OJT Location Saved', message);
});

router.post('/students/daily-task', requireRole('supervisor'), async (req, res) => {
  const studentId = parseInt(req.body.student_id, 10) || 0;
  const taskDate = (req.body.task_date || todayDateKey()).trim();
  const error = await assignDailyTask(
    req.user.id,
    studentId,
    taskDate,
    req.body.title,
    req.body.description
  );
  if (error) {
    return redirectWithFlash(res, '/supervisor/daily-tasks', 'error', 'Task Failed', error);
  }
  redirectWithFlash(res, '/supervisor/daily-tasks', 'success', 'Task Assigned', 'Daily task added for the student.');
});

router.post('/tasks/:id/review', requireRole('supervisor'), async (req, res) => {
  const taskId = parseInt(req.params.id, 10) || 0;
  const action = (req.body.action || '').trim();
  const note = req.body.note || '';
  const result = await reviewDailyTask(taskId, req.user.id, action, note, {
    allowAny: req.user.role === 'admin',
  });
  if (result.error) {
    return res.status(400).json({ type: 'error', message: result.error });
  }
  return res.json({ type: 'success', status: result.status, message: `Task ${result.status}.` });
});

router.get('/notifications', requireRole('supervisor'), async (req, res) => {
  const notifications = await getUserNotifications(req.user.id);
  const unreadCount = await getNotificationCount(req.user.id, req.user.role);
  res.render('supervisor/notifications', {
    pageTitle: 'Notifications',
    pageHeading: 'Notifications',
    pageSubtitle: 'System alerts and updates from students',
    activeNav: 'notifications',
    notifications,
    unreadCount,
  });
});

router.post('/notifications/read', requireRole('supervisor'), async (req, res) => {
  await markAllNotificationsRead(req.user.id);
  redirectWithFlash(res, '/supervisor/notifications', 'success', 'All Read', 'All notifications marked as read.');
});

router.get('/messages', requireRole('supervisor'), async (req, res) => {
  await markDirectMessagesRead(req.user.id);
  const threads = await getUserMessageThreads(req.user.id);
  const messages = threads.flatMap((thread) => thread.messages);
  const [contacts] = await pool.query(
    "SELECT id, name, role FROM users WHERE role IN ('student','school') ORDER BY name"
  );
  res.render('partials/messages-page', {
    pageTitle: 'Send Message',
    pageHeading: 'Send Message',
    pageSubtitle: 'Communicate with students and partner companies',
    activeNav: 'messages',
    threads,
    messages,
    contacts,
    formAction: '/supervisor/messages',
  });
});

router.post('/messages', requireRole('supervisor'), async (req, res) => {
  const receiverId = parseInt(req.body.receiver_id, 10) || 0;
  const subject = (req.body.subject || '').trim();
  const message = (req.body.message || '').trim();
  if (receiverId <= 0 || !message) {
    return redirectWithFlash(res, '/supervisor/messages', 'error', 'Message Failed', 'Recipient and message are required.');
  }
  await sendMessage(req.user.id, receiverId, subject, message);
  redirectWithFlash(res, '/supervisor/messages', 'success', 'Message Sent', 'Your message has been delivered.');
});

module.exports = router;
