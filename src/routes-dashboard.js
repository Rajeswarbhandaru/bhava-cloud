'use strict';

/**
 * routes-dashboard.js
 * Teacher-facing API endpoints. All require valid JWT (requireAuth).
 * Teacher can only see their assigned class/section/school.
 */

const express = require('express');
const { query } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

function round1(v) {
  if (v === null || v === undefined) return null;
  return Math.round(Number(v) * 10) / 10;
}

// ── GET /dashboard/me ─────────────────────────────────────────────────────────
// Returns the logged-in teacher's profile and assigned class.
router.get('/me', (req, res) => {
  res.json({
    teacher_id: req.teacher.teacher_id,
    name:       req.teacher.name,
    email:      req.teacher.email,
    school_id:  req.teacher.school_id,
    class:      req.teacher.class,
    section:    req.teacher.section,
  });
});

// ── GET /dashboard/class ──────────────────────────────────────────────────────
// Class-level snapshot (averages + breakdowns). Teacher sees only their class.
router.get('/class', async (req, res) => {
  try {
    const { school_id, class: cls, section } = req.teacher;

    const countRes = await query(
      `SELECT COUNT(*) AS cnt FROM students WHERE school_id=$1 AND class=$2 AND section=$3 AND is_active=TRUE`,
      [school_id, cls, section]
    );
    const studentCount = parseInt(countRes.rows[0]?.cnt || 0);

    const aggRes = await query(`
      SELECT
        AVG(q.iq_total)               AS avg_iq,
        AVG(q.eq_total)               AS avg_eq,
        AVG(q.sq_total)               AS avg_sq,
        AVG((q.iq_total+q.eq_total+q.sq_total)/3) AS avg_total,
        AVG(q.iq_logic)               AS avg_iq_logic,
        AVG(q.iq_memory)              AS avg_iq_memory,
        AVG(q.iq_attention)           AS avg_iq_attention,
        AVG(q.iq_processing_speed)    AS avg_iq_processing_speed,
        AVG(q.eq_empathy)             AS avg_eq_empathy,
        AVG(q.eq_communication)       AS avg_eq_communication,
        AVG(q.eq_emotional_balance)   AS avg_eq_emotional_balance,
        AVG(q.eq_confidence)          AS avg_eq_confidence,
        AVG(q.eq_self_awareness)      AS avg_eq_self_awareness,
        AVG(q.sq_cooperation)         AS avg_sq_cooperation,
        AVG(q.sq_leadership)          AS avg_sq_leadership,
        AVG(q.sq_social_awareness)    AS avg_sq_social_awareness,
        AVG(q.sq_conflict_resolution) AS avg_sq_conflict_resolution
      FROM student_quotients q
      INNER JOIN students s ON s.id = q.student_id AND s.school_id = q.school_id
      WHERE s.school_id=$1 AND s.class=$2 AND s.section=$3 AND s.is_active=TRUE
    `, [school_id, cls, section]);

    const a = aggRes.rows[0] || {};
    return res.json({
      class: cls, section, student_count: studentCount,
      avg_iq:    round1(a.avg_iq),
      avg_eq:    round1(a.avg_eq),
      avg_sq:    round1(a.avg_sq),
      avg_total: round1(a.avg_total),
      iq_breakdown: {
        logic:            round1(a.avg_iq_logic),
        memory:           round1(a.avg_iq_memory),
        attention:        round1(a.avg_iq_attention),
        processing_speed: round1(a.avg_iq_processing_speed),
      },
      eq_breakdown: {
        empathy:           round1(a.avg_eq_empathy),
        communication:     round1(a.avg_eq_communication),
        emotional_balance: round1(a.avg_eq_emotional_balance),
        confidence:        round1(a.avg_eq_confidence),
        self_awareness:    round1(a.avg_eq_self_awareness),
      },
      sq_breakdown: {
        cooperation:         round1(a.avg_sq_cooperation),
        leadership:          round1(a.avg_sq_leadership),
        social_awareness:    round1(a.avg_sq_social_awareness),
        conflict_resolution: round1(a.avg_sq_conflict_resolution),
      },
    });
  } catch (err) {
    console.error('[dashboard/class]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /dashboard/students ───────────────────────────────────────────────────
// All students in teacher's class with full quotient data.
router.get('/students', async (req, res) => {
  try {
    const { school_id, class: cls, section } = req.teacher;

    const { rows } = await query(`
      SELECT
        s.id, s.roll_no, s.name, s.class, s.section,
        q.iq_total, q.eq_total, q.sq_total,
        q.iq_logic, q.iq_memory, q.iq_attention, q.iq_processing_speed,
        q.eq_empathy, q.eq_communication, q.eq_emotional_balance, q.eq_confidence, q.eq_self_awareness,
        q.sq_cooperation, q.sq_leadership, q.sq_social_awareness, q.sq_conflict_resolution,
        q.total_sessions, q.updated_at
      FROM students s
      LEFT JOIN student_quotients q ON q.student_id = s.id AND q.school_id = s.school_id
      WHERE s.school_id=$1 AND s.class=$2 AND s.section=$3 AND s.is_active=TRUE
      ORDER BY s.roll_no
    `, [school_id, cls, section]);

    return res.json(rows);
  } catch (err) {
    console.error('[dashboard/students]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /dashboard/sessions/:studentId ───────────────────────────────────────
// Last 10 sessions for a student — teacher can only access students in their class.
router.get('/sessions/:studentId', async (req, res) => {
  try {
    const { school_id, class: cls, section } = req.teacher;
    const studentId = parseInt(req.params.studentId);

    // Verify student belongs to teacher's class
    const check = await query(
      `SELECT id FROM students WHERE id=$1 AND school_id=$2 AND class=$3 AND section=$4`,
      [studentId, school_id, cls, section]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Student not in your class.' });
    }

    const { rows } = await query(`
      SELECT id, game_name, raw_score, completed, started_at, duration_minutes
      FROM game_sessions
      WHERE student_id=$1 AND school_id=$2
      ORDER BY started_at DESC
      LIMIT 10
    `, [studentId, school_id]);

    return res.json(rows);
  } catch (err) {
    console.error('[dashboard/sessions]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
