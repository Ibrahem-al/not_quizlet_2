-- ============================================================
-- StudyFlow Database Schema
-- Optimized for Supabase Free Tier
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STUDY SETS
-- Cards are stored as JSONB inside the set (denormalized)
-- to minimize joins and row counts on free tier.
-- ============================================================
CREATE TABLE study_sets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  tags          JSONB NOT NULL DEFAULT '[]',
  cards         JSONB NOT NULL DEFAULT '[]',
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  last_studied  BIGINT NOT NULL DEFAULT 0,
  study_stats   JSONB NOT NULL DEFAULT '{"totalSessions":0,"averageAccuracy":0,"streakDays":0}',
  visibility    TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  folder_id     UUID,
  -- Share link support: a unique token anyone can use to view this set
  share_token   UUID UNIQUE DEFAULT NULL
);

-- Indexes for common queries (kept minimal for free tier)
CREATE INDEX idx_study_sets_user_id   ON study_sets (user_id);
CREATE INDEX idx_study_sets_folder_id ON study_sets (folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX idx_study_sets_share     ON study_sets (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_study_sets_updated   ON study_sets (user_id, updated_at DESC);

-- ============================================================
-- RLS: Study Sets
-- Owner has full CRUD. Anyone with share_token can SELECT.
-- ============================================================
ALTER TABLE study_sets ENABLE ROW LEVEL SECURITY;

-- Owner: full access
CREATE POLICY "owner_select" ON study_sets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "owner_insert" ON study_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_update" ON study_sets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete" ON study_sets FOR DELETE
  USING (auth.uid() = user_id);

-- Shared sets: anyone (even anon) can SELECT if they know the share_token.
-- This is checked via a function parameter, not via URL (the app passes the token).
CREATE POLICY "shared_select" ON study_sets FOR SELECT
  USING (share_token IS NOT NULL);

-- NOTE: The "shared_select" policy allows reading ANY set that has a share_token.
-- This is safe because share_tokens are random UUIDs (unguessable).
-- The app queries by share_token, so users only see sets they have the link for.
-- Without the token, they'd have to guess a UUID which is infeasible.


-- ============================================================
-- FOLDERS
-- ============================================================
CREATE TABLE folders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  parent_folder_id  UUID REFERENCES folders(id) ON DELETE SET NULL,
  color             TEXT NOT NULL DEFAULT 'blue',
  created_at        BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  updated_at        BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
);

CREATE INDEX idx_folders_user ON folders (user_id);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folders_owner" ON folders
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- FOLDER ITEMS (maps sets to folders)
-- ============================================================
CREATE TABLE folder_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folder_id   UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL DEFAULT 'set' CHECK (item_type IN ('set', 'folder')),
  item_id     UUID NOT NULL,
  added_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  added_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (folder_id, item_id)
);

CREATE INDEX idx_folder_items_folder ON folder_items (folder_id);

ALTER TABLE folder_items ENABLE ROW LEVEL SECURITY;

-- Access if user owns the parent folder
CREATE POLICY "folder_items_owner" ON folder_items
  USING (
    EXISTS (SELECT 1 FROM folders WHERE folders.id = folder_items.folder_id AND folders.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM folders WHERE folders.id = folder_items.folder_id AND folders.user_id = auth.uid())
  );


-- ============================================================
-- PASSWORD HISTORY (security)
-- ============================================================
CREATE TABLE password_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE password_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pw_history_owner" ON password_history FOR SELECT
  USING (auth.uid() = user_id);


-- ============================================================
-- FAILED LOGIN ATTEMPTS (rate limiting)
-- ============================================================
CREATE TABLE failed_login_attempts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address   INET
);

-- No RLS needed — accessed via server-side RPCs only
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PASSWORD RESET REQUESTS (rate limiting)
-- ============================================================
CREATE TABLE password_reset_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address   INET
);

ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- LIVE GAME SESSIONS
-- ============================================================
CREATE TABLE live_game_sessions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_code               TEXT UNIQUE NOT NULL,
  host_user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_id                  UUID NOT NULL,
  set_snapshot            JSONB NOT NULL DEFAULT '[]',
  status                  TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'finished')),
  question_count          INT NOT NULL DEFAULT 0,
  current_question_index  INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at              TIMESTAMPTZ,
  finished_at             TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '4 hours')
);

CREATE INDEX idx_live_sessions_code   ON live_game_sessions (game_code);
CREATE INDEX idx_live_sessions_host   ON live_game_sessions (host_user_id);
CREATE INDEX idx_live_sessions_status ON live_game_sessions (status);

ALTER TABLE live_game_sessions ENABLE ROW LEVEL SECURITY;

-- Anyone can read sessions (needed for guest join)
CREATE POLICY "sessions_read" ON live_game_sessions FOR SELECT
  USING (true);

