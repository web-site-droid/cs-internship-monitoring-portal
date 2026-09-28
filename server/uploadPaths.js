const fs = require('fs');
const path = require('path');

const localRoot = path.join(__dirname, '../public/uploads');
let cachedRoot = null;

function canWrite(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-test');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function uploadsRoot() {
  if (cachedRoot) return cachedRoot;
  if (canWrite(localRoot)) {
    cachedRoot = localRoot;
    return cachedRoot;
  }
  cachedRoot = path.join('/tmp', 'lssti-uploads');
  fs.mkdirSync(cachedRoot, { recursive: true });
  return cachedRoot;
}

function uploadDir(name) {
  const dir = path.join(uploadsRoot(), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function publicUploadPath(filePath) {
  const relative = path.relative(uploadsRoot(), filePath).split(path.sep).join('/');
  return `/uploads/${relative}`;
}

function resolveUploadPath(webPath) {
  const relative = String(webPath || '').replace(/^\//, '').replace(/^uploads\//, '');
  const fromWritable = path.join(uploadsRoot(), relative);
  if (fs.existsSync(fromWritable)) return fromWritable;
  return path.join(__dirname, '../public/uploads', relative);
}

function usesEphemeralUploads() {
  const root = uploadsRoot();
  const rel = path.relative(path.join(__dirname, '../public'), root);
  return rel.startsWith('..') || path.isAbsolute(rel);
}

module.exports = {
  uploadsRoot,
  uploadDir,
  publicUploadPath,
  resolveUploadPath,
  usesEphemeralUploads,
};
