import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Plus,
  Search,
  ChevronRight,
  Palette,
  Folder,
  FolderPlus,
  Share2,
  Link2Off,
  Copy,
  Loader2,
} from 'lucide-react';
import type { FolderColor } from '@/types';
import { useFolderStore } from '@/stores/useFolderStore';
import { useSetStore } from '@/stores/useSetStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  generateFolderShareToken,
  getFolderShareLinkErrorMessage,
  removeFolderShareToken,
  syncFolderTreeToCloud,
} from '@/lib/cloudSync';
import { useToastStore } from '@/stores/useToastStore';
import PageTransition from '@/components/layout/PageTransition';
import SetCard from '@/components/SetCard';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn, generateId, FOLDER_COLORS } from '@/lib/utils';

const COLOR_KEYS = Object.keys(FOLDER_COLORS) as FolderColor[];

function FolderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { folders, updateFolder, removeFolder, addFolder, getDescendantIds } = useFolderStore();
  const { sets, addSet, updateSet, removeSet } = useSetStore();
  const user = useAuthStore((s) => s.user);
  const addToast = useToastStore((s) => s.addToast);

  const folder = folders.find((f) => f.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteWithSets, setDeleteWithSets] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewSubfolder, setShowNewSubfolder] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState('');
  const [newSubfolderColor, setNewSubfolderColor] = useState<FolderColor>('blue');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (folder) {
      setEditName(folder.name);
      setEditDescription(folder.description);
    }
  }, [folder]);

  const childFolders = useMemo(() => {
    if (!id) return [];
    return folders.filter((f) => f.parentFolderId === id).sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, id]);

  const folderSets = useMemo(() => {
    if (!id) return [];
    return sets.filter((s) => s.folderId === id);
  }, [sets, id]);

  const filteredSets = useMemo(() => {
    if (!searchQuery.trim()) return folderSets;
    const q = searchQuery.toLowerCase();
    return folderSets.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [folderSets, searchQuery]);

  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return childFolders;
    const q = searchQuery.toLowerCase();
    return childFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [childFolders, searchQuery]);

  const handleSaveEdit = useCallback(async () => {
    if (!folder) return;
    const trimmed = editName.trim();
    if (!trimmed) return;

    await updateFolder({
      ...folder,
      name: trimmed,
      description: editDescription.trim(),
      updatedAt: Date.now(),
    });
    setIsEditing(false);
  }, [folder, editName, editDescription, updateFolder]);

  const handleChangeColor = useCallback(
    async (color: FolderColor) => {
      if (!folder) return;
      await updateFolder({
        ...folder,
        color,
        updatedAt: Date.now(),
      });
      setShowColorPicker(false);
    },
    [folder, updateFolder],
  );

  const handleDelete = useCallback(async () => {
    if (!folder) return;

    const parentId = folder.parentFolderId ?? undefined;

    if (deleteWithSets) {
      // Delete all sets in this folder and all descendant folders
      const allFolderIds = [folder.id, ...getDescendantIds(folder.id)];
      const setsToDelete = sets.filter((s) => s.folderId && allFolderIds.includes(s.folderId));
      for (const s of setsToDelete) {
        await removeSet(s.id);
      }
      // Delete all descendant folders
      const descIds = getDescendantIds(folder.id);
      for (const did of descIds) {
        await removeFolder(did);
      }
    } else {
      // Move sets up to parent folder (or root)
      const setsInFolder = sets.filter((s) => s.folderId === folder.id);
      for (const s of setsInFolder) {
        await updateSet({ ...s, folderId: parentId, updatedAt: Date.now() });
      }
    }

    await removeFolder(folder.id);
    navigate(parentId ? `/folders/${parentId}` : '/');
  }, [folder, deleteWithSets, sets, removeSet, removeFolder, updateSet, navigate, getDescendantIds]);

  const handleNewSet = useCallback(async () => {
    if (!id) return;
    if (isSupabaseConfigured() && !useAuthStore.getState().user) {
      navigate('/signin', { state: { returnTo: `/folders/${id}` } });
      return;
    }
    const now = Date.now();
    const newSet = {
      id: generateId(),
      title: 'Untitled Set',
      description: '',
      createdAt: now,
      updatedAt: now,
      tags: [],
      cards: [],
      lastStudied: 0,
      studyStats: { totalSessions: 0, averageAccuracy: 0, streakDays: 0 },
      visibility: 'private' as const,
      folderId: id,
    };
    await addSet(newSet);
    navigate(`/sets/${newSet.id}`);
  }, [id, addSet, navigate]);

  const handleCreateSubfolder = useCallback(async () => {
    const trimmed = newSubfolderName.trim();
    if (!trimmed || !id) return;

    const now = Date.now();
    const newFolder = {
      id: generateId(),
      userId: '',
      name: trimmed,
      description: '',
      color: newSubfolderColor,
      parentFolderId: id,
      createdAt: now,
      updatedAt: now,
    };
    await addFolder(newFolder);
    setNewSubfolderName('');
    setNewSubfolderColor('blue');
    setShowNewSubfolder(false);
  }, [newSubfolderName, newSubfolderColor, id, addFolder]);

  const handleDeleteSet = useCallback(
    async (setId: string) => {
      await removeSet(setId);
    },
    [removeSet],
  );

  const shareUrl = folder?.shareToken
    ? `${window.location.origin}/shared/folder/${folder.shareToken}`
    : null;

  const handleShareToggle = useCallback(async () => {
    if (!folder) return;
    if (!isSupabaseConfigured()) {
      addToast('warning', 'Cloud features are not configured. Set up Supabase to share folders.');
      return;
    }
    if (!user) {
      addToast('warning', 'Sign in to share folders via link.');
      return;
    }
    setSharing(true);

    try {
      if (folder.shareToken) {
        await removeFolderShareToken(folder.id);
        await updateFolder({ ...folder, shareToken: undefined, updatedAt: Date.now() });
        addToast('info', 'Share link removed.');
      } else {
        await syncFolderTreeToCloud(
          folder.id,
          folders.map((f) => ({ ...f, userId: user.id })),
          sets.map((s) => ({ ...s, userId: user.id })),
        );
        const token = await generateFolderShareToken({ ...folder, userId: user.id });
        await updateFolder({ ...folder, shareToken: token, updatedAt: Date.now() });
        const url = `${window.location.origin}/shared/folder/${token}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        addToast('success', 'Share link created and copied to clipboard!');
      }
    } catch (error) {
      addToast('error', getFolderShareLinkErrorMessage(error));
    } finally {
      setSharing(false);
    }
  }, [folder, user, folders, sets, updateFolder, addToast]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      addToast('success', 'Link copied to clipboard!');
    } catch {
      addToast('error', 'Failed to copy link.');
    }
  }, [shareUrl, addToast]);

  // Breadcrumb: find parent chain
  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string; name: string }[] = [];
    let current = folder;
    while (current) {
      crumbs.unshift({ id: current.id, name: current.name });
      current = folders.find((f) => f.id === current?.parentFolderId);
    }
    return crumbs;
  }, [folder, folders]);

  if (!folder) {
    return (
      <PageTransition>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p style={{ color: 'var(--color-text-tertiary)' }}>Folder not found.</p>
          <Button variant="ghost" onClick={() => navigate('/')} className="mt-4">
            <ArrowLeft size={16} />
            Back to Home
          </Button>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm mb-4">
          <Link
            to="/"
            className="transition-colors"
            style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
            }}
          >
            Home
          </Link>
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
              {i === breadcrumbs.length - 1 ? (
                <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>
                  {crumb.name}
                </span>
              ) : (
                <Link
                  to={`/folders/${crumb.id}`}
                  className="transition-colors"
                  style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-tertiary)';
                  }}
                >
                  {crumb.name}
                </Link>
              )}
            </span>
          ))}
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: FOLDER_COLORS[folder.color] }}
            />
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                  className="text-2xl font-bold h-10 px-2"
                  style={{
                    color: 'var(--color-text)',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                  }}
                />
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="text-sm h-8 px-2"
                  style={{
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                  }}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit}>
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <h1
                  className="text-2xl font-bold truncate"
                  style={{ color: 'var(--color-text)' }}
                >
                  {folder.name}
                </h1>
                {folder.description && (
                  <p
                    className="text-sm mt-1"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {folder.description}
                  </p>
                )}
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(true)}
                icon={<Edit3 size={16} />}
              >
                {''}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowColorPicker(true)}
                icon={<Palette size={16} />}
              >
                {''}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteModal(true)}
                icon={<Trash2 size={16} />}
              >
                {''}
              </Button>
              <Button
                variant={folder.shareToken ? 'secondary' : 'ghost'}
                size="sm"
                icon={sharing ? <Loader2 size={16} className="animate-spin" /> : folder.shareToken ? <Link2Off size={16} /> : <Share2 size={16} />}
                onClick={handleShareToggle}
                disabled={sharing}
              >
                {folder.shareToken ? 'Stop Sharing' : 'Share'}
              </Button>
              {shareUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyShareLink}
                  icon={<Copy size={16} />}
                >
                  {''}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Share URL banner */}
        {shareUrl && (
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-lg mb-4 text-sm"
            style={{
              background: 'var(--color-primary-light)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)',
            }}
          >
            <Share2 size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{shareUrl}</span>
            <button
              onClick={handleCopyShareLink}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-pointer flex-shrink-0"
              style={{
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Copy size={12} /> Copy
            </button>
          </div>
        )}

        {/* Search + New Set + New Subfolder */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-tertiary)' }}
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in this folder..."
              className="w-full h-10 pl-10 pr-3 text-sm"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-sans)',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--color-primary)';
                e.target.style.boxShadow = 'var(--shadow-focus)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--color-border)';
                e.target.style.boxShadow = '';
              }}
            />
          </div>
          <Button onClick={() => setShowNewSubfolder(true)} variant="outline" icon={<FolderPlus size={16} />}>
            Subfolder
          </Button>
          <Button onClick={handleNewSet} icon={<Plus size={16} />}>
            New Set
          </Button>
        </div>

        {/* New Subfolder inline form */}
        {showNewSubfolder && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="rounded-xl p-4 mb-6"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            <div className="flex items-center gap-3">
              <input
                autoFocus
                value={newSubfolderName}
                onChange={(e) => setNewSubfolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubfolder();
                  if (e.key === 'Escape') { setShowNewSubfolder(false); setNewSubfolderName(''); }
                }}
                placeholder="Subfolder name"
                className="flex-1 h-9 px-3 text-sm"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                }}
              />
              <div className="flex gap-1.5">
                {COLOR_KEYS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewSubfolderColor(color)}
                    className="w-5 h-5 rounded-full cursor-pointer"
                    style={{
                      background: FOLDER_COLORS[color],
                      border: 'none',
                      outline: newSubfolderColor === color ? '2px solid var(--color-text)' : 'none',
                      outlineOffset: 2,
                      transform: newSubfolderColor === color ? 'scale(1.15)' : 'scale(1)',
                    }}
                    aria-label={color}
                  />
                ))}
              </div>
              <Button size="sm" onClick={handleCreateSubfolder}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowNewSubfolder(false); setNewSubfolderName(''); }}>Cancel</Button>
            </div>
          </motion.div>
        )}

        {/* Subfolders */}
        {filteredFolders.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
              Subfolders
            </p>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
            >
              {filteredFolders.map((child) => {
                const childSetCount = sets.filter((s) => s.folderId === child.id).length;
                const childSubfolderCount = folders.filter((f) => f.parentFolderId === child.id).length;
                return (
                  <motion.div
                    key={child.id}
                    whileHover={{ y: -2 }}
                    onClick={() => navigate(`/folders/${child.id}`)}
                    className="flex items-center gap-3 p-4 rounded-xl cursor-pointer"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    <Folder size={20} style={{ color: FOLDER_COLORS[child.color], flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                        {child.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {childSetCount} set{childSetCount !== 1 ? 's' : ''}
                        {childSubfolderCount > 0 && `, ${childSubfolderCount} folder${childSubfolderCount !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sets */}
        {filteredSets.length > 0 && (
          <div>
            {filteredFolders.length > 0 && (
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
                Sets
              </p>
            )}
            <motion.div
              className="grid gap-4"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              }}
            >
              {filteredSets.map((set) => (
                <SetCard key={set.id} set={set} onDelete={handleDeleteSet} />
              ))}
            </motion.div>
          </div>
        )}

        {filteredSets.length === 0 && filteredFolders.length === 0 && (
          <div className="text-center py-16">
            <p
              className="text-sm"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {searchQuery
                ? 'No items match your search.'
                : 'This folder is empty. Create a new set or subfolder to get started.'}
            </p>
          </div>
        )}

        {/* Color Picker Modal */}
        <Modal
          isOpen={showColorPicker}
          onClose={() => setShowColorPicker(false)}
          title="Change Color"
          size="sm"
        >
          <div className="flex flex-wrap gap-3 justify-center py-2">
            {COLOR_KEYS.map((color) => (
              <button
                key={color}
                onClick={() => handleChangeColor(color)}
                className={cn(
                  'w-8 h-8 rounded-full cursor-pointer transition-transform',
                )}
                style={{
                  background: FOLDER_COLORS[color],
                  border: 'none',
                  outline: folder.color === color ? '2px solid var(--color-text)' : 'none',
                  outlineOffset: 3,
                  transform: folder.color === color ? 'scale(1.15)' : 'scale(1)',
                }}
                aria-label={color}
              />
            ))}
          </div>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => { setShowDeleteModal(false); setDeleteWithSets(false); }}
          title="Delete Folder"
          danger
          size="sm"
        >
          <p
            className="text-sm mb-4"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Are you sure you want to delete &quot;{folder.name}&quot;?
          </p>

          {/* Delete options */}
          <div className="flex flex-col gap-2 mb-4">
            <label
              className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
              style={{
                background: !deleteWithSets ? 'var(--color-primary-light)' : 'var(--color-surface)',
                border: `2px solid ${!deleteWithSets ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <input
                type="radio"
                name="deleteOption"
                checked={!deleteWithSets}
                onChange={() => setDeleteWithSets(false)}
                style={{ accentColor: 'var(--color-primary)', marginTop: 2 }}
              />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Keep sets
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  Sets will be moved to {folder.parentFolderId ? 'the parent folder' : 'the root level'}. Subfolders will also be moved up.
                </p>
              </div>
            </label>
            <label
              className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
              style={{
                background: deleteWithSets ? 'var(--color-danger-light)' : 'var(--color-surface)',
                border: `2px solid ${deleteWithSets ? 'var(--color-danger)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <input
                type="radio"
                name="deleteOption"
                checked={deleteWithSets}
                onChange={() => setDeleteWithSets(true)}
                style={{ accentColor: 'var(--color-danger)', marginTop: 2 }}
              />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Delete everything
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  All sets and subfolders inside will be permanently deleted.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setShowDeleteModal(false); setDeleteWithSets(false); }}
            >
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}

export default FolderDetailPage;