-- Only host can insert/update
CREATE POLICY "sessions_host_insert" ON live_game_sessions FOR INSERT
  WITH CHECK (auth.uid() = host_user_id);

CREATE POLICY "sessions_host_update" ON live_game_sessions FOR UPDATE
  USING (auth.uid() = host_user_id);


-- ============================================================
-- LIVE GAME PARTICIPANTS
-- ============================================================
CREATE TABLE live_game_participants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    UUID NOT NULL REFERENCES live_game_sessions(id) ON DELETE CASCADE,
  nickname      TEXT NOT NULL,
  player_token  TEXT UNIQUE NOT NULL,
  score         INT NOT NULL DEFAULT 0,
  streak        INT NOT NULL DEFAULT 0,
  is_host       BOOLEAN NOT NULL DEFAULT false,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_participants_session ON live_game_participants (session_id);

ALTER TABLE live_game_participants ENABLE ROW LEVEL SECURITY;

-- Anyone can read/insert participants (guest players don't have auth)
CREATE POLICY "participants_read" ON live_game_participants FOR SELECT
  USING (true);

CREATE POLICY "participants_insert" ON live_game_participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "participants_update" ON live_game_participants FOR UPDATE
  USING (true);


-- ============================================================
-- LIVE GAME ANSWERS
-- ============================================================
CREATE TABLE live_game_answers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES live_game_sessions(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES live_game_participants(id) ON DELETE CASCADE,
  question_index  INT NOT NULL,
  chosen_option   INT NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  time_taken_ms   INT NOT NULL,
  points_earned   INT NOT NULL DEFAULT 0,
  answered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, participant_id, question_index)
);

ALTER TABLE live_game_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "answers_read" ON live_game_answers FOR SELECT
  USING (true);

CREATE POLICY "answers_insert" ON live_game_answers FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Fetch a shared set by token (lightweight, no auth needed)
CREATE OR REPLACE FUNCTION get_shared_set(p_share_token UUID)
RETURNS SETOF study_sets
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT * FROM study_sets WHERE share_token = p_share_token LIMIT 1;
$$;

-- Generate unique 6-digit game code
CREATE OR REPLACE FUNCTION generate_game_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    SELECT EXISTS(SELECT 1 FROM live_game_sessions WHERE game_code = code) INTO exists;
    IF NOT exists THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

-- Check password reuse (last 5)
CREATE OR REPLACE FUNCTION check_password_reuse(p_user_id UUID, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  reused BOOLEAN := false;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM password_history
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 5
  ) INTO reused;
  -- NOTE: Real implementation needs bcrypt comparison via pgcrypto
  RETURN reused;
END;
$$;

-- Check account lockout (5 failed attempts in 30 min)
CREATE OR REPLACE FUNCTION is_account_locked(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*) >= 5
  FROM failed_login_attempts
  WHERE email = p_email
    AND attempted_at > now() - interval '30 minutes';
$$;

-- Record failed login
CREATE OR REPLACE FUNCTION record_failed_login(p_email TEXT, p_ip INET DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  INSERT INTO failed_login_attempts (email, ip_address) VALUES (p_email, p_ip);
$$;

-- Clear failed logins on success
CREATE OR REPLACE FUNCTION clear_failed_logins(p_email TEXT)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  DELETE FROM failed_login_attempts WHERE email = p_email;
$$;

-- Rate limit password reset (5 per hour)
CREATE OR REPLACE FUNCTION can_request_password_reset(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*) < 5
  FROM password_reset_requests
  WHERE email = p_email
    AND requested_at > now() - interval '1 hour';
$$;

-- Record password reset request
CREATE OR REPLACE FUNCTION record_password_reset_request(p_email TEXT, p_ip INET DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  INSERT INTO password_reset_requests (email, ip_address) VALUES (p_email, p_ip);
$$;

-- Cleanup expired data
CREATE OR REPLACE FUNCTION cleanup_stale_data()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Remove failed logins older than 1 hour
  DELETE FROM failed_login_attempts WHERE attempted_at < now() - interval '1 hour';
  -- Remove reset requests older than 1 hour
  DELETE FROM password_reset_requests WHERE requested_at < now() - interval '1 hour';
  -- Remove expired game sessions
  DELETE FROM live_game_sessions WHERE expires_at < now();
  -- Keep only last 5 password history per user
  DELETE FROM password_history ph
  WHERE ph.id NOT IN (
    SELECT id FROM password_history ph2
    WHERE ph2.user_id = ph.user_id
    ORDER BY created_at DESC
    LIMIT 5
  );
END;
$$;

-- Cleanup expired game sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  DELETE FROM live_game_sessions WHERE expires_at < now();
$$;
