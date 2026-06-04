'use strict';

/**
 * routes-admin.js
 * Admin endpoints — only callable with ADMIN_API_KEY header.
 * You (Bhāva admin) use these to add/manage teachers.
 */

const express = require('express');
const { query } = require('./db');

const router = express.Router();

// Admin key middleware
router.use((req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Admin access required.' });
  }
  next();
});

// ── POST /admin/school ────────────────────────────────────────────────────────
// Add or update a school.
// Body: { id, name, city, state }
router.post('/school', async (req, res) => {
  try {
    const { id, name, city, state } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required.' });
    }
    const { rows } = await query(`
      INSERT INTO schools (id, name, city, state)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        name  = EXCLUDED.name,
        city  = EXCLUDED.city,
        state = EXCLUDED.state
      RETURNING *
    `, [id.toUpperCase(), name, city || '', state || '']);
    return res.json({ ok: true, school: rows[0] });
  } catch (err) {
    console.error('[admin/school]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/schools ─────────────────────────────────────────────────────────
// List all schools.
router.get('/schools', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, city, state, created_at FROM schools ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/teacher ───────────────────────────────────────────────────────
// Add a new teacher.
// Body: { google_email, name, school_id, class, section }
router.post('/teacher', async (req, res) => {
  try {
    const { google_email, name, school_id, class: cls, section } = req.body;
    if (!google_email || !name || !school_id || !cls || !section) {
      return res.status(400).json({ error: 'google_email, name, school_id, class, section all required.' });
    }

    const { rows } = await query(`
      INSERT INTO teachers (google_email, name, school_id, class, section)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (google_email) DO UPDATE SET
        name      = EXCLUDED.name,
        school_id = EXCLUDED.school_id,
        class     = EXCLUDED.class,
        section   = EXCLUDED.section,
        is_active = TRUE
      RETURNING *
    `, [google_email, name, school_id, cls, section]);

    return res.json({ ok: true, teacher: rows[0] });
  } catch (err) {
    console.error('[admin/teacher]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/teachers ───────────────────────────────────────────────────────
// List all teachers.
router.get('/teachers', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, google_email, name, school_id, class, section, is_active, created_at
       FROM teachers ORDER BY school_id, class, section`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /admin/teacher/:id ─────────────────────────────────────────────────
// Deactivate a teacher (soft delete).
router.delete('/teacher/:id', async (req, res) => {
  try {
    await query(
      `UPDATE teachers SET is_active = FALSE WHERE id = $1`,
      [req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/sync-log ───────────────────────────────────────────────────────
// See recent sync activity from Electron machines.
router.get('/sync-log', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT 50`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
