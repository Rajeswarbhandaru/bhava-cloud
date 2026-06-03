-- ─────────────────────────────────────────────────────────────────────────────
-- Bhāva Tech — Cloud Database Schema
-- Run once on Railway PostgreSQL to initialize all tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Schools
CREATE TABLE IF NOT EXISTS schools (
  id          TEXT PRIMARY KEY,   -- e.g. 'BHAVA-SVN-001'
  name        TEXT NOT NULL,
  city        TEXT,
  state       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Teachers
CREATE TABLE IF NOT EXISTS teachers (
  id            SERIAL PRIMARY KEY,
  google_email  TEXT UNIQUE NOT NULL,  -- Google OAuth email
  name          TEXT NOT NULL,
  school_id     TEXT REFERENCES schools(id),
  class         TEXT,                  -- assigned class e.g. '7'
  section       TEXT,                  -- assigned section e.g. 'A'
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Students (synced from Electron SQLite)
CREATE TABLE IF NOT EXISTS students (
  id          INTEGER,              -- same id as local SQLite
  school_id   TEXT,
  roll_no     TEXT,
  name        TEXT NOT NULL,
  class       TEXT,
  section     TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, school_id)
);

-- Game sessions (synced from Electron)
CREATE TABLE IF NOT EXISTS game_sessions (
  id                TEXT PRIMARY KEY,  -- UUID from local
  student_id        INTEGER NOT NULL,
  school_id         TEXT NOT NULL,
  game_name         TEXT,
  raw_score         REAL,
  completed         BOOLEAN DEFAULT FALSE,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  duration_minutes  REAL,
  synced_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Student quotients (synced from Electron — latest values)
CREATE TABLE IF NOT EXISTS student_quotients (
  student_id              INTEGER,
  school_id               TEXT,
  iq_logic                REAL,
  iq_memory               REAL,
  iq_attention            REAL,
  iq_processing_speed     REAL,
  iq_total                REAL,
  eq_empathy              REAL,
  eq_communication        REAL,
  eq_emotional_balance    REAL,
  eq_confidence           REAL,
  eq_self_awareness       REAL,
  eq_total                REAL,
  sq_cooperation          REAL,
  sq_leadership           REAL,
  sq_social_awareness     REAL,
  sq_conflict_resolution  REAL,
  sq_total                REAL,
  total_sessions          INTEGER,
  total_raw_score         REAL,
  updated_at              TIMESTAMPTZ,
  synced_at               TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, school_id)
);

-- Sync log (track what was pushed from each Electron machine)
CREATE TABLE IF NOT EXISTS sync_log (
  id          SERIAL PRIMARY KEY,
  school_id   TEXT,
  event_type  TEXT,   -- 'session' | 'quotients' | 'students'
  record_count INTEGER,
  synced_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default school (matches your local DB)
INSERT INTO schools (id, name, city, state)
VALUES ('BHAVA-SVN-001', 'Bhāva Demo School', 'Guntur', 'Andhra Pradesh')
ON CONFLICT (id) DO NOTHING;
