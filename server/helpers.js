const pool = require('./db');
const isPostgres = Boolean(pool.isPostgres);

let mysqlProfileColumnsReady = false;
let mysqlClearanceColumnsReady = false;
let mysqlNotificationTablesReady = false;
let schemaColumnsReady = false;
let internshipClearanceColumnReady = false;

const navDataCache = new Map();
const NAV_DATA_CACHE_MS = 12000;

function isDupColumnError(err) {
  return err && (err.code === 'ER_DUP_FIELDNAME' || err.code === '42701');
}

const MAX_HOURS_PER_DAY = 12;
const DEFAULT_STUDENT_PASSWORD = 'lssti12345';
const MAX_HOURS_PER_WEEK = 48;
const MIN_HOURS_PER_ENTRY = 0.25;
const MIN_HOURS_DESCRIPTION = 10;

const SYSTEM_MESSAGE_SUBJECTS = ['Password Reset Request'];

function systemMessageSubjectClause(alias = 'c') {
  const placeholders = SYSTEM_MESSAGE_SUBJECTS.map(() => '?').join(', ');
  return `${alias}.subject IN (${placeholders})`;
}
function isOjtTestBypass() {
  return (process.env.OJT_TEST_BYPASS === 'true' || process.env.OJT_TEST_BYPASS === '1')
    && process.env.NODE_ENV !== 'production';
}

async function fetchUserById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function getUsersByRole(role) {
  const [rows] = await pool.execute(
    'SELECT id, name, email FROM users WHERE role = ? ORDER BY name',
    [role]
  );
  return rows;
}

async function getOrganizationList() {
  const [rows] = await pool.query('SELECT * FROM organizations ORDER BY created_at DESC');
  return rows;
}

function formatDateKey(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value);
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return str.slice(0, 10);
}

function todayDateKey() {
  return formatDateKey(new Date());
}

async function ensureInternshipLogsColumns() {
  if (isPostgres) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS internship_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      log_date DATE DEFAULT NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status ENUM('pending','reviewed','approved','rejected') DEFAULT 'pending',
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  try {
    await pool.execute('ALTER TABLE internship_logs ADD COLUMN log_date DATE DEFAULT NULL');
  } catch (err) {
    if (!isDupColumnError(err)) throw err;
  }
  await pool.execute(
    'UPDATE internship_logs SET log_date = DATE(submitted_at) WHERE log_date IS NULL'
  );
}

async function getDailyInternshipReport(studentId, dateKey = todayDateKey()) {
  await ensureInternshipLogsColumns();
  const [[row]] = await pool.execute(
    'SELECT * FROM internship_logs WHERE student_id = ? AND log_date = ? LIMIT 1',
    [studentId, dateKey]
  );
  return row || null;
}

async function submitDailyInternshipReport(studentId, title, description, dateKey = todayDateKey()) {
  await ensureInternshipLogsColumns();
  const cleanTitle = (title || '').trim();
  const cleanDesc = (description || '').trim();
  if (!cleanTitle) return { error: 'Report title is required.' };
  if (cleanTitle.length > 200) return { error: 'Report title must be 200 characters or fewer.' };
  if (cleanDesc.length < MIN_HOURS_DESCRIPTION) {
    return { error: `Report details are required (at least ${MIN_HOURS_DESCRIPTION} characters).` };
  }
  if (cleanDesc.length > 1000) return { error: 'Report details must be 1000 characters or fewer.' };

  const timeIn = await getTodayTimeIn(studentId, dateKey);
  if (!timeIn || !timeIn.within_geofence) {
    return { error: 'You must time in before submitting your daily report.' };
  }

  const existing = await getDailyInternshipReport(studentId, dateKey);
  if (existing) return { error: 'You already submitted today\'s report.' };

  await pool.execute(
    'INSERT INTO internship_logs (student_id, title, description, log_date) VALUES (?, ?, ?, ?)',
    [studentId, cleanTitle, cleanDesc, dateKey]
  );
  return { success: true };
}

async function ensureInternshipHoursColumns() {
  if (isPostgres) return;
  const alters = [
    'ADD COLUMN proof_photo VARCHAR(255) DEFAULT NULL',
    'ADD COLUMN submit_ip VARCHAR(45) DEFAULT NULL',
  ];
  for (const sql of alters) {
    try {
      await pool.execute(`ALTER TABLE internship_hours ${sql}`);
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
  await pool.execute(
    `UPDATE internship_hours
     SET status = 'validated', validated_at = COALESCE(validated_at, created_at)
     WHERE submit_ip = 'ojt-auto' AND status = 'pending'`
  );
}

async function getStudentHoursProgress(studentId) {
  const requirements = await getStudentClearanceRequirements(studentId);
  const [[validatedRow]] = await pool.execute(
    `SELECT COALESCE(SUM(hours), 0) AS total
     FROM internship_hours WHERE student_id = ? AND status = 'validated'`,
    [studentId]
  );
  const completed = Number(validatedRow.total);
  const required = requirements.required_hours;
  const remaining = Math.max(0, Math.round((required - completed) * 100) / 100);
  const progress = Math.min(100, Math.round((completed / required) * 100));
  return {
    completed_hours: completed,
    required_hours: required,
    remaining_hours: remaining,
    progress,
  };
}

async function getWeekHoursTotal(studentId, logDateKey) {
  const [y, m, d] = logDateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - date.getDay());
  const weekStartKey = formatDateKey(weekStart);

  const [[row]] = await pool.execute(
    `SELECT COALESCE(SUM(hours), 0) AS total FROM internship_hours
     WHERE student_id = ? AND log_date >= ? AND log_date <= ?
     AND status IN ('pending', 'validated')`,
    [studentId, weekStartKey, logDateKey]
  );
  return Number(row.total);
}

async function validateHoursSubmission(studentId, logDate, hours, description) {
  const basicError = validateHoursInput(logDate, hours, description);
  if (basicError) return basicError;

  const timedIn = await hasValidTimeInToday(studentId, logDate);
  if (!timedIn) {
    return 'You must time in at your OJT location (camera + GPS) before logging hours for today.';
  }

  const weekTotal = await getWeekHoursTotal(studentId, logDate);
  if (weekTotal + hours > MAX_HOURS_PER_WEEK) {
    return `Weekly limit is ${MAX_HOURS_PER_WEEK} hours. You already have ${weekTotal.toFixed(1)} hrs logged this week.`;
  }

  return null;
}

function validateHoursInput(logDate, hours, description) {
  if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return 'A valid date is required.';
  }
  const today = todayDateKey();
  if (logDate !== today) {
    return 'You can only log hours for today. Record your hours on the day you work.';
  }
  if (hours <= 0 || hours > MAX_HOURS_PER_DAY) {
    return `Hours must be between ${MIN_HOURS_PER_ENTRY} and ${MAX_HOURS_PER_DAY} per day.`;
  }
  if (description.trim().length < MIN_HOURS_DESCRIPTION) {
    return `Describe what you worked on (at least ${MIN_HOURS_DESCRIPTION} characters).`;
  }
  if (description.length > 500) return 'Description must be 500 characters or fewer.';
  return null;
}

function validateLogInput(title, description) {
  if (!title.trim()) return 'A log title is required.';
  if (title.length > 200) return 'Title must be 200 characters or fewer.';
  if (description.length > 1000) return 'Description must be 1000 characters or fewer.';
  return null;
}

function validateEvaluationInput(studentId, score, comments) {
  if (studentId <= 0) return 'Please select a student.';
  if (score < 0 || score > 100) return 'Score must be between 0 and 100.';
  if (comments.length > 1000) return 'Comments must be 1000 characters or fewer.';
  return null;
}

async function hasSupervisorFeedbackToday(supervisorId, studentId, dateKey = todayDateKey()) {
  const [[row]] = await pool.execute(
    `SELECT id FROM evaluations
     WHERE supervisor_id = ? AND student_id = ? AND DATE(submitted_at) = ?
     LIMIT 1`,
    [supervisorId, studentId, dateKey]
  );
  return Boolean(row);
}

async function getSupervisorFeedbackTodayMap(supervisorId, dateKey = todayDateKey()) {
  const [rows] = await pool.execute(
    `SELECT student_id, score, submitted_at FROM evaluations
     WHERE supervisor_id = ? AND DATE(submitted_at) = ?`,
    [supervisorId, dateKey]
  );
  const map = {};
  rows.forEach((row) => {
    map[row.student_id] = row;
  });
  return map;
}

function statusBadgeClass(status) {
  const map = {
    pending: 'status-pending',
    reviewed: 'status-reviewed',
    approved: 'status-approved',
    validated: 'status-approved',
    rejected: 'status-rejected',
    cleared: 'status-approved',
    not_cleared: 'status-rejected',
  };
  return map[status] || 'status-pending';
}

async function getStudentStats(studentId) {
  const [[hours]] = await pool.execute(
    `SELECT COALESCE(SUM(hours), 0) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
     FROM internship_hours WHERE student_id = ?`,
    [studentId]
  );

  const [[logs]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
     FROM internship_logs WHERE student_id = ?`,
    [studentId]
  );

  return {
    total_hours: Number(hours?.total || 0),
    pending_hours: Number(hours?.pending_count || 0),
    total_logs: Number(logs?.total || 0),
    pending_logs: Number(logs?.pending_count || 0),
  };
}

async function getUnreadMessageCount(userId) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM communication_logs
     WHERE receiver_id = ? AND is_read = 0 AND NOT (${systemMessageSubjectClause('communication_logs')})`,
    [userId, ...SYSTEM_MESSAGE_SUBJECTS]
  );
  return Number(row.cnt);
}

async function getUserMessages(userId) {
  const [messages] = await pool.execute(
    `SELECT c.*, s.name AS sender_name, r.name AS receiver_name
     FROM communication_logs c
     JOIN users s ON c.sender_id = s.id
     JOIN users r ON c.receiver_id = r.id
     WHERE (c.sender_id = ? OR c.receiver_id = ?) AND NOT (${systemMessageSubjectClause('c')})
     ORDER BY c.created_at DESC`,
    [userId, userId, ...SYSTEM_MESSAGE_SUBJECTS]
  );
  return messages;
}

const { groupMessagesIntoThreads } = require('./messageThreads');

async function getUserMessageThreads(userId) {
  const messages = await getUserMessages(userId);
  return groupMessagesIntoThreads(userId, messages);
}

