require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const TABLES = [
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

const JSONB_COLUMNS = {
  clearance_reports: ['report_data'],
};

const DATE_COLUMNS = {
  internship_logs: ['log_date'],
  internship_hours: ['log_date'],
  ojt_time_ins: ['time_in_date'],
  student_daily_tasks: ['task_date'],
};

function formatDateOnly(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `'${y}-${m}-${d}'`;
  }
  const str = String(value);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? `'${match[1]}'` : `'${str.replace(/'/g, "''")}'`;
}

function esc(table, col, value) {
  if (value === null || value === undefined) return 'NULL';
  if (DATE_COLUMNS[table]?.includes(col)) return formatDateOnly(value);
  if (JSONB_COLUMNS[table]?.includes(col)) {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    return `'${json.replace(/'/g, "''")}'::jsonb`;
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace('T', ' ').replace('Z', '+00')}'`;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'lssti_internship',
  });

  let out = '-- LSSTI data export for Supabase (project knrrurercehjkkizuzoq)\n';
  out += '-- Run AFTER supabase/schema.sql\n\n';

  for (const table of TABLES) {
    try {
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const colList = columns.map((c) => `"${c}"`).join(', ');
      out += `\n-- ${table} (${rows.length} rows)\n`;
      for (const row of rows) {
        const vals = columns.map((c) => esc(table, c, row[c])).join(', ');
        out += `INSERT INTO ${table} (${colList}) VALUES (${vals});\n`;
      }
    } catch (err) {
      out += `-- skip ${table}: ${err.message}\n`;
    }
  }

  const serials = [
    'users', 'organizations', 'internship_logs', 'internship_hours', 'ojt_time_ins',
    'student_daily_tasks', 'evaluations', 'validation_records', 'clearance_reports',
    'communication_logs', 'notification_reads', 'user_notifications',
  ];
  out += '\n-- Reset ID sequences\n';
  for (const table of serials) {
    out += `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true);\n`;
  }

  const file = path.join(__dirname, '../supabase/data-export.sql');
  fs.writeFileSync(file, out);
  console.log(`Wrote ${file} (${out.length} bytes)`);
  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
