/**
 * Migrate local MySQL (XAMPP) data → Supabase PostgreSQL.
 *
 * 1. Add DATABASE_URL to .env (Supabase → Project Settings → Database → URI)
 * 2. Run: npm run migrate:supabase
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env');
  console.error('Supabase → Project Settings → Database → Connection string (URI)');
  process.exit(1);
}

const TABLES_IN_ORDER = [
  'users',
  'program_clearance_requirements',
  'organizations',
  'internship_logs',
  'internship_hours',
  'ojt_time_ins',
  'student_daily_tasks',
  'evaluations',
  'validation_records',
  'clearance_reports',
  'portal_settings',
  'communication_logs',
  'notification_reads',
  'user_notifications',
];

const SERIAL_TABLES = [
  'users',
  'organizations',
  'internship_logs',
  'internship_hours',
  'ojt_time_ins',
  'student_daily_tasks',
  'evaluations',
  'validation_records',
  'clearance_reports',
  'communication_logs',
  'notification_reads',
  'user_notifications',
];

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (value !== null && typeof value === 'object' && !(value instanceof Buffer)) {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function runSchema(pg) {
  const schemaPath = path.join(__dirname, '../supabase/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pg.query(sql);
  console.log('Schema applied on Supabase.');
}

async function migrateTable(mysqlConn, pg, table) {
  const [rows] = await mysqlConn.query(`SELECT * FROM \`${table}\``);
  if (!rows.length) {
    console.log(`  ${table}: 0 rows (skipped)`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');

  let conflictClause = ' ON CONFLICT DO NOTHING';
  if (SERIAL_TABLES.includes(table)) {
    conflictClause = ' ON CONFLICT (id) DO UPDATE SET ' +
      columns.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  } else if (table === 'program_clearance_requirements') {
    conflictClause = ' ON CONFLICT (course_program) DO UPDATE SET ' +
      columns.filter((c) => c !== 'course_program').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  } else if (table === 'portal_settings') {
    conflictClause = ' ON CONFLICT (setting_key) DO UPDATE SET ' +
      columns.filter((c) => c !== 'setting_key').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  }

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const values = columns.map((c) => row[c]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    await pg.query(
      `INSERT INTO ${table} (${colList}) VALUES (${placeholders})${conflictClause}`,
      values
    );
  }

  console.log(`  ${table}: ${rows.length} rows`);
}

async function resetSequences(pg) {
  for (const table of SERIAL_TABLES) {
    await pg.query(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${table}), 1),
        true
      )
    `);
  }
  console.log('ID sequences updated.');
}

async function main() {
  const mysqlConn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'lssti_internship',
  });

  const pg = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  try {
    console.log('Connecting to Supabase…');
    await pg.query('SELECT 1');
    console.log('Connected.\nApplying schema…');
    await runSchema(pg);

    console.log('\nMigrating data from local MySQL…');
    for (const table of TABLES_IN_ORDER) {
      try {
        await migrateTable(mysqlConn, pg, table);
      } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
          console.log(`  ${table}: table not in MySQL (skipped)`);
          continue;
        }
        throw err;
      }
    }

    await resetSequences(pg);
    console.log('\nDone! Your data is now on Supabase.');
    console.log('Keep DATABASE_URL in .env and restart the app: npm start');
  } finally {
    await mysqlConn.end();
    await pg.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