async function getLegacySystemAlerts(userId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.subject AS title, c.message AS body, c.is_read, c.created_at, u.name AS from_name,
            'alert' AS kind, c.subject AS action, c.message AS feedback
     FROM communication_logs c
     JOIN users u ON c.sender_id = u.id
     WHERE c.receiver_id = ? AND ${systemMessageSubjectClause('c')}
     ORDER BY c.created_at DESC LIMIT 15`,
    [userId, ...SYSTEM_MESSAGE_SUBJECTS]
  );
  return rows;
}

async function markDirectMessagesRead(userId) {
  await pool.execute(
    `UPDATE communication_logs SET is_read = 1
     WHERE receiver_id = ? AND is_read = 0 AND NOT (${systemMessageSubjectClause('communication_logs')})`,
    [userId, ...SYSTEM_MESSAGE_SUBJECTS]
  );
}

async function getLegacySystemAlertCount(userId) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM communication_logs
     WHERE receiver_id = ? AND is_read = 0 AND ${systemMessageSubjectClause('communication_logs')}`,
    [userId, ...SYSTEM_MESSAGE_SUBJECTS]
  );
  return Number(row.cnt);
}

async function recordValidation(type, recordId, validatorId, action, feedback = '') {
  await pool.execute(
    `INSERT INTO validation_records (record_type, record_id, validator_id, action, feedback)
     VALUES (?, ?, ?, ?, ?)`,
    [type, recordId, validatorId, action, feedback]
  );
}

async function sendMessage(senderId, receiverId, subject, message) {
  await pool.execute(
    'INSERT INTO communication_logs (sender_id, receiver_id, subject, message) VALUES (?, ?, ?, ?)',
    [senderId, receiverId, subject, message]
  );
}

const REQUIRED_HOURS = 200;
const DEFAULT_CLEARANCE_REQUIREMENTS = {
  required_hours: REQUIRED_HOURS,
  required_reports: 1,
  required_evaluations: 1,
  custom_requirements: [],
};

function parseCustomRequirementsInput(input) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
  }
  return String(input || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseCustomRequirementsStored(value) {
  if (!value) return [];
  if (Array.isArray(value)) return parseCustomRequirementsInput(value);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parseCustomRequirementsInput(parsed);
  } catch (err) {
    /* fall through to line-based parsing */
  }
  return parseCustomRequirementsInput(value);
}

function normalizeProgramName(courseProgram) {
  const program = (courseProgram || '').trim();
  return program || 'Unassigned Program';
}

