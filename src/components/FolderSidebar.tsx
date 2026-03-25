import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, ChevronRight, ChevronDown, Plus, Layers } from 'lucide-react';
import type { Folder as FolderType, FolderColor } from '@/types';
import { useFolderStore } from '@/stores/useFolderStore';
import { cn, generateId, FOLDER_COLORS } from '@/lib/utils';

const COLOR_KEYS = Object.keys(FOLDER_COLORS) as FolderColor[];

interface FolderNodeProps {
  folder: FolderType;
  folders: FolderType[];
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  depth: number;
}

function FolderNode({
  folder,
  folders,
  selectedFolderId,
  expandedIds,
  onSelect,
  onToggle,
  onOpen,
  depth,
}: FolderNodeProps) {
  const children = folders.filter((f) => f.parentFolderId === folder.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(folder.id);
          onOpen(folder.id);
          if (hasChildren) onToggle(folder.id);
        }}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors',
          'hover:opacity-90',
        )}
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          background: isSelected ? 'var(--color-primary-light)' : 'transparent',
          color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
          border: 'none',
          fontFamily: 'var(--font-sans)',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'var(--color-muted)';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'transparent';
        }}
      >
        {hasChildren ? (
          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="w-4" />
        )}
        <Folder size={16} style={{ color: FOLDER_COLORS[folder.color] }} className="flex-shrink-0" />
        <span className="truncate">{folder.name}</span>
      </button>

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {children.map((child) => (
              <FolderNode
                key={child.id}
                folder={child}
                folders={folders}
                selectedFolderId={selectedFolderId}
                expandedIds={expandedIds}
                onSelect={onSelect}
                onToggle={onToggle}
                onOpen={onOpen}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FolderSidebar() {
  const navigate = useNavigate();
  const { folders, selectedFolderId, selectFolder, addFolder } = useFolderStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<FolderColor>('blue');

  const rootFolders = folders.filter((f) => !f.parentFolderId);

  const handleOpen = useCallback((id: string) => {
    navigate(`/folders/${id}`);
  }, [navigate]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const now = Date.now();
    await addFolder({
      id: generateId(),
      userId: '',
      name: trimmed,
      description: '',
      color: newColor,
      parentFolderId: selectedFolderId ?? undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Auto-expand the parent so the new folder is visible
    if (selectedFolderId) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(selectedFolderId);
        return next;
      });
    }

    setNewName('');
    setNewColor('blue');
    setIsCreating(false);
  }, [newName, newColor, addFolder]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCreateFolder();
      if (e.key === 'Escape') {
        setIsCreating(false);
        setNewName('');
      }
    },
    [handleCreateFolder],
  );

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        width: 240,
        minWidth: 240,
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        padding: '0.75rem 0.5rem',
      }}
    >
      <div className="mb-2">
        <p
          className="text-xs font-semibold uppercase tracking-wider px-2 mb-2"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Folders
        </p>

        {/* All Sets */}
        <button
          onClick={() => selectFolder(null)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors"
          style={{
            background: selectedFolderId === null ? 'var(--color-primary-light)' : 'transparent',
            color: selectedFolderId === null ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            border: 'none',
            fontFamily: 'var(--font-sans)',
          }}
          onMouseEnter={(e) => {
            if (selectedFolderId !== null) e.currentTarget.style.background = 'var(--color-muted)';
          }}
          onMouseLeave={(e) => {
            if (selectedFolderId !== null) e.currentTarget.style.background = 'transparent';
          }}
        >
          <Layers size={16} className="flex-shrink-0" />
          <span>All Sets</span>
        </button>
      </div>

      {/* Folder Tree */}
      <div className="flex-1 overflow-y-auto">
        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            folders={folders}
            selectedFolderId={selectedFolderId}
            expandedIds={expandedIds}
            onSelect={selectFolder}
            onToggle={handleToggle}
            onOpen={handleOpen}
            depth={0}
          />
        ))}
      </div>

      {/* New Folder */}
      <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
        <AnimatePresence>
          {isCreating && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
              className="mb-2"
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Folder name"
                className="w-full h-8 px-2 text-sm mb-2"
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
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--color-border)';
                }}
              />
              <div className="flex flex-wrap gap-1.5 px-1">
                {COLOR_KEYS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className="w-5 h-5 rounded-full cursor-pointer transition-transform"
                    style={{
                      background: FOLDER_COLORS[color],
                      border: 'none',
                      outline: newColor === color ? '2px solid var(--color-text)' : 'none',
                      outlineOffset: 2,
                      transform: newColor === color ? 'scale(1.15)' : 'scale(1)',
                    }}
                    aria-label={color}
                  />
                ))}
              </div>
              <div className="flex gap-1 mt-2">
                <button
                  onClick={handleCreateFolder}
                  className="flex-1 h-7 text-xs font-medium rounded-md cursor-pointer"
                  style={{
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewName('');
                  }}
                  className="flex-1 h-7 text-xs font-medium rounded-md cursor-pointer"
                  style={{
                    background: 'var(--color-muted)',
                    color: 'var(--color-text)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsCreating(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors"
          style={{
            background: 'transparent',
            color: 'var(--color-text-tertiary)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-sans)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-muted)';
            e.currentTarget.style.color = 'var(--color-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          <Plus size={14} />
          New Folder
        </button>
      </div>
    </aside>
  );
}

export default FolderSidebar;
