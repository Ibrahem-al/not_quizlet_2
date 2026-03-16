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
} from 'lucide-react';
import type { FolderColor } from '@/types';
import { useFolderStore } from '@/stores/useFolderStore';
import { useSetStore } from '@/stores/useSetStore';
import PageTransition from '@/components/layout/PageTransition';
import SetCard from '@/components/SetCard';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn, generateId, FOLDER_COLORS } from '@/lib/utils';

const COLOR_KEYS = Object.keys(FOLDER_COLORS) as FolderColor[];

function FolderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { folders, updateFolder, removeFolder } = useFolderStore();
  const { sets, addSet, removeSet } = useSetStore();

  const folder = folders.find((f) => f.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (folder) {
      setEditName(folder.name);
      setEditDescription(folder.description);
    }
  }, [folder]);

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
    await removeFolder(folder.id);
    navigate('/');
  }, [folder, removeFolder, navigate]);

  const handleNewSet = useCallback(async () => {
    if (!id) return;
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

  const handleDeleteSet = useCallback(
    async (setId: string) => {
      await removeSet(setId);
    },
    [removeSet],
  );

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
            </div>
          )}
        </div>

        {/* Search + New Set */}
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
          <Button onClick={handleNewSet} icon={<Plus size={16} />}>
            New Set
          </Button>
        </div>

        {/* Set Grid */}
        {filteredSets.length > 0 ? (
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
        ) : (
          <div className="text-center py-16">
            <p
              className="text-sm"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {searchQuery
                ? 'No sets match your search.'
                : 'This folder is empty. Create a new set to get started.'}
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
          onClose={() => setShowDeleteModal(false)}
          title="Delete Folder"
          danger
          size="sm"
        >
          <p
            className="text-sm mb-4"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Are you sure you want to delete &quot;{folder.name}&quot;? Sets inside this
            folder will not be deleted but will be unassigned.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteModal(false)}
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