async function ensureProgramClearanceTable() {
  if (isPostgres) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS program_clearance_requirements (
      course_program VARCHAR(120) PRIMARY KEY,
      required_hours INT NOT NULL DEFAULT 200,
      required_reports INT NOT NULL DEFAULT 1,
      required_evaluations INT NOT NULL DEFAULT 1,
      custom_requirements TEXT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  try {
    await pool.execute(
      'ALTER TABLE program_clearance_requirements ADD COLUMN custom_requirements TEXT DEFAULT NULL'
    );
  } catch (err) {
    if (!isDupColumnError(err)) throw err;
  }
}

async function getProgramClearanceRequirements(courseProgram) {
  await ensureProgramClearanceTable();
  const program = normalizeProgramName(courseProgram);
  const [[row]] = await pool.execute(
    `SELECT required_hours, required_reports, required_evaluations, custom_requirements
     FROM program_clearance_requirements WHERE course_program = ? LIMIT 1`,
    [program]
  );
  if (!row) return { ...DEFAULT_CLEARANCE_REQUIREMENTS, custom_requirements: [] };
  return {
    required_hours: Number(row.required_hours) || REQUIRED_HOURS,
    required_reports: Number(row.required_reports) || 0,
    required_evaluations: Number(row.required_evaluations) || 0,
    custom_requirements: parseCustomRequirementsStored(row.custom_requirements),
  };
}

async function getStudentClearanceRequirements(studentId) {
  await ensureUserProfileColumns();
  const [[student]] = await pool.execute(
    'SELECT course_program, required_hours FROM users WHERE id = ? AND role = ? LIMIT 1',
    [studentId, 'student']
  );
  if (!student) return { ...DEFAULT_CLEARANCE_REQUIREMENTS };
  const programReq = await getProgramClearanceRequirements(student.course_program);
  const studentHours = Number(student.required_hours);
  const requiredHours = Number.isFinite(studentHours) && studentHours > 0
    ? studentHours
    : programReq.required_hours;
  return {
    ...programReq,
    required_hours: requiredHours,
  };
}

function evaluateClearanceMet(stats, requirements) {
  return stats.validated_hours >= requirements.required_hours
    && stats.approved_logs >= requirements.required_reports
    && stats.eval_count >= requirements.required_evaluations;
}

function computeLiveClearanceStatus(stats, requirements) {
  return evaluateClearanceMet(stats, requirements) ? 'cleared' : 'pending';
}

const INTERNSHIP_HOURS_CLEARED_MSG =
  'You have completed your required internship hours. Attendance is closed and your clearance status is Cleared.';

async function ensureInternshipClearanceColumn() {
  if (internshipClearanceColumnReady) return;
  if (isPostgres) {
    await pool.execute(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS internship_clearance_status VARCHAR(20) DEFAULT 'pending'
    `);
  } else {
    try {
      await pool.execute(
        "ALTER TABLE users ADD COLUMN internship_clearance_status VARCHAR(20) DEFAULT 'pending'"
      );
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
  internshipClearanceColumnReady = true;
}

async function isStudentInternshipCleared(studentId) {
  await ensureInternshipClearanceColumn();
  const [[row]] = await pool.execute(
    "SELECT internship_clearance_status FROM users WHERE id = ? AND role = 'student' LIMIT 1",
    [studentId]
  );
  return row?.internship_clearance_status === 'cleared';
}

async function syncStudentHoursClearance(studentId, validatedTotal, requiredHours) {
  if (Number(validatedTotal) < Number(requiredHours)) return false;
  await ensureInternshipClearanceColumn();
  await pool.execute(
    `UPDATE users SET internship_clearance_status = 'cleared'
     WHERE id = ? AND role = 'student'
       AND COALESCE(internship_clearance_status, 'pending') <> 'cleared'`,
    [studentId]
  );
  return true;
}

async function assertStudentAttendanceAllowed(studentId) {
  if (await isStudentInternshipCleared(studentId)) {
    return { error: INTERNSHIP_HOURS_CLEARED_MSG, attendance_locked: true };
  }
  return null;
}

function validateCountRequirement(value, label, max = 100) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return `${label} must be a whole number.`;
  }
  if (num < 0) return `${label} cannot be negative.`;
  if (num > max) return `${label} cannot exceed ${max}.`;
  return null;
}

function validateClearanceRequirementsInput(requirements) {
  const hoursError = validateRequiredHoursInput(requirements.required_hours);
  if (hoursError) return hoursError;
  const reportsError = validateCountRequirement(requirements.required_reports, 'Required reports');
  if (reportsError) return reportsError;
  const evalsError = validateCountRequirement(requirements.required_evaluations, 'Required evaluations');
  if (evalsError) return evalsError;

  const customItems = parseCustomRequirementsInput(requirements.custom_requirements);
  for (const item of customItems) {
    if (item.length > 300) return 'Each text requirement must be 300 characters or fewer.';
  }
  return null;
}

async function updateProgramClearanceRequirements(courseProgram, requirements) {
  await ensureProgramClearanceTable();
  await ensureUserProfileColumns();

  const customRequirements = parseCustomRequirementsInput(requirements.custom_requirements);
  const normalizedRequirements = {
    ...requirements,
    custom_requirements: customRequirements,
  };
  const error = validateClearanceRequirementsInput(normalizedRequirements);
  if (error) return error;

  const program = normalizeProgramName(courseProgram);
  const { required_hours, required_reports, required_evaluations } = normalizedRequirements;
  const customJson = JSON.stringify(customRequirements);

  await pool.execute(
    isPostgres
      ? `INSERT INTO program_clearance_requirements
         (course_program, required_hours, required_reports, required_evaluations, custom_requirements)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (course_program) DO UPDATE SET
           required_hours = EXCLUDED.required_hours,
           required_reports = EXCLUDED.required_reports,
           required_evaluations = EXCLUDED.required_evaluations,
           custom_requirements = EXCLUDED.custom_requirements,
           updated_at = NOW()`
      : `INSERT INTO program_clearance_requirements
         (course_program, required_hours, required_reports, required_evaluations, custom_requirements)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           required_hours = VALUES(required_hours),
           required_reports = VALUES(required_reports),
           required_evaluations = VALUES(required_evaluations),
           custom_requirements = VALUES(custom_requirements)`,
    [program, required_hours, required_reports, required_evaluations, customJson]
  );

  if (program !== 'Unassigned Program') {
    await pool.execute(
      'UPDATE users SET required_hours = ? WHERE role = ? AND course_program = ?',
      [required_hours, 'student', program]
    );
  } else {
    await pool.execute(
      "UPDATE users SET required_hours = ? WHERE role = 'student' AND (course_program IS NULL OR TRIM(course_program) = '')",
      [required_hours]
    );
  }

  return null;
}

async function getProgramCatalog(students, programOrder = []) {
  const groups = groupStudentsByProgram(students, programOrder);
  const byProgram = new Map(groups.map((group) => [group.program, group]));
  const catalog = [];

  for (const program of programOrder) {
    const requirements = await getProgramClearanceRequirements(program);
    const group = byProgram.get(program);
    catalog.push({
      program,
      students: group?.students || [],
      student_count: group?.students?.length || 0,
      ...requirements,
    });
  }

  const unassigned = byProgram.get('Unassigned Program');
  if (unassigned) {
    const requirements = await getProgramClearanceRequirements('Unassigned Program');
    catalog.push({
      ...unassigned,
      ...requirements,
    });
  }

  return catalog;
}

async function ensureClearanceReportColumns() {
  if (isPostgres || mysqlClearanceColumnsReady) return;
  const alters = [
    "ADD COLUMN certificate_type ENUM('system','uploaded') DEFAULT NULL",
    'ADD COLUMN certificate_path VARCHAR(500) DEFAULT NULL',
    'ADD COLUMN certificate_issued_at TIMESTAMP NULL DEFAULT NULL',
  ];
  for (const sql of alters) {
    try {
      await pool.execute(`ALTER TABLE clearance_reports ${sql}`);
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
  mysqlClearanceColumnsReady = true;
}

async function getStudentsForClearanceReport() {
  const students = await getUsersByRole('student');
  const enriched = [];
  for (const student of students) {
    const clearance = await getStudentClearanceDetails(student.id);
    enriched.push({
      ...student,
      validated_hours: clearance.validated_hours,
      required_hours: clearance.required_hours,
      hours_met: clearance.hours_met,
      clearance_status: clearance.clearance_status,
      approved_logs: clearance.approved_logs,
      eval_count: clearance.eval_count,
      reports_met: clearance.reports_met,
      evaluations_met: clearance.evaluations_met,
    });
  }
  return enriched;
}

async function getLatestClearanceReportForStudent(studentId) {
  await ensureClearanceReportColumns();
  const [rows] = await pool.execute(
    'SELECT * FROM clearance_reports WHERE student_id = ? ORDER BY id DESC LIMIT 1',
    [studentId]
  );
  return rows[0] || null;
}

async function getClearanceReportById(reportId) {
  await ensureClearanceReportColumns();
  const [rows] = await pool.execute(
    `SELECT cr.*, u.name AS student_name, u.email AS student_email,
            u.course_program, g.name AS generated_by_name
     FROM clearance_reports cr
     JOIN users u ON cr.student_id = u.id
     JOIN users g ON cr.generated_by = g.id
     WHERE cr.id = ? LIMIT 1`,
    [reportId]
  );
  return rows[0] || null;
}

async function uploadClearanceCertificate(reportId, filePath) {
  await ensureClearanceReportColumns();
  await pool.execute(
    `UPDATE clearance_reports
     SET certificate_type = 'uploaded', certificate_path = ?, certificate_issued_at = NOW()
     WHERE id = ?`,
    [filePath, reportId]
  );
}

async function ensurePortalSettingsTable() {
  if (isPostgres) {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS portal_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by INT NULL REFERENCES users(id) ON DELETE SET NULL
      )`
    );
    return;
  }
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS portal_settings (
      setting_key VARCHAR(64) PRIMARY KEY,
      setting_value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by INT NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`
  );
}

async function getGeneralCertificate() {
  await ensurePortalSettingsTable();
  const [rows] = await pool.execute(
    `SELECT ps.setting_value AS certificate_path, ps.updated_at AS uploaded_at, ps.updated_by,
            u.name AS uploaded_by_name
     FROM portal_settings ps
     LEFT JOIN users u ON ps.updated_by = u.id
     WHERE ps.setting_key = 'general_certificate_path'
     LIMIT 1`
  );
  const row = rows[0];
  if (!row?.certificate_path) return null;
  return row;
}

async function setGeneralCertificate(filePath, userId) {
  await ensurePortalSettingsTable();
  await pool.execute(
    isPostgres
      ? `INSERT INTO portal_settings (setting_key, setting_value, updated_by)
         VALUES ('general_certificate_path', ?, ?)
         ON CONFLICT (setting_key) DO UPDATE SET
           setting_value = EXCLUDED.setting_value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`
      : `INSERT INTO portal_settings (setting_key, setting_value, updated_by)
         VALUES ('general_certificate_path', ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [filePath, userId]
  );
}

function resolveStudentCertificate({ clearance_status, general_certificate, has_clearance_report }) {
  if (!general_certificate?.certificate_path) return null;
  if (clearance_status !== 'cleared' && !has_clearance_report) return null;

  return {
    href: general_certificate.certificate_path,
    type: 'general',
    issued_at: general_certificate.uploaded_at,
    uses_general: true,
  };
}

async function generateClearanceReport(studentId, generatedBy) {
  await ensureClearanceReportColumns();
  const requirements = await getStudentClearanceRequirements(studentId);
  const clearance = await getStudentClearanceDetails(studentId);
  if (clearance.validated_hours < requirements.required_hours) {
    return {
      error: `Report can only be generated after the student completes ${requirements.required_hours} validated hours.`,
    };
  }

  const totalHours = clearance.validated_hours;
  const approvedLogs = clearance.approved_logs;
  const avgScore = clearance.avg_score;
  const evalCount = clearance.eval_count;

  const clearanceStats = {
    validated_hours: totalHours,
    approved_logs: approvedLogs,
    eval_count: evalCount,
  };
  const clearanceStatus = evaluateClearanceMet(clearanceStats, requirements) ? 'cleared' : 'not_cleared';

  const reportData = JSON.stringify({
    total_hours: totalHours,
    approved_logs: approvedLogs,
    average_score: avgScore,
    required_hours: requirements.required_hours,
    required_reports: requirements.required_reports,
    required_evaluations: requirements.required_evaluations,
    custom_requirements: requirements.custom_requirements,
  });

  const existing = await getLatestClearanceReportForStudent(studentId);
  if (existing) {
    await pool.execute(
      `UPDATE clearance_reports
       SET generated_by = ?, total_hours = ?, total_logs = ?, evaluation_score = ?,
           clearance_status = ?, report_data = ?, generated_at = NOW()
       WHERE id = ?`,
      [generatedBy, totalHours, approvedLogs, avgScore, clearanceStatus, reportData, existing.id]
    );
    return { reportId: existing.id, updated: true };
  }

  const [result] = await pool.execute(
    `INSERT INTO clearance_reports
     (student_id, generated_by, total_hours, total_logs, evaluation_score, clearance_status, report_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [studentId, generatedBy, totalHours, approvedLogs, avgScore, clearanceStatus, reportData]
  );

  return { reportId: result.insertId, updated: false };
}

async function getStudentClearanceDetails(studentId) {
  const requirements = await getStudentClearanceRequirements(studentId);
  const stats = await getStudentStats(studentId);
  const [[validatedHours]] = await pool.execute(
    "SELECT COALESCE(SUM(hours), 0) AS total FROM internship_hours WHERE student_id = ? AND status = 'validated'",
    [studentId]
  );
  const validatedTotal = Number(validatedHours.total);

  const [reports] = await pool.execute(
    `SELECT * FROM clearance_reports WHERE student_id = ? ORDER BY generated_at DESC LIMIT 1`,
    [studentId]
  );
  const latestReports = reports.length ? [reports[0]] : [];

  const [[evalRow]] = await pool.execute(
    'SELECT AVG(score) AS avg_score, COUNT(*) AS cnt FROM evaluations WHERE student_id = ?',
    [studentId]
  );

  const [[approvedLogsRow]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM internship_logs WHERE student_id = ? AND status = 'approved'",
    [studentId]
  );

  const approvedLogs = Number(approvedLogsRow.cnt || 0);
  const evalCount = Number(evalRow.cnt || 0);
  const clearanceStats = {
    validated_hours: validatedTotal,
    approved_logs: approvedLogs,
    eval_count: evalCount,
  };
  await syncStudentHoursClearance(studentId, validatedTotal, requirements.required_hours);
  const hoursMet = validatedTotal >= requirements.required_hours;
  const lockedCleared = await isStudentInternshipCleared(studentId);
  const hoursCleared = lockedCleared || hoursMet;
  const liveClearanceStatus = hoursCleared ? 'cleared' : 'pending';
  const progress = hoursCleared
    ? 100
    : Math.min(100, Math.round((validatedTotal / requirements.required_hours) * 100));
  const reportsWithLiveStatus = latestReports.map((report) => ({
    ...report,
    clearance_status: liveClearanceStatus,
  }));

  const general_certificate = await getGeneralCertificate();
  const certificate = resolveStudentCertificate({
    clearance_status: liveClearanceStatus,
    general_certificate,
    has_clearance_report: latestReports.length > 0,
  });

  return {
    ...stats,
    validated_hours: validatedTotal,
    required_hours: requirements.required_hours,
    required_reports: requirements.required_reports,
    required_evaluations: requirements.required_evaluations,
    custom_requirements: requirements.custom_requirements,
    progress,
    reports: reportsWithLiveStatus,
    general_certificate,
    certificate,
    avg_score: Math.round(Number(evalRow.avg_score || 0) * 100) / 100,
    eval_count: evalCount,
    approved_logs: approvedLogs,
    clearance_status: liveClearanceStatus,
    hours_met: hoursCleared || validatedTotal >= requirements.required_hours,
    attendance_locked: hoursCleared,
    reports_met: approvedLogs >= requirements.required_reports,
    evaluations_met: evalCount >= requirements.required_evaluations,
  };
}

async function ensureUserNameColumns() {
  if (schemaColumnsReady || isPostgres) return;
  const alters = [
    'ADD COLUMN first_name VARCHAR(50) DEFAULT NULL',
    'ADD COLUMN last_name VARCHAR(50) DEFAULT NULL',
    'ADD COLUMN middle_initial VARCHAR(5) DEFAULT NULL',
    'ADD COLUMN year_of_study VARCHAR(20) DEFAULT NULL',
    'ADD COLUMN college_university VARCHAR(120) DEFAULT NULL',
  ];
  for (const sql of alters) {
    try {
      await pool.execute(`ALTER TABLE users ${sql}`);
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
}

function buildFullName(firstName, middleInitial, lastName) {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  const miRaw = (middleInitial || '').trim();
  const parts = [first];
  if (miRaw) {
    const letter = miRaw.replace(/\./g, '').charAt(0);
    if (letter) parts.push(`${letter.toUpperCase()}.`);
  }
  parts.push(last);
  return parts.filter(Boolean).join(' ').trim();
}

function validateRegistrationInput(body) {
  const firstName = (body.first_name || '').trim();
  const lastName = (body.last_name || '').trim();
  const middleInitial = (body.middle_initial || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();
  const departmentMajor = (body.department_major || body.course_program || '').trim();
  const password = body.password || '';
  const confirmPassword = body.confirm_password || '';
  const role = body.role || 'student';

  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    return 'First name, last name, email, password, and confirm password are required.';
  }
  if (firstName.length > 50 || lastName.length > 50) {
    return 'First and last name must be 50 characters or fewer.';
  }
  if (middleInitial.length > 5) {
    return 'Middle initial must be 5 characters or fewer.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Enter a valid email address.';
  }
  if (phone && !/^[\d\s+\-()]{7,20}$/.test(phone)) {
    return 'Enter a valid phone number.';
  }
  if (role === 'student') {
    if (!phone) return 'Phone number is required for student accounts.';
    if (!departmentMajor) return 'Department / major is required for student accounts.';
  }
  if (password.length < 6) {
    return 'Password must be at least 6 characters.';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  if (!['student', 'supervisor', 'admin', 'school'].includes(role)) {
    return 'Invalid role selected.';
  }
  return null;
}

async function ensureUserProfileColumns() {
  if (schemaColumnsReady || mysqlProfileColumnsReady) return;
  if (isPostgres) {
    schemaColumnsReady = true;
    return;
  }
  await ensureUserNameColumns();
  const alters = [
    'ADD COLUMN phone VARCHAR(20) DEFAULT NULL',
    'ADD COLUMN address TEXT DEFAULT NULL',
    'ADD COLUMN student_number VARCHAR(50) DEFAULT NULL',
    'ADD COLUMN course_program VARCHAR(120) DEFAULT NULL',
    'ADD COLUMN emergency_contact VARCHAR(100) DEFAULT NULL',
    'ADD COLUMN emergency_phone VARCHAR(20) DEFAULT NULL',
    'ADD COLUMN profile_photo VARCHAR(255) DEFAULT NULL',
    'ADD COLUMN required_hours INT DEFAULT 200',
    'ADD COLUMN password_visible VARCHAR(100) DEFAULT NULL',
  ];
  for (const sql of alters) {
    try {
      await pool.execute(`ALTER TABLE users ${sql}`);
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
  mysqlProfileColumnsReady = true;
  schemaColumnsReady = true;
}

async function getUserProfile(userId) {
  await ensureUserProfileColumns();
  const [rows] = await pool.execute(
    `SELECT id, name, first_name, last_name, middle_initial, email, role, phone, address,
            student_number, course_program, year_of_study, college_university,
            emergency_contact, emergency_phone, profile_photo, created_at
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getStudentRequiredHours(studentId) {
  const requirements = await getStudentClearanceRequirements(studentId);
  return requirements.required_hours;
}

function validateRequiredHoursInput(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return 'Required hours must be a whole number.';
  }
  if (value < 1) return 'Required hours must be at least 1.';
  if (value > 2000) return 'Required hours cannot exceed 2000.';
  return null;
}

async function updateStudentRequiredHours(studentId, hours) {
  await ensureUserProfileColumns();
  const error = validateRequiredHoursInput(hours);
  if (error) return error;
  if (await isStudentInternshipCleared(studentId)) {
    return 'Required hours cannot be changed after the student is cleared.';
  }

  const [result] = await pool.execute(
    'UPDATE users SET required_hours = ? WHERE id = ? AND role = ?',
    [hours, studentId, 'student']
  );
  if (!result.affectedRows) return 'Student not found.';
  return null;
}

async function grantStudentValidatedHours(supervisorId, studentId, hours, logDate, note) {
  await ensureInternshipHoursColumns();
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_HOURS_PER_DAY) {
    return `Hours must be between ${MIN_HOURS_PER_ENTRY} and ${MAX_HOURS_PER_DAY}.`;
  }
  const dateKey = logDate ? formatDateKey(logDate) : todayDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return 'Enter a valid date (YYYY-MM-DD).';
  }
  const weekTotal = await getWeekHoursTotal(studentId, dateKey);
  if (weekTotal + value > MAX_HOURS_PER_WEEK) {
    return `Weekly limit is ${MAX_HOURS_PER_WEEK} hours for this student.`;
  }

  const [[studentRow]] = await pool.execute(
    "SELECT id FROM users WHERE id = ? AND role = 'student' LIMIT 1",
    [studentId]
  );
  if (!studentRow) return 'Student not found.';

  const description = (note || '').trim()
    || `Validated hours granted by administrator on ${dateKey}.`;
  await pool.execute(
    `INSERT INTO internship_hours (student_id, log_date, hours, description, status, validated_by, validated_at)
     VALUES (?, ?, ?, ?, 'validated', ?, CURRENT_TIMESTAMP)`,
    [studentId, dateKey, value, description.slice(0, 500), supervisorId]
  );

  const requirements = await getStudentClearanceRequirements(studentId);
  const [[validatedRow]] = await pool.execute(
    "SELECT COALESCE(SUM(hours), 0) AS total FROM internship_hours WHERE student_id = ? AND status = 'validated'",
    [studentId]
  );
  await syncStudentHoursClearance(studentId, Number(validatedRow.total), requirements.required_hours);
  return null;
}

async function rememberLoginPassword(userId, plainPassword) {
  const plain = String(plainPassword || '');
  if (!userId || !plain) return;
  await ensureUserProfileColumns();
  await pool.execute('UPDATE users SET password_visible = ? WHERE id = ?', [plain.slice(0, 100), userId]);
}

async function getAllPortalUsers() {
  await ensureUserProfileColumns();
  const [rows] = await pool.execute(
    `SELECT id, name, first_name, last_name, middle_initial, email, role, phone,
            student_number, course_program, created_at, password_visible
     FROM users
     ORDER BY role, name`
  );
  return rows;
}

async function getPortalUserById(userId) {
  await ensureUserProfileColumns();
  const [[row]] = await pool.execute(
    `SELECT id, name, first_name, last_name, middle_initial, email, role, phone,
            student_number, course_program, created_at, password_visible
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return row || null;
}

async function updatePortalUser(userId, body) {
  await ensureUserProfileColumns();
  const existing = await getPortalUserById(userId);
  if (!existing) return 'Account not found.';

  const firstName = (body.first_name || '').trim();
  const lastName = (body.last_name || '').trim();
  const middleInitial = (body.middle_initial || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim() || null;
  const studentNumber = (body.student_number || '').trim() || null;
  const role = (body.role || existing.role || '').trim();
  const password = body.password || '';

  if (!firstName || !lastName || !email) {
    return 'First name, last name, and email are required.';
  }
  if (!['student', 'supervisor', 'admin', 'school'].includes(role)) {
    return 'Choose a valid account type.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Enter a valid email address.';
  }
  if (password && password.length < 6) {
    return 'New password must be at least 6 characters.';
  }
  if (password && password !== (body.confirm_password || '')) {
    return 'New password and confirmation do not match.';
  }

  if (existing.role === 'admin' && role !== 'admin') {
    const [[count]] = await pool.execute("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'");
    if (Number(count?.cnt || 0) <= 1) {
      return 'Keep at least one administrator account.';
    }
  }

  const auth = require('./auth');
  const other = await auth.fetchUserByEmail(email);
  if (other && Number(other.id) !== Number(userId)) {
    return 'Another account already uses that email.';
  }

  const name = buildFullName(firstName, middleInitial, lastName);
  const courseProgram = role === 'student' ? (existing.course_program || 'BS Computer Studies') : null;
  await pool.execute(
    `UPDATE users
     SET name = ?, first_name = ?, last_name = ?, middle_initial = ?, email = ?,
         phone = ?, role = ?, course_program = ?, student_number = ?
     WHERE id = ?`,
    [
      name,
      firstName,
      lastName,
      middleInitial || null,
      email,
      phone,
      role,
      courseProgram,
      studentNumber,
      userId,
    ]
  );

  if (password) {
    const passwordError = await setPortalUserPassword(userId, password, body.confirm_password);
    if (passwordError) return passwordError;
  }
  return null;
}

async function setPortalUserPassword(userId, password, confirmPassword) {
  const existing = await getPortalUserById(userId);
  if (!existing) return 'Account not found.';
  const next = String(password || '');
  if (next.length < 6) return 'Password must be at least 6 characters.';
  if (next !== String(confirmPassword || '')) return 'Password and confirmation do not match.';
  const auth = require('./auth');
  const hashed = await auth.hashPassword(next);
  await pool.execute('UPDATE users SET password = ?, password_visible = ? WHERE id = ?', [
    hashed,
    next.slice(0, 100),
    userId,
  ]);
  return null;
}

async function createPortalAccount(body, role = 'student') {
  await ensureUserProfileColumns();
  const safeRole = ['student', 'supervisor', 'admin'].includes(role) ? role : '';
  if (!safeRole) return { error: 'Choose Student, Staff, or Admin.' };

  const firstName = (body.first_name || body.firstName || '').trim();
  const lastName = (body.last_name || body.lastName || '').trim();
  const middleInitial = (body.middle_initial || body.middleInitial || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim() || null;
  const studentNumber = safeRole === 'student'
    ? ((body.student_number || body.studentNumber || '').trim() || null)
    : null;
  const courseProgram = safeRole === 'student' ? 'BS Computer Studies' : null;
  const password = safeRole === 'student'
    ? (body.password || DEFAULT_STUDENT_PASSWORD)
    : String(body.password || '');

  if (!firstName || !lastName || !email) {
    return { error: 'First name, last name, and email are required.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: `Enter a valid email for ${firstName} ${lastName}.` };
  }
  if (safeRole !== 'student') {
    if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
    if (password !== String(body.confirm_password || '')) {
      return { error: 'Password and confirmation do not match.' };
    }
  }

  const auth = require('./auth');
  if (await auth.fetchUserByEmail(email)) {
    return { error: `An account already uses ${email}.`, skipped: true };
  }

  const name = buildFullName(firstName, middleInitial, lastName);
  const hashedPassword = await auth.hashPassword(password);
  await pool.execute(
    `INSERT INTO users
     (name, first_name, last_name, middle_initial, email, password, password_visible, role, phone, student_number, course_program)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      firstName,
      lastName,
      middleInitial || null,
      email,
      hashedPassword,
      password.slice(0, 100),
      safeRole,
      phone,
      studentNumber,
      courseProgram,
    ]
  );
  return { ok: true, email, role: safeRole };
}

