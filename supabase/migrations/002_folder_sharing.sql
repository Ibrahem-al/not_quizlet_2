-- ============================================================
-- Folder Sharing: add share_token to folders
-- Mirrors the set sharing pattern from 001_initial_schema.sql
-- ============================================================

-- Add share_token column
ALTER TABLE folders ADD COLUMN share_token UUID UNIQUE DEFAULT NULL;

-- Partial index for fast token lookups
CREATE INDEX idx_folders_share ON folders (share_token) WHERE share_token IS NOT NULL;

-- Allow anyone to SELECT shared folders (token is unguessable UUID)
CREATE POLICY "shared_folder_select" ON folders FOR SELECT
  USING (share_token IS NOT NULL);

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
