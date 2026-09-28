const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { redirectWithFlash } = require('../auth');
const {
  getStudentsForClearanceReport,
  generateClearanceReport,
  getClearanceReportById,
  getGeneralCertificate,
  setGeneralCertificate,
  ensureClearanceReportColumns,
  getPendingTaskSubmissions,
  getReviewedTaskSubmissions,
  getStudentTaskRecords,
  getAllStudentsWithPerformance,
  getStudentClearanceDetails,
} = require('../helpers');

async function renderValidate(req, res) {
  const canValidateTasks = req.user.role === 'supervisor' || req.user.role === 'admin';
  const taskScopeId = req.user.role === 'supervisor' ? req.user.id : null;
  const pendingTasks = canValidateTasks
    ? await getPendingTaskSubmissions(taskScopeId)
    : await getPendingTaskSubmissions();
  const reviewedTasks = canValidateTasks
    ? await getReviewedTaskSubmissions(taskScopeId)
    : [];
  const [students, studentTasks] = await Promise.all([
    getAllStudentsWithPerformance(),
    getStudentTaskRecords(taskScopeId),
  ]);
  const unclearedStudents = students
    .filter((student) => student.clearance_status !== 'cleared')
    .map((student) => ({
      ...student,
      validated_hours: Number(student.validated_hours) || 0,
      required_hours: Number(student.required_hours) || 0,
      remaining_hours: Math.max(0, (Number(student.required_hours) || 0) - (Number(student.validated_hours) || 0)),
    }));
  res.render('supervisor/validate', {
    pageTitle: 'Validate Activities',
    pageHeading: 'Validate Activities',
    pageSubtitle: req.user.role === 'school'
      ? 'Approve or reject student hour logs and internship reports'
      : 'Review daily task submissions. Approved and rejected tasks stay on record.',
    activeNav: 'validate',
    unclearedStudents,
    studentTasks,
    pendingTasks,
    reviewedTasks,
    apiUrl: '/api/validate',
    canValidateHours: req.user.role === 'school',
    canValidateTasks,
  });
}

async function renderReports(req, res, reportPath) {
  await ensureClearanceReportColumns();
  const allStudents = (await getStudentsForClearanceReport()).map((s) => ({
    ...s,
    validated_hours: Number(s.validated_hours) || 0,
    required_hours: Number(s.required_hours) || 200,
    hours_met: Boolean(s.hours_met),
  }));
  const students = allStudents.filter((s) => s.hours_met);
  const statusByStudent = new Map(allStudents.map((s) => [s.id, s.clearance_status]));
  const [reportsQueryRows] = await pool.query(
    `SELECT cr.*, u.name AS student_name, g.name AS generated_by_name
     FROM clearance_reports cr
     JOIN users u ON cr.student_id = u.id
     JOIN users g ON cr.generated_by = g.id
     INNER JOIN (
       SELECT student_id, MAX(id) AS latest_id
       FROM clearance_reports
       GROUP BY student_id
     ) latest ON cr.id = latest.latest_id
     ORDER BY cr.generated_at DESC`
  );
  const reportsRaw = [];
  const seenStudents = new Set();
  for (const report of reportsQueryRows) {
    if (seenStudents.has(report.student_id)) continue;
    seenStudents.add(report.student_id);
    reportsRaw.push(report);
  }
  const reportedStudentIds = new Set(reportsRaw.map((report) => report.student_id));
  const studentsEligible = students.filter((s) => !reportedStudentIds.has(s.id));
  const reports = reportsRaw.map((report) => ({
    ...report,
    clearance_status: statusByStudent.get(report.student_id) ?? report.clearance_status ?? 'pending',
  }));
  const generalCertificate = await getGeneralCertificate();
  res.render('supervisor/reports', {
    pageTitle: 'Clearance Reports',
    pageHeading: 'Clearance Reports',
    pageSubtitle: 'Generate one report per student and upload one shared certificate for all students with a report',
    activeNav: 'reports',
    students: studentsEligible,
    allStudents,
    reports,
    generalCertificate,
    reportPath,
  });
}