async function createStudentAccount(body, password = DEFAULT_STUDENT_PASSWORD) {
  return createPortalAccount({ ...body, password, confirm_password: password }, 'student');
}

function pickSheetValue(row, keys) {
  const entries = Object.entries(row || {});
  for (const key of keys) {
    const found = entries.find(([label]) => String(label).trim().toLowerCase() === key);
    if (found && String(found[1] || '').trim()) return String(found[1]).trim();
  }
  return '';
}

async function importStudentsFromRows(rows) {
  const created = [];
  const skipped = [];
  for (const row of rows) {
    const body = {
      first_name: pickSheetValue(row, ['first name', 'firstname', 'first_name', 'given name']),
      last_name: pickSheetValue(row, ['last name', 'lastname', 'last_name', 'surname']),
      middle_initial: pickSheetValue(row, ['middle initial', 'middle_initial', 'mi', 'm.i.']),
      email: pickSheetValue(row, ['email', 'email address', 'e-mail']),
      phone: pickSheetValue(row, ['phone', 'mobile', 'contact']),
      student_number: pickSheetValue(row, ['student number', 'student_number', 'student id', 'id number']),
    };
    if (!body.first_name && !body.last_name && !body.email) continue;
    const result = await createStudentAccount(body);
    if (result.ok) created.push(result.email);
    else skipped.push(result.error);
  }
  return { created, skipped };
}

async function deletePortalUser(userId, actorId) {
  if (Number(userId) === Number(actorId)) {
    return 'You cannot delete the account you are signed in with.';
  }
  const existing = await getPortalUserById(userId);
  if (!existing) return 'Account not found.';
  if (existing.role === 'admin') {
    const [[count]] = await pool.execute("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'");
    if (Number(count?.cnt || 0) <= 1) {
      return 'Keep at least one administrator account.';
    }
  }
  try {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    if (!result.affectedRows) return 'Account not found.';
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
      return 'This account still has internship records and cannot be deleted.';
    }
    throw err;
  }
  return null;
}

