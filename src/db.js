'use strict';

const { Pool } = require('pg');

// Use the public TCP proxy URL — most reliable across Railway service boundaries.
// Set BHAVA_DB_URL in Railway bhava-backend variables to the public Postgres URL.
function createPool() {
  const connStr = process.env.BHAVA_DB_URL;
  if (connStr) {
    // Strip any existing sslmode param to avoid conflicts
    const cleanUrl = connStr.replace(/[?&]sslmode=[^&]*/g, '');
    console.log('[BhāvaDB] Using BHAVA_DB_URL with require SSL');
    return new Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
      query_timeout: 30000,
    });
  }
  // Fallback to individual env vars
  console.log('[BhāvaDB] Using PGHOST/PGPORT vars');
  return new Pool({
    host:     process.env.PGHOST,
    port:     parseInt(process.env.PGPORT || '5432'),
    user:     process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'railway',
    ssl:      false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
  });
}

const pool = createPool();

const _pool = pool; // alias for proxy below
const proxyPool = {
  async connect() { return _pool.connect(); },
  async query(...args) { return _pool.query(...args); },
  on(event, cb) { _pool.on(event, cb); },
};

pool.on('error', (err) => {
  console.error('[BhāvaDB] Unexpected pool error:', err.message);
});

/**
 * Run a query. Returns { rows }.
 */
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

/**
 * Run multiple queries in a transaction.
 * fn receives a client with a .query() method.
 */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, transaction, pool: proxyPool };