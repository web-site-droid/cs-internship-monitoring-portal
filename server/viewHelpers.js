const { statusBadgeClass, groupStudentsByProgram, getTaskDisplayStatus } = require('./helpers');

const COURSE_PROGRAMS = [
  'BS Computer Studies',
];

const PROGRAM_NAME = COURSE_PROGRAMS[0];

function parseAddressFields(address) {
  if (!address) {
    return { street: '', barangay: '', city: '', province: '' };
  }
  const parts = String(address).split('|');
  if (parts.length === 4) {
    return {
      street: parts[0] || '',
      barangay: parts[1] || '',
      city: parts[2] || '',
      province: parts[3] || '',
    };
  }
  return { street: address, barangay: '', city: '', province: '' };
}

function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const str = String(value);
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const [y, m, d] = iso[1].split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return str.slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const str = String(value);
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))/);
  if (iso) {
    const [y, m, d] = iso[1].split('-').map(Number);
    const parsed = iso[2]
      ? new Date(y, m - 1, d, ...iso[2].split(':').map(Number))
      : new Date(y, m - 1, d);
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return str;
}

function formatTime(value) {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatLogEntryDateTime(logDate, createdAt) {
  const datePart = formatDate(logDate);
  if (!createdAt) return datePart;
  const parsed = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return datePart;
  const timePart = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

function statusLabel(status) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderStatusBadge(status) {
  const cls = statusBadgeClass(status);
  const label = statusLabel(status);
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function roleLabel(role) {
  const map = { student: 'Student', supervisor: 'Staff', admin: 'Admin', school: 'Company' };
  return map[role] || role;
}

function notificationTitle(n) {
  if (n.kind === 'alert') return n.title || n.subject || 'Notification';
  const type = n.record_type === 'hours' ? 'Hour log' : 'Internship report';
  return `${type} ${n.action}`;
}

function notificationBody(n) {
  if (n.kind === 'alert') return n.body || n.feedback || '';
  return n.feedback || `Your submission was ${n.action}.`;
}

function isNotificationUnread(n) {
  return !Number(n.is_read);
}

const { groupMessagesIntoThreads } = require('./messageThreads');

function groupMessageThreads(userId, messages) {
  return groupMessagesIntoThreads(userId, messages || []);
}

function buildProgramCatalog(groups, programOrder, defaultHours = 200) {
  const byProgram = new Map((groups || []).map((group) => [group.program, group]));
  const catalog = programOrder.map((program) => {
    const group = byProgram.get(program);
    return group || {
      program,
      students: [],
      required_hours: defaultHours,
      required_reports: 1,
      required_evaluations: 1,
      custom_requirements: [],
      student_count: 0,
    };
  });

  const unassigned = byProgram.get('Unassigned Program');
  if (unassigned) catalog.push(unassigned);

  return catalog;
}

function programSlug(name) {
  return String(name).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'program';
}

function buildOjtMapEmbedUrl(lat, lng, apiKey = '') {
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return '';
  const coords = `${latN.toFixed(7)},${lngN.toFixed(7)}`;
  if (apiKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(coords)}&zoom=17&maptype=roadmap`;
  }
  return `https://maps.google.com/maps?q=${encodeURIComponent(coords)}&ll=${encodeURIComponent(coords)}&z=17&hl=en&output=embed`;
}

function buildOjtMapDirectionsUrl(lat, lng) {
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return '#';
  const coords = `${latN.toFixed(7)},${lngN.toFixed(7)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords)}`;
}

module.exports = {
  COURSE_PROGRAMS,
  parseAddressFields,
  formatDate,
  formatDateTime,
  formatTime,
  formatLogEntryDateTime,
  statusLabel,
  statusBadgeClass,
  renderStatusBadge,
  getTaskDisplayStatus,
  roleLabel,
  notificationTitle,
  notificationBody,
  isNotificationUnread,
  groupMessageThreads,
  groupStudentsByProgram,
  programSlug,
  buildProgramCatalog,
  buildOjtMapEmbedUrl,
  buildOjtMapDirectionsUrl,
  PROGRAM_NAME,
};
