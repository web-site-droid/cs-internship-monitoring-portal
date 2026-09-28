function isVercel() {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL);
}

function applyVercelDefaults() {
  if (!isVercel()) return;

  if (process.env.SKIP_DB_BOOTSTRAP === undefined) {
    process.env.SKIP_DB_BOOTSTRAP = 'true';
  }
  if (process.env.OJT_TEST_BYPASS === undefined) {
    process.env.OJT_TEST_BYPASS = 'false';
  }
}

function applyPerformanceDefaults() {
  if (process.env.DATABASE_URL && process.env.SKIP_DB_BOOTSTRAP === undefined) {
    process.env.SKIP_DB_BOOTSTRAP = 'true';
  }
}

function getRequiredEnvErrors() {
  const errors = [];

  if (isVercel() && !process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set. Add it in Vercel → Settings → Environment Variables.');
  }

  if (isVercel()) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change-this')) {
      errors.push('JWT_SECRET must be a long random string (not the placeholder).');
    }
    if (!process.env.COOKIE_SECRET || process.env.COOKIE_SECRET.includes('change-this')) {
      errors.push('COOKIE_SECRET must be a long random string (not the placeholder).');
    }
  }

  return errors;
}

function getPgPoolConfig() {
  const onVercel = isVercel();
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
    idleTimeoutMillis: 30000,
    max: Number(process.env.PG_POOL_MAX || (onVercel ? 2 : 6)),
    keepAlive: true,
  };
}

function renderConfigErrorHtml(errors) {
  const items = errors.map((e) => `<li>${e}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Configuration Required</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 20px; color: #14532d; }
    h1 { font-size: 1.35rem; }
    ul { line-height: 1.6; color: #475569; }
    code { background: #f0fdf4; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Deployment configuration required</h1>
  <p>Add these in <strong>Vercel → Project → Settings → Environment Variables</strong>, then redeploy:</p>
  <ul>${items}</ul>
  <p>Required variables: <code>DATABASE_URL</code>, <code>JWT_SECRET</code>, <code>COOKIE_SECRET</code>, <code>SKIP_DB_BOOTSTRAP=true</code>, <code>OJT_TEST_BYPASS=false</code></p>
  <p>See <code>.env.example</code> in the repository for the Supabase connection format.</p>
</body>
</html>`;
}

module.exports = {
  isVercel,
  applyVercelDefaults,
  applyPerformanceDefaults,
  getRequiredEnvErrors,
  getPgPoolConfig,
  renderConfigErrorHtml,
};