async function createCompanyUserAccount(body) {
  const validationError = validateRegistrationInput({ ...body, role: 'school' });
  if (validationError) return { error: validationError };

  const firstName = (body.first_name || '').trim();
  const lastName = (body.last_name || '').trim();
  const middleInitial = (body.middle_initial || '').trim();
  const email = (body.email || '').trim();
  const password = body.password || '';
  const name = buildFullName(firstName, middleInitial, lastName);
  const phone = (body.phone || '').trim() || null;

  const auth = require('./auth');
  if (await auth.fetchUserByEmail(email)) {
    return { error: 'An account with that email already exists.' };
  }

  await ensureUserProfileColumns();
  const hashedPassword = await auth.hashPassword(password);
  const [result] = await pool.execute(
    `INSERT INTO users (name, first_name, last_name, middle_initial, email, password, password_visible, role, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'school', ?)`,
    [name, firstName, lastName, middleInitial || null, email, hashedPassword, password.slice(0, 100), phone]
  );
  return { id: result.insertId };
}

async function updateProgramRequiredHours(courseProgram, hours) {
  const requirements = await getProgramClearanceRequirements(courseProgram);
  return updateProgramClearanceRequirements(courseProgram, {
    ...requirements,
    required_hours: hours,
  });
}

function groupStudentsByProgram(students, programOrder = []) {
  const groups = new Map();

  for (const student of students) {
    const program = (student.course_program || '').trim() || 'Unassigned Program';
    if (!groups.has(program)) groups.set(program, []);
    groups.get(program).push(student);
  }

  const ordered = [];
  const seen = new Set();

  for (const program of programOrder) {
    if (!groups.has(program)) continue;
    const list = groups.get(program);
    ordered.push({
      program,
      students: list,
      required_hours: list[0]?.required_hours || REQUIRED_HOURS,
      student_count: list.length,
    });
    seen.add(program);
  }

  for (const [program, list] of groups) {
    if (seen.has(program)) continue;
    ordered.push({
      program,
      students: list,
      required_hours: list[0]?.required_hours || REQUIRED_HOURS,
      student_count: list.length,
    });
  }

  return ordered;
}

async function ensureNotificationTablesOnce() {
  if (isPostgres || mysqlNotificationTablesReady) return;
  await ensureNotificationReadsTable();
  await ensureUserNotificationsTable();
  mysqlNotificationTablesReady = true;
}

