const mysql = require('mysql2/promise');
const { isVercel, getPgPoolConfig } = require('./env');

function useLocalMysql() {
  if (isVercel()) return false;
  const flag = process.env.USE_LOCAL_DB;
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return !process.env.DATABASE_URL;
}

const isPostgres = Boolean(process.env.DATABASE_URL) && !useLocalMysql();
let pool;

function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function wrapPgResult(result) {
  const command = result.command;
  if (command === 'INSERT') {
    const insertId = result.rows[0]?.id ?? 0;
    return [{ insertId, affectedRows: result.rowCount }, []];
  }
  if (command === 'UPDATE' || command === 'DELETE') {
    return [{ insertId: 0, affectedRows: result.rowCount }, []];
  }
  return [result.rows, result.fields || []];
}

if (isVercel() && !isPostgres) {
  pool = {
    isPostgres: false,
    query: async () => {
      throw new Error('DATABASE_URL is not configured on Vercel.');
    },
    execute: async () => {
      throw new Error('DATABASE_URL is not configured on Vercel.');
    },
  };
} else if (isPostgres) {
  const { Pool } = require('pg');
  const pgPool = new Pool(getPgPoolConfig());

  pgPool.query('SELECT 1').catch(() => {});

  pool = {
    isPostgres: true,
    query: async (sql, params = []) => {
      const result = await pgPool.query(convertPlaceholders(sql), params);
      return [result.rows, result.fields || []];
    },
    execute: async (sql, params = []) => {
      let querySql = convertPlaceholders(sql);
      if (/^\s*INSERT\s+/i.test(sql) && !/\bRETURNING\b/i.test(sql)) {
        querySql = `${querySql.trim().replace(/;?\s*$/, '')} RETURNING id`;
      }
      try {
        const result = await pgPool.query(querySql, params);
        return wrapPgResult(result);
      } catch (err) {
        if (err.code === '42703' && /RETURNING id/i.test(querySql)) {
          const fallback = await pgPool.query(convertPlaceholders(sql), params);
          return wrapPgResult(fallback);
        }
        throw err;
      }
    },
  };
} else {
  const mysqlPool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'lssti_internship',
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 5000,
    enableKeepAlive: true,
  });

  pool = {
    isPostgres: false,
    query: (sql, params) => mysqlPool.query(sql, params),
    execute: (sql, params) => mysqlPool.execute(sql, params),
  };
}

if (!isVercel() || isPostgres) {
  const label = isPostgres ? 'Supabase (PostgreSQL)' : `MySQL (${process.env.DB_HOST || '127.0.0.1'})`;
  console.log(`Database: ${label}`);
}

module.exports = pool;
module.exports.isPostgres = isPostgres;
module.exports.useLocalMysql = useLocalMysql;
