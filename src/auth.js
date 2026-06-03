'use strict';

/**
 * auth.js — Google OAuth + session middleware
 *
 * Flow:
 *   1. Teacher clicks "Sign in with Google" on dashboard
 *   2. Dashboard redirects to GET /auth/google
 *   3. Google redirects back to GET /auth/google/callback
 *   4. We look up teacher by google_email in DB
 *   5. If found + active → issue a signed JWT → redirect to dashboard
 *   6. Dashboard stores JWT in localStorage, sends as Bearer token on all API calls
 *
 * Env vars required:
 *   GOOGLE_CLIENT_ID       — from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET   — from Google Cloud Console
 *   GOOGLE_REDIRECT_URI    — e.g. https://your-app.railway.app/auth/google/callback
 *   JWT_SECRET             — any random 32+ char string
 */

const { query } = require('./db');
const jwt        = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const oauthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const JWT_SECRET  = process.env.JWT_SECRET || 'bhava-change-this-secret';
const JWT_EXPIRES = '7d'; // teacher stays logged in for 7 days

// ── Google OAuth URL ──────────────────────────────────────────────────────────
function getGoogleAuthUrl() {
  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
}

// ── Exchange code for teacher profile ─────────────────────────────────────────
async function handleGoogleCallback(code) {
  // Exchange auth code for tokens
  const { tokens } = await oauthClient.getToken(code);
  oauthClient.setCredentials(tokens);

  // Verify ID token and extract email
  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const email   = payload.email;
  const name    = payload.name;

  // Look up teacher in DB
  const { rows } = await query(
    'SELECT * FROM teachers WHERE google_email = $1 AND is_active = TRUE',
    [email]
  );

  if (rows.length === 0) {
    // Not registered — return error (Bhāva admin must add them first)
    return { error: 'not_registered', email, name };
  }

  const teacher = rows[0];

  // Issue JWT
  const token = jwt.sign(
    {
      teacher_id: teacher.id,
      email:      teacher.google_email,
      name:       teacher.name,
      school_id:  teacher.school_id,
      class:      teacher.class,
      section:    teacher.section,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  return { token, teacher };
}

// ── Middleware: verify JWT on API routes ──────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated. Please sign in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.teacher   = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

// ── Middleware: verify sync API key (for Electron app) ───────────────────────
function requireSyncKey(req, res, next) {
  const key = req.headers['x-bhava-sync-key'] || req.query.sync_key;
  if (!key || key !== process.env.SYNC_API_KEY) {
    return res.status(401).json({ error: 'Invalid sync key.' });
  }
  next();
}

module.exports = {
  getGoogleAuthUrl,
  handleGoogleCallback,
  requireAuth,
  requireSyncKey,
};
