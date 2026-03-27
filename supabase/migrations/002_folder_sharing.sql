-- ============================================================
-- Folder Sharing: add share_token to folders
-- Mirrors the set sharing pattern from 001_initial_schema.sql
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS / OR REPLACE
-- ============================================================

-- Add share_token column (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'folders' AND column_name = 'share_token'
  ) THEN
    ALTER TABLE folders ADD COLUMN share_token UUID UNIQUE DEFAULT NULL;
  END IF;
END $$;

-- Partial index for fast token lookups (skip if already exists)
CREATE INDEX IF NOT EXISTS idx_folders_share ON folders (share_token) WHERE share_token IS NOT NULL;

-- ============================================================
-- RLS Policies for folders
-- ============================================================

-- Anyone can SELECT folders that have a share_token (root shared folders)
DROP POLICY IF EXISTS "shared_folder_select" ON folders;
CREATE POLICY "shared_folder_select" ON folders FOR SELECT
  USING (share_token IS NOT NULL);

-- Anyone can SELECT subfolders whose parent chain leads to a shared folder
-- Only applies to non-authenticated users (owners already have full access)
DROP POLICY IF EXISTS "shared_folder_children_select" ON folders;
CREATE POLICY "shared_folder_children_select" ON folders FOR SELECT
  USING (
    auth.uid() IS NULL
    AND parent_folder_id IS NOT NULL
    AND EXISTS (
      WITH RECURSIVE folder_tree AS (
        SELECT id FROM folders WHERE share_token IS NOT NULL
        UNION ALL
        SELECT f.id FROM folders f
        JOIN folder_tree ft ON f.parent_folder_id = ft.id
      )
      SELECT 1 FROM folder_tree WHERE id = folders.id
    )
  );

-- ============================================================
-- RLS Policies for study_sets (shared folder access)
-- ============================================================

-- Anyone can SELECT sets in a shared folder tree
-- Only applies to non-authenticated users (owners already have full access)
DROP POLICY IF EXISTS "shared_folder_sets_select" ON study_sets;
CREATE POLICY "shared_folder_sets_select" ON study_sets FOR SELECT
  USING (
    auth.uid() IS NULL
    AND folder_id IS NOT NULL
    AND EXISTS (
      WITH RECURSIVE folder_tree AS (
        SELECT id FROM folders WHERE share_token IS NOT NULL
        UNION ALL
        SELECT f.id FROM folders f
        JOIN folder_tree ft ON f.parent_folder_id = ft.id
      )
      SELECT 1 FROM folder_tree WHERE id = study_sets.folder_id
    )
  );

-- ============================================================
-- RPC: Fetch a shared folder by token
-- ============================================================
CREATE OR REPLACE FUNCTION get_shared_folder(p_share_token UUID)
RETURNS SETOF folders
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT * FROM folders WHERE share_token = p_share_token LIMIT 1;
$$;

-- ============================================================
-- RPC: Fetch all descendant subfolders of a shared folder
-- Uses recursive CTE to walk the folder tree
-- ============================================================
CREATE OR REPLACE FUNCTION get_shared_folder_subfolders(p_share_token UUID)
RETURNS SETOF folders
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH RECURSIVE folder_tree AS (
    SELECT * FROM folders WHERE share_token = p_share_token
    UNION ALL
    SELECT f.* FROM folders f
    JOIN folder_tree ft ON f.parent_folder_id = ft.id
  )
  SELECT * FROM folder_tree;
$$;

-- ============================================================
-- RPC: Fetch all sets within a shared folder tree
-- Returns every study_set whose folder_id is in the folder tree
-- ============================================================
CREATE OR REPLACE FUNCTION get_shared_folder_sets(p_share_token UUID)
RETURNS SETOF study_sets
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH RECURSIVE folder_tree AS (
    SELECT id FROM folders WHERE share_token = p_share_token
    UNION ALL
    SELECT f.id FROM folders f
    JOIN folder_tree ft ON f.parent_folder_id = ft.id
  )
  SELECT s.* FROM study_sets s
  WHERE s.folder_id IN (SELECT id FROM folder_tree);
$$;