async function ensureNotificationReadsTable() {
  if (isPostgres) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      notif_kind ENUM('validation') NOT NULL DEFAULT 'validation',
      notif_id INT NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_notif (user_id, notif_kind, notif_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function ensureUserNotificationsTable() {
  if (isPostgres) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      sender_id INT DEFAULT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      category VARCHAR(32) DEFAULT 'system',
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
}

async function createUserNotification(userId, senderId, title, body, category = 'system') {
  await ensureUserNotificationsTable();
  await pool.execute(
    'INSERT INTO user_notifications (user_id, sender_id, title, body, category) VALUES (?, ?, ?, ?, ?)',
    [userId, senderId || null, (title || 'Notification').trim().slice(0, 200), (body || '').trim(), category]
  );
}

async function getUserNotifications(userId) {
  await ensureNotificationReadsTable();
  await ensureUserNotificationsTable();

  const [[userRow]] = await pool.execute('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
  const isStudent = userRow?.role === 'student';

  let validations = [];
  if (isStudent) {
    const [rows] = await pool.execute(
      `SELECT vr.id, vr.action, vr.feedback, vr.record_type, vr.created_at, u.name AS from_name, 'validation' AS kind,
              CASE WHEN nr.id IS NOT NULL THEN 1 ELSE 0 END AS is_read
       FROM validation_records vr
       JOIN users u ON vr.validator_id = u.id
       LEFT JOIN notification_reads nr ON nr.user_id = ? AND nr.notif_kind = 'validation' AND nr.notif_id = vr.id
       WHERE (vr.record_type = 'hours' AND vr.record_id IN (SELECT id FROM internship_hours WHERE student_id = ?))
          OR (vr.record_type = 'log' AND vr.record_id IN (SELECT id FROM internship_logs WHERE student_id = ?))
       ORDER BY vr.created_at DESC LIMIT 15`,
      [userId, userId, userId]
    );
    validations = rows;
  }

  const [alerts] = await pool.execute(
    `SELECT n.id, n.title, n.body, n.category, n.is_read, n.created_at, u.name AS from_name, 'alert' AS kind,
            n.category AS action, n.title AS subject, n.body AS feedback
     FROM user_notifications n
     LEFT JOIN users u ON n.sender_id = u.id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC LIMIT 15`,
    [userId]
  );

  const legacyAlerts = await getLegacySystemAlerts(userId);

  return [...validations, ...alerts, ...legacyAlerts]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20);
}

async function getStudentNotifications(studentId) {
  return getUserNotifications(studentId);
}

async function getNotificationCount(userId, role) {
  await ensureNotificationTablesOnce();

  if (role !== 'student') {
    const [[sysRow]] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM user_notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    const legacyCount = await getLegacySystemAlertCount(userId);
    return Number(sysRow.cnt) + legacyCount;
  }

  const [sysResult, vResult] = await Promise.all([
    pool.execute(
      'SELECT COUNT(*) AS cnt FROM user_notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS cnt FROM validation_records vr
       LEFT JOIN notification_reads nr ON nr.user_id = ? AND nr.notif_kind = 'validation' AND nr.notif_id = vr.id
       WHERE nr.id IS NULL
         AND ((vr.record_type = 'hours' AND vr.record_id IN (SELECT id FROM internship_hours WHERE student_id = ?))
           OR (vr.record_type = 'log' AND vr.record_id IN (SELECT id FROM internship_logs WHERE student_id = ?)))`,
      [userId, userId, userId]
    ),
  ]);

  const [[sysRow]] = sysResult;
  const [[vrow]] = vResult;
  const legacyCount = await getLegacySystemAlertCount(userId);
  return Number(vrow.cnt) + Number(sysRow.cnt) + legacyCount;
}

function invalidateUserNavCache(userId) {
  for (const key of navDataCache.keys()) {
    if (key.startsWith(`${userId}:`)) navDataCache.delete(key);
  }
}

async function getUserNavData(userId, role) {
  const cacheKey = `${userId}:${role}`;
  const cached = navDataCache.get(cacheKey);
  if (cached && Date.now() - cached.at < NAV_DATA_CACHE_MS) {
    return cached.data;
  }

  const [profileResult, unreadCount, notificationCount] = await Promise.all([
    pool.execute('SELECT profile_photo FROM users WHERE id = ? LIMIT 1', [userId]),
    getUnreadMessageCount(userId),
    getNotificationCount(userId, role),
  ]);
  const [[row]] = profileResult;
  const data = {
    profilePhoto: row?.profile_photo || null,
    unreadCount,
    notificationCount,
  };
  navDataCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

async function markAllNotificationsRead(userId) {
  await ensureNotificationReadsTable();
  await ensureUserNotificationsTable();
  await pool.execute('UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
  await pool.execute(
    `UPDATE communication_logs SET is_read = 1
     WHERE receiver_id = ? AND is_read = 0 AND ${systemMessageSubjectClause('communication_logs')}`,
    [userId, ...SYSTEM_MESSAGE_SUBJECTS]
  );
  await pool.execute(
    isPostgres
      ? `INSERT INTO notification_reads (user_id, notif_kind, notif_id)
         SELECT ?, 'validation', vr.id
         FROM validation_records vr
         WHERE (vr.record_type = 'hours' AND vr.record_id IN (SELECT id FROM internship_hours WHERE student_id = ?))
            OR (vr.record_type = 'log' AND vr.record_id IN (SELECT id FROM internship_logs WHERE student_id = ?))
         ON CONFLICT (user_id, notif_kind, notif_id) DO NOTHING`
      : `INSERT IGNORE INTO notification_reads (user_id, notif_kind, notif_id)
         SELECT ?, 'validation', vr.id
         FROM validation_records vr
         WHERE (vr.record_type = 'hours' AND vr.record_id IN (SELECT id FROM internship_hours WHERE student_id = ?))
            OR (vr.record_type = 'log' AND vr.record_id IN (SELECT id FROM internship_logs WHERE student_id = ?))`,
    [userId, userId, userId]
  );
}

async function getAllStudentsWithPerformance() {
  await ensureUserProfileColumns();
  await ensureOjtColumns();
  const [students] = await pool.execute(
    `SELECT id, name, email, course_program,
            ojt_site_name, ojt_latitude, ojt_longitude, ojt_radius_meters
     FROM users WHERE role = 'student'
     ORDER BY name`
  );
  const result = [];
  for (const s of students) {
    const stats = await getStudentStats(s.id);
    const clearance = await getStudentClearanceDetails(s.id);
    result.push({
      ...s,
      ...stats,
      validated_hours: clearance.validated_hours,
      required_hours: clearance.required_hours,
      required_reports: clearance.required_reports,
      required_evaluations: clearance.required_evaluations,
      avg_score: clearance.avg_score,
      clearance_status: clearance.clearance_status,
    });
  }
  return result;
}

const DEFAULT_OJT_RADIUS = 150;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function ensureOjtColumns() {
  if (isPostgres) return;
  await ensureUserProfileColumns();
  const alters = [
    'ADD COLUMN ojt_site_name VARCHAR(200) DEFAULT NULL',
    'ADD COLUMN ojt_latitude DECIMAL(10,7) DEFAULT NULL',
    'ADD COLUMN ojt_longitude DECIMAL(10,7) DEFAULT NULL',
    'ADD COLUMN ojt_radius_meters INT DEFAULT 150',
  ];
  for (const sql of alters) {
    try {
      await pool.execute(`ALTER TABLE users ${sql}`);
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ojt_time_ins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      time_in_date DATE NOT NULL,
      time_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      latitude DECIMAL(10,7) NOT NULL,
      longitude DECIMAL(10,7) NOT NULL,
      accuracy_meters DECIMAL(8,2) DEFAULT NULL,
      distance_meters DECIMAL(8,2) DEFAULT NULL,
      within_geofence TINYINT(1) DEFAULT 0,
  time_in_photo VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_student_time_in_date (student_id, time_in_date)
    )
  `);
  try {
    await pool.execute('ALTER TABLE ojt_time_ins ADD COLUMN time_in_photo VARCHAR(255) DEFAULT NULL');
  } catch (err) {
    if (!isDupColumnError(err)) throw err;
  }
  const timeOutAlters = [
    'ADD COLUMN time_out_at TIMESTAMP NULL DEFAULT NULL',
    'ADD COLUMN time_out_latitude DECIMAL(10,7) DEFAULT NULL',
    'ADD COLUMN time_out_longitude DECIMAL(10,7) DEFAULT NULL',
    'ADD COLUMN time_out_distance_meters DECIMAL(8,2) DEFAULT NULL',
    'ADD COLUMN time_out_photo VARCHAR(255) DEFAULT NULL',
    'ADD COLUMN auto_hours DECIMAL(5,2) DEFAULT NULL',
    'ADD COLUMN daily_progress_report TEXT DEFAULT NULL',
    'ADD COLUMN progress_submitted_at TIMESTAMP NULL DEFAULT NULL',
  ];
  for (const sql of timeOutAlters) {
    try {
      await pool.execute(`ALTER TABLE ojt_time_ins ${sql}`);
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
  try {
    await pool.execute('ALTER TABLE ojt_time_ins DROP INDEX uq_student_time_in_date');
  } catch (err) {
    const code = err.code || err.errno;
    if (code !== 'ER_CANT_DROP_FIELD_OR_KEY' && code !== 1091 && code !== '42704') {
      /* index already removed or never existed */
    }
  }
  await ensureDailyTasksTable();
}

async function ensureDailyTasksTable() {
  if (isPostgres) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS student_daily_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      supervisor_id INT NOT NULL,
      task_date DATE NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT DEFAULT NULL,
      status ENUM('pending', 'completed') DEFAULT 'pending',
      completed_at TIMESTAMP NULL DEFAULT NULL,
      student_progress TEXT DEFAULT NULL,
      progress_submitted_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  const taskAlters = [
    'ADD COLUMN student_progress TEXT DEFAULT NULL',
    'ADD COLUMN progress_submitted_at TIMESTAMP NULL DEFAULT NULL',
    'ADD COLUMN proof_photo VARCHAR(500) DEFAULT NULL',
  ];
  for (const sql of taskAlters) {
    try {
      await pool.execute(`ALTER TABLE student_daily_tasks ${sql}`);
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
  const reviewAlters = [
    'ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL',
    'ADD COLUMN review_note TEXT DEFAULT NULL',
  ];
  for (const sql of reviewAlters) {
    try {
      await pool.execute(`ALTER TABLE student_daily_tasks ${sql}`);
    } catch (err) {
      if (!isDupColumnError(err)) throw err;
    }
  }
  try {
    await pool.execute(
      "ALTER TABLE student_daily_tasks MODIFY status ENUM('pending', 'completed', 'approved', 'rejected') DEFAULT 'pending'"
    );
    await pool.execute("UPDATE student_daily_tasks SET status = 'approved' WHERE status = 'completed'");
    await pool.execute(
      "ALTER TABLE student_daily_tasks MODIFY status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending'"
    );
  } catch (err) {
    if (err.code !== 'ER_PARSE_ERROR') throw err;
  }
}

async function getStudentOjtSite(studentId) {
  await ensureOjtColumns();
  const [[row]] = await pool.execute(
    `SELECT ojt_site_name, ojt_latitude, ojt_longitude, ojt_radius_meters
     FROM users WHERE id = ? AND role = 'student' LIMIT 1`,
    [studentId]
  );
  if (!row || row.ojt_latitude == null || row.ojt_longitude == null) return null;
  return {
    name: row.ojt_site_name || 'OJT Site',
    latitude: Number(row.ojt_latitude),
    longitude: Number(row.ojt_longitude),
    radius_meters: Number(row.ojt_radius_meters) || DEFAULT_OJT_RADIUS,
  };
}

function mapOjtSessionRow(row) {
  if (!row) return null;
  return {
    ...row,
    within_geofence: Boolean(row.within_geofence),
    distance_meters: Number(row.distance_meters),
  };
}

async function getActiveOjtSession(studentId, dateKey = todayDateKey()) {
  await ensureOjtColumns();
  const [[row]] = await pool.execute(
    `SELECT * FROM ojt_time_ins
     WHERE student_id = ? AND time_in_date = ? AND within_geofence = 1 AND time_out_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [studentId, dateKey]
  );
  return mapOjtSessionRow(row);
}

async function getTodayOjtSessions(studentId, dateKey = todayDateKey()) {
  await ensureOjtColumns();
  const [rows] = await pool.execute(
    `SELECT * FROM ojt_time_ins
     WHERE student_id = ? AND time_in_date = ? AND within_geofence = 1
     ORDER BY time_in_at ASC, id ASC`,
    [studentId, dateKey]
  );
  return rows.map(mapOjtSessionRow);
}

async function countCompletedOjtSessionsToday(studentId, dateKey = todayDateKey()) {
  await ensureOjtColumns();
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM ojt_time_ins
     WHERE student_id = ? AND time_in_date = ? AND within_geofence = 1 AND time_out_at IS NOT NULL`,
    [studentId, dateKey]
  );
  return Number(row?.cnt || 0);
}

async function getTodayTimeIn(studentId, dateKey = todayDateKey()) {
  return getActiveOjtSession(studentId, dateKey);
}

async function getStudentOjtHistory(studentId, limit = 15) {
  await ensureOjtColumns();
  const [rows] = await pool.execute(
    `SELECT * FROM ojt_time_ins
     WHERE student_id = ? AND time_out_at IS NOT NULL AND within_geofence = 1
     ORDER BY time_in_date DESC, time_in_at DESC
     LIMIT ?`,
    [studentId, limit]
  );
  return rows.map((row) => ({
    ...row,
    time_in_date: formatDateKey(row.time_in_date),
  }));
}

async function getStudentAttendanceByDate(studentId) {
  await ensureOjtColumns();
  const [rows] = await pool.execute(
    `SELECT time_in_date, time_in_at, time_out_at, within_geofence, auto_hours
     FROM ojt_time_ins
     WHERE student_id = ?
     ORDER BY time_in_date ASC`,
    [studentId]
  );
  const byDate = {};
  rows.forEach((row) => {
    const key = formatDateKey(row.time_in_date);
    const sessionHours = row.auto_hours != null ? Number(row.auto_hours) : 0;
    if (!byDate[key]) {
      byDate[key] = {
        present: true,
        time_in_at: row.time_in_at,
        time_out_at: row.time_out_at,
        completed: Boolean(row.time_out_at),
        hours: sessionHours || null,
        session_count: 1,
      };
      return;
    }
    const entry = byDate[key];
    entry.session_count += 1;
    if (row.time_in_at && (!entry.time_in_at || new Date(row.time_in_at) < new Date(entry.time_in_at))) {
      entry.time_in_at = row.time_in_at;
    }
    if (row.time_out_at) {
      entry.time_out_at = !entry.time_out_at || new Date(row.time_out_at) > new Date(entry.time_out_at)
        ? row.time_out_at
        : entry.time_out_at;
    }
    entry.completed = entry.completed && Boolean(row.time_out_at);
    entry.hours = (Number(entry.hours) || 0) + sessionHours;
  });
  return byDate;
}

function getInternshipStartDate(attendanceByDate, tasksByDate) {
  const dates = [
    ...Object.keys(attendanceByDate || {}),
    ...Object.keys(tasksByDate || {}),
  ].filter(Boolean).sort();
  return dates[0] || null;
}

function validateOjtSiteInput(site) {
  const name = (site.site_name || '').trim();
  const lat = Number(site.latitude);
  const lng = Number(site.longitude);
  const radius = parseInt(site.radius_meters, 10) || DEFAULT_OJT_RADIUS;

  if (!name) return 'OJT site name is required.';
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Enter a valid latitude.';
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'Enter a valid longitude.';
  if (radius < 50 || radius > 5000) return 'Allowed radius must be between 50 and 5000 meters.';
  return null;
}

async function updateStudentOjtSite(studentId, site) {
  await ensureOjtColumns();
  const error = validateOjtSiteInput(site);
  if (error) return error;

  const [result] = await pool.execute(
    `UPDATE users SET ojt_site_name = ?, ojt_latitude = ?, ojt_longitude = ?, ojt_radius_meters = ?
     WHERE id = ? AND role = 'student'`,
    [
      site.site_name.trim(),
      Math.round(Number(site.latitude) * 1e7) / 1e7,
      Math.round(Number(site.longitude) * 1e7) / 1e7,
      site.radius_meters || DEFAULT_OJT_RADIUS,
      studentId,
    ]
  );
  if (!result.affectedRows) return 'Student not found.';
  return null;
}

async function verifyOjtLocation(studentId, latitude, longitude) {
  await ensureOjtColumns();
  const blocked = await assertStudentAttendanceAllowed(studentId);
  if (blocked) return blocked;

  const site = await getStudentOjtSite(studentId);
  if (!site) {
    return { error: 'Your OJT location has not been set by the administrator yet.' };
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Invalid GPS coordinates.' };
  }

  const distance = haversineMeters(lat, lng, site.latitude, site.longitude);
  const testBypass = isOjtTestBypass();
  const withinGeofence = testBypass || distance <= site.radius_meters;

  return {
    within_geofence: withinGeofence,
    distance: Math.round(distance * 10) / 10,
    site,
    test_bypass: testBypass,
    message: testBypass
      ? `Test mode: camera enabled at ${site.name} (geofence bypass for local testing).`
      : withinGeofence
        ? `You are at ${site.name} (${Math.round(distance)}m from site). Camera enabled.`
        : `Your OJT site is ${site.name}. You are ${Math.round(distance)}m away — move within ${site.radius_meters}m to time in.`,
  };
}

async function recordOjtTimeIn(studentId, latitude, longitude, accuracy = null, photoPath = null) {
  await ensureOjtColumns();
  const blocked = await assertStudentAttendanceAllowed(studentId);
  if (blocked) return blocked;

  const site = await getStudentOjtSite(studentId);
  if (!site) return { error: 'Your OJT location has not been set by the administrator yet.' };

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Invalid GPS coordinates.' };
  }

  const today = todayDateKey();
  const active = await getActiveOjtSession(studentId, today);
  if (active) {
    return {
      error: 'Time out from your current session before starting a new time in.',
      timeIn: active,
    };
  }
  const [failedAttempts] = await pool.execute(
    `SELECT id FROM ojt_time_ins
     WHERE student_id = ? AND time_in_date = ? AND within_geofence = 0 AND time_out_at IS NULL`,
    [studentId, today]
  );
  for (const row of failedAttempts) {
    await pool.execute('DELETE FROM ojt_time_ins WHERE id = ?', [row.id]);
  }

  const distance = haversineMeters(lat, lng, site.latitude, site.longitude);
  const withinGeofence = isOjtTestBypass() || distance <= site.radius_meters;

  if (!withinGeofence) {
    return {
      error: `Your OJT site is ${site.name}. You are ${Math.round(distance)}m away — you must be within ${site.radius_meters}m to time in.`,
      distance,
      within_geofence: false,
    };
  }

  if (!photoPath) {
    return { error: 'A camera photo is required to complete time-in.' };
  }

  await pool.execute(
    `INSERT INTO ojt_time_ins
     (student_id, time_in_date, latitude, longitude, accuracy_meters, distance_meters, within_geofence, time_in_photo)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [studentId, today, lat, lng, accuracy, Math.round(distance * 10) / 10, photoPath]
  );

  const timeIn = await getActiveOjtSession(studentId, today);
  return { success: true, timeIn, distance };
}

function calculateOjtHours(timeInAt, timeOutAt) {
  const start = new Date(timeInAt);
  const end = new Date(timeOutAt);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  const raw = ms / (1000 * 60 * 60);
  const rounded = Math.round(raw * 4) / 4;
  return Math.min(Math.max(rounded, MIN_HOURS_PER_ENTRY), MAX_HOURS_PER_DAY);
}

function isTaskSubmitted(task) {
  return Boolean(
    task
    && task.student_progress
    && String(task.student_progress).trim().length >= MIN_HOURS_DESCRIPTION
    && task.proof_photo
    && task.status !== 'rejected'
  );
}

function getTaskDisplayStatus(task) {
  if (!task?.student_progress || !task.proof_photo) return null;
  if (task.status === 'approved') return 'approved';
  if (task.status === 'rejected') return 'rejected';
  return 'pending';
}

async function getStudentDailyTasks(studentId, dateKey = todayDateKey()) {
  await ensureDailyTasksTable();
  const [rows] = await pool.execute(
    `SELECT t.*, u.name AS supervisor_name
     FROM student_daily_tasks t
     JOIN users u ON t.supervisor_id = u.id
     WHERE t.student_id = ? AND t.task_date = ?
     ORDER BY t.status ASC, t.created_at ASC`,
    [studentId, dateKey]
  );
  return rows.map((row) => ({
    ...row,
    task_date: formatDateKey(row.task_date),
    status: row.status || 'pending',
  }));
}

async function getStudentTaskHistory(studentId, limit = 50) {
  await ensureDailyTasksTable();
  const [rows] = await pool.execute(
    `SELECT t.*, u.name AS supervisor_name
     FROM student_daily_tasks t
     JOIN users u ON t.supervisor_id = u.id
     WHERE t.student_id = ?
     ORDER BY t.task_date DESC, t.created_at DESC
     LIMIT ?`,
    [studentId, limit]
  );
  return rows.map((row) => ({
    ...row,
    task_date: formatDateKey(row.task_date),
    status: row.status || 'pending',
  }));
}

async function getPendingTaskSubmissions(supervisorId = null) {
  await ensureDailyTasksTable();
  let sql = `
    SELECT t.*, u.name AS student_name, s.name AS supervisor_name
    FROM student_daily_tasks t
    JOIN users u ON t.student_id = u.id
    JOIN users s ON t.supervisor_id = s.id
    WHERE t.status = 'pending'
      AND t.student_progress IS NOT NULL
      AND TRIM(t.student_progress) != ''
      AND t.proof_photo IS NOT NULL
  `;
  const params = [];
  if (supervisorId) {
    sql += ' AND t.supervisor_id = ?';
    params.push(supervisorId);
  }
  sql += ' ORDER BY t.progress_submitted_at DESC, t.task_date DESC';
  const [rows] = await pool.execute(sql, params);
  return rows.map((row) => ({
    ...row,
    task_date: formatDateKey(row.task_date),
    status: row.status || 'pending',
  }));
}

async function getReviewedTaskSubmissions(supervisorId = null) {
  await ensureDailyTasksTable();
  let sql = `
    SELECT t.*, u.name AS student_name, s.name AS supervisor_name
    FROM student_daily_tasks t
    JOIN users u ON t.student_id = u.id
    JOIN users s ON t.supervisor_id = s.id
    WHERE t.status IN ('approved', 'rejected')
      AND t.student_progress IS NOT NULL
      AND TRIM(t.student_progress) != ''
  `;
  const params = [];
  if (supervisorId) {
    sql += ' AND t.supervisor_id = ?';
    params.push(supervisorId);
  }
  sql += ' ORDER BY t.reviewed_at DESC, t.task_date DESC';
  const [rows] = await pool.execute(sql, params);
  return rows.map((row) => ({
    ...row,
    task_date: formatDateKey(row.task_date),
    status: row.status || 'pending',
  }));
}

async function getStudentTaskRecords(supervisorId = null) {
  await ensureDailyTasksTable();
  let sql = `
    SELECT t.*, u.name AS student_name, s.name AS supervisor_name
    FROM student_daily_tasks t
    JOIN users u ON t.student_id = u.id
    JOIN users s ON t.supervisor_id = s.id
  `;
  const params = [];
  if (supervisorId) {
    sql += ' WHERE t.supervisor_id = ?';
    params.push(supervisorId);
  }
  sql += ' ORDER BY t.task_date DESC, t.created_at DESC';
  const [rows] = await pool.execute(sql, params);
  return rows.map((row) => ({
    ...row,
    task_date: formatDateKey(row.task_date),
    status: row.status || 'pending',
  }));
}

async function assignDailyTask(supervisorId, studentId, taskDate, title, description = '') {
  await ensureDailyTasksTable();
  const cleanTitle = (title || '').trim();
  const cleanDesc = (description || '').trim();
  if (studentId <= 0) return 'Select a student.';
  if (!cleanTitle) return 'Task title is required.';
  if (cleanTitle.length > 200) return 'Task title must be 200 characters or fewer.';
  if (cleanDesc.length > 1000) return 'Task description must be 1000 characters or fewer.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) return 'A valid task date is required.';

  const [[student]] = await pool.execute(
    "SELECT id FROM users WHERE id = ? AND role = 'student' LIMIT 1",
    [studentId]
  );
  if (!student) return 'Student not found.';

  await pool.execute(
    `INSERT INTO student_daily_tasks (student_id, supervisor_id, task_date, title, description)
     VALUES (?, ?, ?, ?, ?)`,
    [studentId, supervisorId, taskDate, cleanTitle, cleanDesc || null]
  );
  return null;
}

async function submitTaskProgress(taskId, studentId, progressText, photoPath = null) {
  await ensureDailyTasksTable();
  const progress = (progressText || '').trim();
  if (progress.length < MIN_HOURS_DESCRIPTION) {
    return { error: `Describe your progress (at least ${MIN_HOURS_DESCRIPTION} characters).` };
  }
  if (progress.length > 1000) return { error: 'Progress report must be 1000 characters or fewer.' };
  if (!photoPath) return { error: 'Upload a photo as proof that you completed this task.' };

  const [[task]] = await pool.execute(
    'SELECT id, task_date, status FROM student_daily_tasks WHERE id = ? AND student_id = ? LIMIT 1',
    [taskId, studentId]
  );
  if (!task) return { error: 'Task not found.' };
  if (formatDateKey(task.task_date) !== todayDateKey()) {
    return { error: 'You can only submit progress for today\'s tasks.' };
  }
  if (task.status === 'approved') {
    return { error: 'This task has already been approved.' };
  }

  await pool.execute(
    `UPDATE student_daily_tasks
     SET student_progress = ?, proof_photo = ?, status = 'pending',
         progress_submitted_at = CURRENT_TIMESTAMP,
         reviewed_at = NULL, review_note = NULL
     WHERE id = ? AND student_id = ?`,
    [progress, photoPath, taskId, studentId]
  );
  return { success: true, status: 'pending' };
}

async function reviewDailyTask(taskId, supervisorId, action, note = null, options = {}) {
  await ensureDailyTasksTable();
  if (!['approved', 'rejected'].includes(action)) {
    return { error: 'Invalid review action.' };
  }

  const allowAny = Boolean(options.allowAny);
  const [[task]] = await pool.execute(
    allowAny
      ? `SELECT id, student_progress, proof_photo, status
         FROM student_daily_tasks
         WHERE id = ? LIMIT 1`
      : `SELECT id, student_progress, proof_photo, status
         FROM student_daily_tasks
         WHERE id = ? AND supervisor_id = ? LIMIT 1`,
    allowAny ? [taskId] : [taskId, supervisorId]
  );
  if (!task) return { error: 'Task not found.' };
  if (!task.student_progress || !task.proof_photo) {
    return { error: 'Student has not submitted this task yet.' };
  }
  if (task.status === 'approved' && action === 'approved') {
    return { error: 'This task is already approved.' };
  }

  const cleanNote = (note || '').trim().slice(0, 500) || null;
  if (action === 'rejected' && !cleanNote) {
    return { error: 'Please provide a reason when rejecting a task.' };
  }

  const [result] = await pool.execute(
    allowAny
      ? `UPDATE student_daily_tasks
         SET status = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
         WHERE id = ?`
      : `UPDATE student_daily_tasks
         SET status = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
         WHERE id = ? AND supervisor_id = ?`,
    allowAny
      ? [action, cleanNote, taskId]
      : [action, cleanNote, taskId, supervisorId]
  );
  if (!result.affectedRows) return { error: 'Task not found.' };
  return { success: true, status: action };
}

async function submitDailyProgressReport(studentId, progressText) {
  await ensureOjtColumns();
  const progress = (progressText || '').trim();
  if (progress.length < MIN_HOURS_DESCRIPTION) {
    return { error: `Describe your work today (at least ${MIN_HOURS_DESCRIPTION} characters).` };
  }
  if (progress.length > 2000) return { error: 'Progress report must be 2000 characters or fewer.' };

  const today = todayDateKey();
  const timeIn = await getTodayTimeIn(studentId, today);
  if (!timeIn || !timeIn.within_geofence) {
    return { error: 'You must time in before submitting daily progress.' };
  }

  const tasks = await getStudentDailyTasks(studentId, today);
  if (tasks.length) {
    return { error: 'Submit progress for each assigned task instead.' };
  }

  await pool.execute(
    `UPDATE ojt_time_ins
     SET daily_progress_report = ?, progress_submitted_at = CURRENT_TIMESTAMP
     WHERE id = ? AND student_id = ?`,
    [progress, timeIn.id, studentId]
  );
  return { success: true };
}

async function isProgressReadyForTimeOut(studentId, dateKey = todayDateKey()) {
  const completedSessions = await countCompletedOjtSessionsToday(studentId, dateKey);
  if (completedSessions > 0) {
    return { ready: true };
  }
  const tasks = await getStudentDailyTasks(studentId, dateKey);
  if (tasks.length) {
    const pending = tasks.filter((t) => !isTaskSubmitted(t));
    if (pending.length) {
      return {
        ready: false,
        message: `Submit all ${tasks.length} assigned task(s) on Submit Reports before timing out.`,
        pendingCount: pending.length,
        totalTasks: tasks.length,
        needsProgress: true,
      };
    }
  }

  return { ready: true, totalTasks: tasks.length };
}

async function setDailyTaskStatus(taskId, studentId, completed) {
  await ensureDailyTasksTable();
  const [[task]] = await pool.execute(
    'SELECT id, status FROM student_daily_tasks WHERE id = ? AND student_id = ? LIMIT 1',
    [taskId, studentId]
  );
  if (!task) return { error: 'Task not found.' };

  const nextStatus = completed ? 'completed' : 'pending';
  await pool.execute(
    `UPDATE student_daily_tasks
     SET status = ?, completed_at = ?
     WHERE id = ? AND student_id = ?`,
    [nextStatus, completed ? new Date() : null, taskId, studentId]
  );
  return { success: true, status: nextStatus };
}

function buildTaskHoursDescription(tasks, timeInAt, timeOutAt, dailyReport = '') {
  const completed = tasks.filter((t) => isTaskSubmitted(t));
  const pending = tasks.filter((t) => !isTaskSubmitted(t));
  const lines = [
    `Auto-logged from OJT attendance (${formatTimeLabel(timeInAt)} – ${formatTimeLabel(timeOutAt)}).`,
  ];
  if (completed.length) {
    lines.push('Work progress submitted:');
    completed.forEach((t) => {
      lines.push(`- ${t.title}: ${t.student_progress || t.description || 'Done'}`);
    });
  }
  if (pending.length) {
    lines.push('Incomplete tasks:');
    pending.forEach((t) => {
      lines.push(`- ${t.title}`);
    });
  }
  if (dailyReport && typeof dailyReport === 'object') {
    lines.push(`Daily report: ${dailyReport.title} — ${dailyReport.description || ''}`);
  }
  return lines.join('\n').slice(0, 500);
}

function formatTimeLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function autoLogHoursFromTimeOut(studentId, dateKey, timeInRecord, photoPath) {
  await ensureInternshipHoursColumns();
  const hours = calculateOjtHours(timeInRecord.time_in_at, timeInRecord.time_out_at);
  if (hours <= 0) {
    return { error: 'Time-out must be after time-in.' };
  }

  const weekTotal = await getWeekHoursTotal(studentId, dateKey);
  if (weekTotal + hours > MAX_HOURS_PER_WEEK) {
    return {
      error: `Weekly limit is ${MAX_HOURS_PER_WEEK} hours. Adding ${hours.toFixed(2)} hrs would exceed the cap.`,
    };
  }

  const [[dayHoursRow]] = await pool.execute(
    `SELECT COALESCE(SUM(hours), 0) AS total FROM internship_hours
     WHERE student_id = ? AND log_date = ? AND status IN ('pending', 'validated')`,
    [studentId, dateKey]
  );
  const dayHoursTotal = Number(dayHoursRow?.total || 0);
  if (dayHoursTotal + hours > MAX_HOURS_PER_DAY) {
    return {
      error: `Daily limit is ${MAX_HOURS_PER_DAY} hours. This session would exceed today's total.`,
    };
  }

  const tasks = await getStudentDailyTasks(studentId, dateKey);
  const dailyReport = await getDailyInternshipReport(studentId, dateKey);
  const description = buildTaskHoursDescription(
    tasks,
    timeInRecord.time_in_at,
    timeInRecord.time_out_at,
    dailyReport
  );

  await pool.execute(
    `INSERT INTO internship_hours (student_id, log_date, hours, description, proof_photo, submit_ip, status, validated_at)
     VALUES (?, ?, ?, ?, ?, 'ojt-auto', 'validated', CURRENT_TIMESTAMP)`,
    [studentId, dateKey, hours, description, photoPath]
  );

  await pool.execute('UPDATE ojt_time_ins SET auto_hours = ? WHERE id = ?', [hours, timeInRecord.id]);

  const requirements = await getStudentClearanceRequirements(studentId);
  const [[validatedRow]] = await pool.execute(
    "SELECT COALESCE(SUM(hours), 0) AS total FROM internship_hours WHERE student_id = ? AND status = 'validated'",
    [studentId]
  );
  await syncStudentHoursClearance(studentId, Number(validatedRow.total), requirements.required_hours);

  return { success: true, hours, description };
}

async function recordOjtTimeOut(studentId, latitude, longitude, photoPath = null) {
  await ensureOjtColumns();
  const blocked = await assertStudentAttendanceAllowed(studentId);
  if (blocked) return blocked;

  const site = await getStudentOjtSite(studentId);
  if (!site) return { error: 'Your OJT location has not been set by the administrator yet.' };

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Invalid GPS coordinates.' };
  }
  if (!photoPath) {
    return { error: 'A camera photo is required to complete time-out.' };
  }

  const today = todayDateKey();
  const timeIn = await getActiveOjtSession(studentId, today);
  if (!timeIn || !timeIn.within_geofence) {
    return { error: 'You must time in before timing out.' };
  }

  const progressCheck = await isProgressReadyForTimeOut(studentId, today);
  if (!progressCheck.ready) {
    return { error: progressCheck.message, progress_required: true };
  }

  const distance = haversineMeters(lat, lng, site.latitude, site.longitude);
  const withinGeofence = isOjtTestBypass() || distance <= site.radius_meters;
  if (!withinGeofence) {
    return {
      error: `Your OJT site is ${site.name}. You are ${Math.round(distance)}m away — you must be within ${site.radius_meters}m to time out.`,
      distance,
      within_geofence: false,
    };
  }

  await pool.execute(
    `UPDATE ojt_time_ins
     SET time_out_at = CURRENT_TIMESTAMP,
         time_out_latitude = ?,
         time_out_longitude = ?,
         time_out_distance_meters = ?,
         time_out_photo = ?
     WHERE id = ? AND student_id = ?`,
    [lat, lng, Math.round(distance * 10) / 10, photoPath, timeIn.id, studentId]
  );

  const [[closedRow]] = await pool.execute('SELECT * FROM ojt_time_ins WHERE id = ? LIMIT 1', [timeIn.id]);
  const updated = mapOjtSessionRow(closedRow);
  const autoResult = await autoLogHoursFromTimeOut(studentId, today, updated, photoPath);
  if (autoResult.error) {
    return { error: autoResult.error, timeIn: updated };
  }

  return {
    success: true,
    timeIn: updated,
    hours: autoResult.hours,
    description: autoResult.description,
    distance,
  };
}

async function hasValidTimeInToday(studentId, dateKey = todayDateKey()) {
  const active = await getActiveOjtSession(studentId, dateKey);
  if (active) return true;
  const sessions = await getTodayOjtSessions(studentId, dateKey);
  return sessions.length > 0;
}

async function hasCompletedOjtDay(studentId, dateKey = todayDateKey()) {
  const sessions = await getTodayOjtSessions(studentId, dateKey);
  return sessions.some((s) => Boolean(s.time_out_at));
}

async function getAllCommunications() {
  const [rows] = await pool.query(
    `SELECT c.*, s.name AS sender_name, s.role AS sender_role,
            r.name AS receiver_name, r.role AS receiver_role
     FROM communication_logs c
     JOIN users s ON c.sender_id = s.id
     JOIN users r ON c.receiver_id = r.id
     ORDER BY c.created_at DESC LIMIT 50`
  );
  return rows;
}

module.exports = {
  REQUIRED_HOURS,
  DEFAULT_STUDENT_PASSWORD,
  MAX_HOURS_PER_DAY,
  MAX_HOURS_PER_WEEK,
  isOjtTestBypass,
  MIN_HOURS_PER_ENTRY,
  MIN_HOURS_DESCRIPTION,
  fetchUserById,
  getUsersByRole,
  getOrganizationList,
  formatDateKey,
  todayDateKey,
  validateHoursInput,
  validateHoursSubmission,
  ensureInternshipHoursColumns,
  getStudentHoursProgress,
  getWeekHoursTotal,
  validateLogInput,
  validateEvaluationInput,
  hasSupervisorFeedbackToday,
  getSupervisorFeedbackTodayMap,
  statusBadgeClass,
  getStudentStats,
  getUnreadMessageCount,
  getUserMessages,
  getUserMessageThreads,
  markDirectMessagesRead,
  recordValidation,
  sendMessage,
  generateClearanceReport,
  getStudentClearanceDetails,
  ensureClearanceReportColumns,
  isStudentInternshipCleared,
  syncStudentHoursClearance,
  assertStudentAttendanceAllowed,
  ensureInternshipClearanceColumn,
  getStudentsForClearanceReport,
  getClearanceReportById,
  getLatestClearanceReportForStudent,
  uploadClearanceCertificate,
  getGeneralCertificate,
  setGeneralCertificate,
  resolveStudentCertificate,
  getStudentNotifications,
  getUserNotifications,
  getNotificationCount,
  getUserNavData,
  createUserNotification,
  markAllNotificationsRead,
  ensureUserProfileColumns,
  ensureUserNameColumns,
  buildFullName,
  validateRegistrationInput,
  getUserProfile,
  getStudentRequiredHours,
  validateRequiredHoursInput,
  updateStudentRequiredHours,
  grantStudentValidatedHours,
  rememberLoginPassword,
  getAllPortalUsers,
  getPortalUserById,
  updatePortalUser,
  setPortalUserPassword,
  createStudentAccount,
  createPortalAccount,
  importStudentsFromRows,
  deletePortalUser,
  createCompanyUserAccount,
  updateProgramRequiredHours,
  updateProgramClearanceRequirements,
  getProgramClearanceRequirements,
  getStudentClearanceRequirements,
  getProgramCatalog,
  groupStudentsByProgram,
  ensureOjtColumns,
  getStudentOjtSite,
  getTodayTimeIn,
  getActiveOjtSession,
  getTodayOjtSessions,
  getStudentOjtHistory,
  getStudentAttendanceByDate,
  getInternshipStartDate,
  updateStudentOjtSite,
  verifyOjtLocation,
  recordOjtTimeIn,
  recordOjtTimeOut,
  hasValidTimeInToday,
  hasCompletedOjtDay,
  calculateOjtHours,
  getStudentDailyTasks,
  getPendingTaskSubmissions,
  getReviewedTaskSubmissions,
  getStudentTaskRecords,
  getStudentTaskHistory,
  assignDailyTask,
  submitTaskProgress,
  reviewDailyTask,
  isTaskSubmitted,
  getTaskDisplayStatus,
  submitDailyProgressReport,
  isProgressReadyForTimeOut,
  getDailyInternshipReport,
  submitDailyInternshipReport,
  ensureInternshipLogsColumns,
  setDailyTaskStatus,
  ensureDailyTasksTable,
  haversineMeters,
  DEFAULT_OJT_RADIUS,
  getAllStudentsWithPerformance,
  getAllCommunications,
};
