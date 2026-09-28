/**
 * Optional Vercel build check — always exits successfully.
 * Runtime env vars are validated when the app starts (see server/env.js).
 */
require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'COOKIE_SECRET'];
const recommended = ['SKIP_DB_BOOTSTRAP', 'OJT_TEST_BYPASS'];

const missing = required.filter((key) => !process.env[key]);
const missingRecommended = recommended.filter((key) => !process.env[key]);

if (missing.length) {
  console.warn('');
  console.warn('Note: some env vars are missing at build time.');
  missing.forEach((key) => console.warn(`  - ${key}`));
  console.warn('Add them in Vercel -> Settings -> Environment Variables, then Redeploy.');
  console.warn('See VERCEL.md in the repo.');
  console.warn('');
} else {
  console.log('DATABASE_URL, JWT_SECRET, and COOKIE_SECRET are set.');
}

if (missingRecommended.length) {
  console.warn(`Recommended: ${missingRecommended.join(', ')}`);
}

console.log('Build complete.');
