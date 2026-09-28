const fs = require('fs');
const path = require('path');
const pool = require('./db');
const { getPgPoolConfig } = require('./env');

let bootstrapPromise = null;
let bootstrapComplete = false;

async function tableExists(tableName) {
  const [rows] = await pool.execute(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ?
    ) AS ok`,
    [tableName]
  );
  return Boolean(rows[0]?.ok);
}

async function runSqlFile(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  const sql = fs.readFileSync(filePath, 'utf8');
  if (!pool.isPostgres) return;
  const { Pool } = require('pg');
  const pg = new Pool(getPgPoolConfig());
  try {
    await pg.query(sql);
  } finally {
    await pg.end();
  }
}

async function bootstrapDatabase() {
  if (!pool.isPostgres || process.env.SKIP_DB_BOOTSTRAP === 'true') {
    bootstrapComplete = true;
    return;
  }

  const hasUsers = await tableExists('users');
  if (hasUsers) {
    bootstrapComplete = true;
    return;
  }

  console.log('Supabase schema missing — applying supabase/schema.sql…');
  await runSqlFile('supabase/schema.sql');

  const seedPath = path.join(__dirname, '../supabase/data-export.sql');
  if (fs.existsSync(seedPath)) {
    console.log('Seeding Supabase from supabase/data-export.sql…');
    await runSqlFile('supabase/data-export.sql');
  } else {
    console.log('Seeding demo accounts from supabase/seed.sql…');
    await runSqlFile('supabase/seed.sql');
  }

  bootstrapComplete = true;
  console.log('Supabase database ready.');
}

function ensureDatabaseReady() {
  if (bootstrapComplete || process.env.SKIP_DB_BOOTSTRAP === 'true') {
    bootstrapComplete = true;
    return Promise.resolve();
  }

  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapDatabase().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

module.exports = { bootstrapDatabase, ensureDatabaseReady };
