'use strict';

/**
 * routes-sync.js
 * Endpoints called by the Electron app to push data to the cloud.
 * All routes require the x-bhava-sync-key header.
 */

const express = require('express');
const { query, transaction } = require('./db');
const { requireSyncKey } = require('./auth');

const router = express.Router();
router.use(requireSyncKey);

// ── POST /sync/students ───────────────────────────────────────────────────────
// Electron pushes the full student list for a school (on startup).
// Body: { school_id, students: [{ id, roll_no, name, class, section, is_active }] }
router.post('/students', async (req, res) => {
  try {
    const { school_id, students } = req.body;
    if (!school_id || !Array.isArray(students)) {
      return res.status(400).json({ error: 'school_id and students[] required.' });
    }

    await transaction(async (client) => {
      for (const s of students) {
        await client.query(`
          INSERT INTO students (id, school_id, roll_no, name, class, section, is_active, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id, school_id) DO UPDATE SET
            roll_no   = EXCLUDED.roll_no,
            name      = EXCLUDED.name,
            class     = EXCLUDED.class,
            section   = EXCLUDED.section,
            is_active = EXCLUDED.is_active,
            synced_at = NOW()
        `, [s.id, school_id, s.roll_no, s.name, s.class, s.section, s.is_active !== false]);
      }
    });

    await query(
      `INSERT INTO sync_log (school_id, event_type, record_count) VALUES ($1, 'students', $2)`,
      [school_id, students.length]
    );

    return res.json({ ok: true, synced: students.length });
  } catch (err) {
    console.error('[sync/students]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /sync/session ────────────────────────────────────────────────────────
// Electron pushes one completed game session immediately after it ends.
// Body: { id, student_id, school_id, game_name, raw_score, completed,
//         started_at, ended_at, duration_minutes }
router.post('/session', async (req, res) => {
  try {
    const s = req.body;
    if (!s.id || !s.student_id || !s.school_id) {
      return res.status(400).json({ error: 'id, student_id, school_id required.' });
    }

    await query(`
      INSERT INTO game_sessions
        (id, student_id, school_id, game_name, raw_score, completed,
         started_at, ended_at, duration_minutes, synced_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
      ON CONFLICT (id) DO UPDATE SET
        raw_score        = EXCLUDED.raw_score,
        completed        = EXCLUDED.completed,
        ended_at         = EXCLUDED.ended_at,
        duration_minutes = EXCLUDED.duration_minutes,
        synced_at        = NOW()
    `, [
      s.id, s.student_id, s.school_id, s.game_name,
      s.raw_score, s.completed,
      s.started_at, s.ended_at, s.duration_minutes
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[sync/session]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /sync/quotients ──────────────────────────────────────────────────────
// Electron pushes updated IQ/EQ/SQ quotients after recalculation.
// Body: { student_id, school_id, ...all quotient fields }
router.post('/quotients', async (req, res) => {
  try {
    const q = req.body;
    if (!q.student_id || !q.school_id) {
      return res.status(400).json({ error: 'student_id and school_id required.' });
    }

    await query(`
      INSERT INTO student_quotients (
        student_id, school_id,
        iq_logic, iq_memory, iq_attention, iq_processing_speed, iq_total,
        eq_empathy, eq_communication, eq_emotional_balance, eq_confidence, eq_self_awareness, eq_total,
        sq_cooperation, sq_leadership, sq_social_awareness, sq_conflict_resolution, sq_total,
        total_sessions, total_raw_score, updated_at, synced_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW()
      )
      ON CONFLICT (student_id, school_id) DO UPDATE SET
        iq_logic               = EXCLUDED.iq_logic,
        iq_memory              = EXCLUDED.iq_memory,
        iq_attention           = EXCLUDED.iq_attention,
        iq_processing_speed    = EXCLUDED.iq_processing_speed,
        iq_total               = EXCLUDED.iq_total,
        eq_empathy             = EXCLUDED.eq_empathy,
        eq_communication       = EXCLUDED.eq_communication,
        eq_emotional_balance   = EXCLUDED.eq_emotional_balance,
        eq_confidence          = EXCLUDED.eq_confidence,
        eq_self_awareness      = EXCLUDED.eq_self_awareness,
        eq_total               = EXCLUDED.eq_total,
        sq_cooperation         = EXCLUDED.sq_cooperation,
        sq_leadership          = EXCLUDED.sq_leadership,
        sq_social_awareness    = EXCLUDED.sq_social_awareness,
        sq_conflict_resolution = EXCLUDED.sq_conflict_resolution,
        sq_total               = EXCLUDED.sq_total,
        total_sessions         = EXCLUDED.total_sessions,
        total_raw_score        = EXCLUDED.total_raw_score,
        updated_at             = EXCLUDED.updated_at,
        synced_at              = NOW()
    `, [
      q.student_id, q.school_id,
      q.iq_logic, q.iq_memory, q.iq_attention, q.iq_processing_speed, q.iq_total,
      q.eq_empathy, q.eq_communication, q.eq_emotional_balance, q.eq_confidence, q.eq_self_awareness, q.eq_total,
      q.sq_cooperation, q.sq_leadership, q.sq_social_awareness, q.sq_conflict_resolution, q.sq_total,
      q.total_sessions, q.total_raw_score, q.updated_at || new Date().toISOString()
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[sync/quotients]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /sync/bulk ───────────────────────────────────────────────────────────
// Electron pushes all historical sessions + quotients on first sync.
// Body: { school_id, sessions: [...], quotients: [...] }
router.post('/bulk', async (req, res) => {
  try {
    const { school_id, sessions = [], quotients = [] } = req.body;
    if (!school_id) return res.status(400).json({ error: 'school_id required.' });

    await transaction(async (client) => {
      for (const s of sessions) {
        await client.query(`
          INSERT INTO game_sessions
            (id, student_id, school_id, game_name, raw_score, completed,
             started_at, ended_at, duration_minutes, synced_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
          ON CONFLICT (id) DO NOTHING
        `, [
          s.id, s.student_id, school_id, s.game_name,
          s.raw_score, s.completed,
          s.started_at, s.ended_at, s.duration_minutes
        ]);
      }

      for (const q of quotients) {
        await client.query(`
          INSERT INTO student_quotients (
            student_id, school_id,
            iq_logic, iq_memory, iq_attention, iq_processing_speed, iq_total,
            eq_empathy, eq_communication, eq_emotional_balance, eq_confidence,
            eq_self_awareness, eq_total,
            sq_cooperation, sq_leadership, sq_social_awareness, sq_conflict_resolution, sq_total,
            total_sessions, total_raw_score, updated_at, synced_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
          ON CONFLICT (student_id, school_id) DO UPDATE SET
            iq_total  = EXCLUDED.iq_total,
            eq_total  = EXCLUDED.eq_total,
            sq_total  = EXCLUDED.sq_total,
            synced_at = NOW()
        `, [
          q.student_id, school_id,
          q.iq_logic, q.iq_memory, q.iq_attention, q.iq_processing_speed, q.iq_total,
          q.eq_empathy, q.eq_communication, q.eq_emotional_balance, q.eq_confidence,
          q.eq_self_awareness, q.eq_total,
          q.sq_cooperation, q.sq_leadership, q.sq_social_awareness, q.sq_conflict_resolution, q.sq_total,
          q.total_sessions, q.total_raw_score, q.updated_at || new Date().toISOString()
        ]);
      }
    });

    await query(
      `INSERT INTO sync_log (school_id, event_type, record_count) VALUES ($1, 'bulk', $2)`,
      [school_id, sessions.length + quotients.length]
    );

    return res.json({ ok: true, sessions: sessions.length, quotients: quotients.length });
  } catch (err) {
    console.error('[sync/bulk]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
