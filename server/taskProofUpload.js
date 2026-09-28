const path = require('path');
const multer = require('multer');
const { uploadDir: ensureUploadDir } = require('./uploadPaths');

const uploadDir = ensureUploadDir('task-proof');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const taskId = req.params.id || 'task';
    cb(null, `task-${taskId}-${Date.now()}${ext}`);
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

module.exports = { upload, uploadDir };
