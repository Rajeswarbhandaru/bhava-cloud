'use strict';

/**
 * migrate.js
 * Runs 001_init.sql against the Railway PostgreSQL DB on first startup.
 * Safe to run multiple times — all CREATE TABLE statements use IF NOT EXISTS.
 */

const fs   = require('fs');
const path = require('path');
const { pool } = require('./db');

async function runMigrations() {
  const sqlPath = path.join(__dirname, '..', 'migrations', '001_init.sql');
  const sql     = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('[Bhāva Cloud] Database migrations applied.');
  } catch (err) {
    console.error('[Bhāva Cloud] Migration error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
