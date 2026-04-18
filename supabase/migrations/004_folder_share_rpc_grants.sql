-- ============================================================
-- Folder sharing RPC grants
-- Ensures anon/authenticated clients can execute the shared-folder
-- RPCs just like the shared-set RPC flow.
-- ============================================================

GRANT EXECUTE ON FUNCTION get_shared_folder(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_shared_folder_subfolders(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_shared_folder_sets(UUID) TO anon, authenticated;
