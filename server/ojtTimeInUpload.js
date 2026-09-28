const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { uploadDir, publicUploadPath } = require('./uploadPaths');

const uploadRoot = uploadDir('attendance');

function pad(value) {
  return String(value).padStart(2, '0');
}

function safeFolderName(value) {
  const cleaned = String(value || 'student')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 80) || 'student';
}

function stampParts(date = new Date()) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return { day, time, folder: `${day}_${time}` };
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const student = safeFolderName(req.user?.name || `student-${req.user?.id || 'unknown'}`);
    const { folder } = stampParts();
    const dir = path.join(uploadRoot, student, folder);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, _file, cb) => {
    const kind = String(req.originalUrl || '').includes('time-out') ? 'time-out' : 'time-in';
    cb(null, `${kind}.jpg`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

module.exports = { upload, uploadRoot, publicUploadPath };
