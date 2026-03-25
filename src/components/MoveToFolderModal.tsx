import { useState, useCallback } from 'react';
import { Folder, FolderMinus, FolderPlus, Check } from 'lucide-react';
import type { Folder as FolderType, FolderColor } from '@/types';
import { useFolderStore } from '@/stores/useFolderStore';
import { useSetStore } from '@/stores/useSetStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn, generateId, FOLDER_COLORS } from '@/lib/utils';

const COLOR_KEYS = Object.keys(FOLDER_COLORS) as FolderColor[];

interface MoveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  setId: string;
  currentFolderId?: string;
}

interface FolderRowProps {
  folder: FolderType;
  folders: FolderType[];
  currentFolderId?: string;
  depth: number;
  onSelect: (folderId: string) => void;
}

function FolderRow({ folder, folders, currentFolderId, depth, onSelect }: FolderRowProps) {
  const isCurrent = currentFolderId === folder.id;
  const children = folders.filter((f) => f.parentFolderId === folder.id);

  return (
    <>
      <button
        onClick={() => onSelect(folder.id)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer transition-colors',
        )}
        style={{
          paddingLeft: `${12 + depth * 20}px`,
          background: isCurrent ? 'var(--color-primary-light)' : 'transparent',
          color: isCurrent ? 'var(--color-primary)' : 'var(--color-text)',
          border: 'none',
          fontFamily: 'var(--font-sans)',
        }}
        onMouseEnter={(e) => {
          if (!isCurrent) e.currentTarget.style.background = 'var(--color-muted)';
        }}
        onMouseLeave={(e) => {
          if (!isCurrent) e.currentTarget.style.background = 'transparent';
        }}
      >
        <Folder size={16} style={{ color: FOLDER_COLORS[folder.color] }} className="flex-shrink-0" />
        <span className="truncate flex-1 text-left">{folder.name}</span>
        {isCurrent && <Check size={16} className="flex-shrink-0" />}
      </button>
      {children.map((child) => (
        <FolderRow
          key={child.id}
          folder={child}
          folders={folders}
          currentFolderId={currentFolderId}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function MoveToFolderModal({ isOpen, onClose, setId, currentFolderId }: MoveToFolderModalProps) {
  const { folders, addFolder } = useFolderStore();
  const { sets, updateSet } = useSetStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<FolderColor>('blue');

  const rootFolders = folders.filter((f) => !f.parentFolderId);

  const handleSelect = useCallback(
    async (folderId: string) => {
      const set = sets.find((s) => s.id === setId);
      if (!set) return;

      await updateSet({
        ...set,
        folderId,
        updatedAt: Date.now(),
      });
      onClose();
    },
    [sets, setId, updateSet, onClose],
  );

  const handleRemoveFromFolder = useCallback(async () => {
    const set = sets.find((s) => s.id === setId);
    if (!set) return;

    const { folderId: _, ...rest } = set;
    await updateSet({
      ...rest,
      folderId: undefined,
      updatedAt: Date.now(),
    });
    onClose();
  }, [sets, setId, updateSet, onClose]);

  const handleCreateFolder = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const now = Date.now();
    const newFolder = {
      id: generateId(),
      userId: '',
      name: trimmed,
      description: '',
      color: newColor,
      createdAt: now,
      updatedAt: now,
    };
    await addFolder(newFolder);

    // Move the set into the new folder
    const set = sets.find((s) => s.id === setId);
    if (set) {
      await updateSet({ ...set, folderId: newFolder.id, updatedAt: Date.now() });
    }

    setNewName('');
    setNewColor('blue');
    setIsCreating(false);
    onClose();
  }, [newName, newColor, addFolder, sets, setId, updateSet, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Move to Folder" size="sm">
      <div
        className="max-h-64 overflow-y-auto -mx-1.5"
        style={{ scrollbarWidth: 'thin' }}
      >
        {rootFolders.length === 0 && !isCreating && (
          <p
            className="text-sm text-center py-6"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            No folders yet. Create one below.
          </p>
        )}
        {rootFolders.map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
            folders={folders}
            currentFolderId={currentFolderId}
            depth={0}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Create new folder inline */}
      {isCreating ? (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setIsCreating(false); setNewName(''); }
            }}
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
          />
          <div className="flex flex-wrap gap-1.5 mb-2">
            {COLOR_KEYS.map((color) => (
              <button
                key={color}
                onClick={() => setNewColor(color)}
                className="w-5 h-5 rounded-full cursor-pointer"
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
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreateFolder} className="flex-1">
              Create & Move
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsCreating(false); setNewName(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: 'none',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-muted)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <FolderPlus size={16} className="flex-shrink-0" />
            <span>New folder</span>
          </button>

          {currentFolderId && (
            <button
              onClick={handleRemoveFromFolder}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer transition-colors"
              style={{
                background: 'transparent',
                color: 'var(--color-danger)',
                border: 'none',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-danger-light)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <FolderMinus size={16} className="flex-shrink-0" />
              <span>Remove from folder</span>
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

export default MoveToFolderModal;
