-- ============================================================
-- 005 — Security hardening
-- Fixes: H11, H12, M17, M18, L26 (see BUG_REPORT.md)
--
-- Idempotent: uses DROP POLICY IF EXISTS / CREATE OR REPLACE /
-- CREATE EXTENSION IF NOT EXISTS / REVOKE (no-op if not granted).
-- Depends on 001_initial_schema.sql and 002_folder_sharing.sql
-- having already been applied (the objects altered below are
-- defined there).
-- ============================================================


-- ============================================================
-- H11 — Stop anon from enumerating every shared set + harvesting
--        every share_token.
--
-- The table-level "shared_select" policy (001:59) granted SELECT on
-- ANY row where share_token IS NOT NULL, WITHOUT requiring the caller
-- to know a specific token. With the public anon key, that let anyone
-- list all shared sets and read the secret share_token / user_id
-- columns in bulk. A row policy cannot express "only if you already
-- know this token", so it must be dropped entirely.
--
-- Shared sets are now served ONLY through the token-filtered
-- SECURITY DEFINER RPC get_shared_set(p_share_token) (defined in 001,
-- hardened below in M18).
--
-- APP FOLLOW-UP (tracked separately, code change): the direct-query
-- fallback in fetchSharedSet (src/lib/cloudSync.ts ~715) must be
-- removed — with this policy gone, that fallback returns nothing for
-- anon and only the get_shared_set RPC path works.
-- ============================================================
DROP POLICY IF EXISTS "shared_select" ON study_sets;


-- ============================================================
-- H12 — Same enumeration flaw for shared FOLDERS.
--
-- Drop the three table-level "USING (share_token IS NOT NULL)" style
-- policies added in 002:
--   * shared_folder_select           (folders)
--   * shared_folder_children_select  (folders)
--   * shared_folder_sets_select      (study_sets)
-- Together they let any anon list every shared folder (names +
-- share_token column) and then walk the child-folder / contained-set
-- policies to traverse the whole shared subtree — all without knowing
-- a token.
--
-- Shared folders are now served ONLY through the existing token-filtered
-- SECURITY DEFINER RPCs (all defined in 002, already SET search_path):
--   * get_shared_folder(p_share_token)
--   * get_shared_folder_subfolders(p_share_token)
--   * get_shared_folder_sets(p_share_token)
-- ============================================================
DROP POLICY IF EXISTS "shared_folder_select" ON folders;
DROP POLICY IF EXISTS "shared_folder_children_select" ON folders;
DROP POLICY IF EXISTS "shared_folder_sets_select" ON study_sets;


-- ============================================================
-- M17 — check_password_reuse now actually compares the supplied
--        password against the bcrypt hashes stored in password_history.
--
-- The 001 body ignored p_password entirely and only reported whether
-- ANY history row existed, so the "cannot reuse your last 5 passwords"
-- protection was a no-op. Rewrite it to bcrypt-compare via pgcrypto's
-- crypt(): for a stored bcrypt hash H, crypt(candidate, H) = H iff the
-- candidate matches. We check against the 5 most recent history rows.
--
-- search_path is pinned (fixes M18 for this function too) and includes
-- `extensions` so crypt() resolves whether pgcrypto is installed in
-- public (self-hosted default) or the `extensions` schema (Supabase).
--
-- APP FOLLOW-UP (tracked separately, code change): the app must
--   (a) INSERT a bcrypt hash of the new password into password_history
--       on every password change (e.g. crypt(new_pw, gen_salt('bf'))),
--       via a trusted/server context — password_history has no anon
--       INSERT path today, so this function stays inert until then; and
--   (b) call it with BOTH p_user_id and p_password and read the returned
--       SCALAR boolean (true = reuse detected) — the current callers omit
--       p_user_id and read a non-existent `.reused` field.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION check_password_reuse(p_user_id UUID, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  reused BOOLEAN := false;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM (
      SELECT password_hash
      FROM password_history
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      LIMIT 5
    ) recent
    WHERE recent.password_hash = crypt(p_password, recent.password_hash)
  ) INTO reused;
  RETURN reused;
END;
$$;


-- ============================================================
-- M18 — Pin a non-mutable search_path on every SECURITY DEFINER
--        function from migration 001.
--
-- Without an explicit SET search_path, name resolution inside these
-- elevated functions follows the CALLER's search_path (Supabase's
-- "Function Search Path Mutable" advisor). check_password_reuse is
-- pinned above via CREATE OR REPLACE; the rest are pinned in place.
-- (generate_game_code is intentionally excluded — it is not
-- SECURITY DEFINER.)
-- ============================================================
ALTER FUNCTION get_shared_set(UUID)                       SET search_path = public;
ALTER FUNCTION is_account_locked(TEXT)                    SET search_path = public;
ALTER FUNCTION record_failed_login(TEXT, INET)            SET search_path = public;
ALTER FUNCTION clear_failed_logins(TEXT)                  SET search_path = public;
ALTER FUNCTION can_request_password_reset(TEXT)           SET search_path = public;
ALTER FUNCTION record_password_reset_request(TEXT, INET)  SET search_path = public;
ALTER FUNCTION cleanup_stale_data()                       SET search_path = public;
ALTER FUNCTION cleanup_expired_sessions()                 SET search_path = public;


-- ============================================================
-- L26 — Revoke anon/public EXECUTE on the rate-limit writer RPCs.
--
-- record_failed_login and record_password_reset_request are
-- SECURITY DEFINER and INSERT RLS-bypassing rows keyed on an
-- arbitrary caller-supplied email. With the default PUBLIC EXECUTE
-- grant, an anonymous client could poison these rate-limit tables —
-- forcing account lockouts (DoS) or unbounded table growth. Revoke
-- EXECUTE so they cannot be invoked from an untrusted client.
--
-- APP FOLLOW-UP (tracked separately): failed-login / reset-request
-- accounting must be driven from a TRUSTED server context — an edge
-- function using the service_role key, keyed on IP + a server secret —
-- rather than called directly from the browser client.
-- ============================================================
REVOKE EXECUTE ON FUNCTION record_failed_login(TEXT, INET)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_password_reset_request(TEXT, INET) FROM PUBLIC, anon, authenticated;