async function postReport(req, res, reportPath) {
  const studentId = parseInt(req.body.student_id, 10) || 0;
  if (studentId <= 0) {
    return redirectWithFlash(res, reportPath, 'error', 'Report Failed', 'Please select a student.');
  }
  const result = await generateClearanceReport(studentId, req.user.id);
  if (result.error) {
    return redirectWithFlash(res, reportPath, 'error', 'Report Failed', result.error);
  }
  redirectWithFlash(
    res,
    reportPath,
    'success',
    result.updated ? 'Report Updated' : 'Report Generated',
    result.updated
      ? 'Clearance report refreshed.'
      : 'Clearance report created. Upload the shared certificate below when ready.'
  );
}

function sendCertificateFile(res, webPath, downloadName) {
  const { resolveUploadPath } = require('../uploadPaths');
  const absPath = resolveUploadPath(webPath);
  if (!fs.existsSync(absPath)) {
    return false;
  }
  const ext = path.extname(absPath) || '.pdf';
  const filename = downloadName || `internship-certificate${ext}`;
  if (res.req.query.download === '1') {
    res.download(absPath, filename);
    return true;
  }
  res.sendFile(absPath);
  return true;
}

async function renderCertificate(req, res, reportId, backPath) {
  const report = await getClearanceReportById(reportId);
  if (!report) {
    return redirectWithFlash(res, backPath, 'error', 'Not Found', 'Certificate report was not found.');
  }

  const isStudent = req.user.role === 'student';
  const isStaff = req.user.role === 'supervisor' || req.user.role === 'admin' || req.user.role === 'school';
  if (isStudent && report.student_id !== req.user.id) {
    return redirectWithFlash(res, '/student/clearance', 'error', 'Access Denied', 'You can only view your own certificate.');
  }
  if (!isStudent && !isStaff) {
    return redirectWithFlash(res, backPath, 'error', 'Access Denied', 'You do not have permission to view this certificate.');
  }

  const generalCertificate = await getGeneralCertificate();
  const webPath = generalCertificate?.certificate_path
    || (report.certificate_type === 'uploaded' ? report.certificate_path : null);
  if (!webPath) {
    return redirectWithFlash(res, backPath, 'error', 'No Certificate', 'No certificate has been uploaded yet.');
  }

  const safeName = `${(report.student_name || 'student').replace(/[^\w\-]+/g, '_')}-certificate`;
  if (sendCertificateFile(res, webPath, `${safeName}${path.extname(webPath) || '.pdf'}`)) {
    return undefined;
  }
  return redirectWithFlash(res, backPath, 'error', 'No Certificate', 'Certificate file is missing on the server.');
}

async function downloadSharedCertificate(req, res, backPath) {
  const isStaff = req.user.role === 'supervisor' || req.user.role === 'admin' || req.user.role === 'school';
  const isStudent = req.user.role === 'student';
  if (!isStaff && !isStudent) {
    return redirectWithFlash(res, backPath, 'error', 'Access Denied', 'You do not have permission to download this certificate.');
  }
  if (isStudent) {
    const clearance = await getStudentClearanceDetails(req.user.id);
    if (!clearance.certificate) {
      return redirectWithFlash(res, backPath, 'error', 'Not Available', 'Your certificate is not ready yet.');
    }
  }

  const generalCertificate = await getGeneralCertificate();
  const webPath = generalCertificate?.certificate_path;
  if (!webPath) {
    return redirectWithFlash(res, backPath, 'error', 'No Certificate', 'No certificate has been uploaded yet.');
  }

  if (sendCertificateFile(res, webPath, `lssti-internship-certificate${path.extname(webPath) || '.pdf'}`)) {
    return undefined;
  }
  return redirectWithFlash(res, backPath, 'error', 'No Certificate', 'Certificate file is missing on the server.');
}

async function postGeneralCertificateUpload(req, res, reportPath) {
  if (!req.file) {
    return redirectWithFlash(res, reportPath, 'error', 'Upload Failed', 'Please choose a PDF or image file (max 5 MB).');
  }

  try {
    const filePath = `/uploads/certificates/${req.file.filename}`;
    await setGeneralCertificate(filePath, req.user.id);
    redirectWithFlash(
      res,
      reportPath,
      'success',
      'Certificate Uploaded',
      'Shared certificate saved. All students with a clearance report can view this file.'
    );
  } catch (err) {
    console.error('Certificate upload failed:', err);
    redirectWithFlash(
      res,
      reportPath,
      'error',
      'Upload Failed',
      'Could not save the certificate. Restart the server and try again.'
    );
  }
}

module.exports = {
  renderValidate,
  renderReports,
  postReport,
  renderCertificate,
  downloadSharedCertificate,
  postGeneralCertificateUpload,
};
