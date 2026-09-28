const path = require('path');
const multer = require('multer');
const { uploadDir: ensureUploadDir } = require('./uploadPaths');

const uploadDir = ensureUploadDir('certificates');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    const reportId = req.params.id || 'report';
    cb(null, `cert-${reportId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(file.mimetype) || allowedExt.includes(ext));
  },
});

module.exports = { upload, uploadDir };
