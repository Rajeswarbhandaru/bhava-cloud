'use strict';

/**
 * server.js — Bhāva Tech Cloud Backend
 *
 * Endpoints:
 *   GET  /health                        — health check
 *   GET  /auth/google                   — redirect to Google login
 *   GET  /auth/google/callback          — Google OAuth callback
 *   POST /sync/students                 — Electron: push student list
 *   POST /sync/session                  — Electron: push one session
 *   POST /sync/quotients                — Electron: push quotient update
 *   POST /sync/bulk                     — Electron: push all history (first sync)
 *   GET  /dashboard/me                  — Teacher: get own profile
 *   GET  /dashboard/class               — Teacher: class snapshot
 *   GET  /dashboard/students            — Teacher: student list with scores
 *   GET  /dashboard/sessions/:id        — Teacher: recent sessions for student
 *   POST /admin/teacher                 — Admin: add/update teacher
 *   GET  /admin/teachers                — Admin: list teachers
 *   DELETE /admin/teacher/:id           — Admin: deactivate teacher
 *   GET  /admin/sync-log                — Admin: sync activity log
 *
 * Required environment variables (set in Railway):
 *   DATABASE_URL          — PostgreSQL connection string (auto-set by Railway)
 *   GOOGLE_CLIENT_ID      — Google OAuth client ID
 *   GOOGLE_CLIENT_SECRET  — Google OAuth client secret
 *   GOOGLE_REDIRECT_URI   — e.g. https://your-app.railway.app/auth/google/callback
 *   JWT_SECRET            — Random 32+ char string (generate with: openssl rand -hex 32)
 *   SYNC_API_KEY          — Secret key Electron uses to push data (any strong random string)
 *   ADMIN_API_KEY         — Secret key for admin endpoints (keep private)
 *   FRONTEND_URL          — Teacher dashboard URL (for CORS + OAuth redirect)
 *   PORT                  — Auto-set by Railway
 */

require('dotenv').config(); // local dev only; Railway uses env vars directly

const express  = require('express');
const cors     = require('cors');
const { query } = require('./src/db');
const { getGoogleAuthUrl, handleGoogleCallback } = require('./src/auth');

const routesSync      = require('./src/routes-sync');
const routesDashboard = require('./src/routes-dashboard');
const routesAdmin     = require('./src/routes-admin');
const { runMigrations } = require('./src/migrate');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || '*',
    'http://localhost:3000',
    /\.railway\.app$/,
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-bhava-sync-key', 'x-admin-key'],
}));

app.use(express.json({ limit: '5mb' })); // bulk sync can be large

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Bhāva Cloud', time: new Date().toISOString() });
});

// ── Debug: show all env vars relevant to DB (safe — masks password) ───────────
app.get('/debug/env', (req, res) => {
  const mask = v => v ? v.slice(0,4) + '****' : '(not set)';
  res.json({
    BHAVA_DB_URL:  process.env.BHAVA_DB_URL  ? process.env.BHAVA_DB_URL.replace(/:([^@]+)@/, ':****@') : '(not set)',
    PGHOST:        process.env.PGHOST        || '(not set)',
    PGPORT:        process.env.PGPORT        || '(not set)',
    PGUSER:        process.env.PGUSER        || '(not set)',
    PGPASSWORD:    mask(process.env.PGPASSWORD),
    PGDATABASE:    process.env.PGDATABASE    || '(not set)',
    DATABASE_URL:  process.env.DATABASE_URL  ? process.env.DATABASE_URL.replace(/:([^@]+)@/, ':****@') : '(not set)',
    NODE_ENV:      process.env.NODE_ENV      || '(not set)',
  });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
app.get('/auth/google', (req, res) => {
  const url = getGoogleAuthUrl();
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${process.env.FRONTEND_URL || '/'}?auth_error=cancelled`);
  }

  try {
    const result = await handleGoogleCallback(code);

    if (result.error === 'not_registered') {
      // Teacher's Google account not registered in Bhāva system
      const msg = encodeURIComponent(
        `Your Google account (${result.email}) is not registered in Bhāva. Please contact your Bhāva coordinator.`
      );
      return res.redirect(`${process.env.FRONTEND_URL || '/'}?auth_error=${msg}`);
    }

    // Success — send JWT to frontend via redirect with token in URL fragment
    // (safer than query param — fragments are not sent to servers)
    const token = encodeURIComponent(result.token);
    return res.redirect(`${process.env.FRONTEND_URL || '/'}#token=${token}`);

  } catch (err) {
    console.error('[auth/google/callback]', err.message);
    const msg = encodeURIComponent('Login failed. Please try again.');
    return res.redirect(`${process.env.FRONTEND_URL || '/'}?auth_error=${msg}`);
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/sync',      routesSync);
app.use('/dashboard', routesDashboard);
app.use('/admin',     routesAdmin);

// -- Static files (teacher dashboard HTML) --
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  // Start HTTP server immediately — don't block on DB connection
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Bhāva Cloud] Server running on port ${PORT}`);
  });

  // Try DB connection in background — retry every 10s until success
  async function connectWithRetry(attempt = 1) {
    try {
      await query('SELECT 1');
      console.log('[Bhāva Cloud] Database connected.');
      await runMigrations();
      console.log('[Bhāva Cloud] Ready.');
    } catch (err) {
      console.error(`[Bhāva Cloud] DB connect attempt ${attempt} failed: ${err.message || JSON.stringify(err)}`);
      setTimeout(() => connectWithRetry(attempt + 1), 10000);
    }
  }

  // Wait 3 seconds then try connecting
  setTimeout(() => connectWithRetry(), 3000);
}

start();
