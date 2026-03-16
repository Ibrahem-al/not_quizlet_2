import { useCallback } from 'react';
import { Folder, FolderMinus, Check } from 'lucide-react';
import type { Folder as FolderType } from '@/types';
import { useFolderStore } from '@/stores/useFolderStore';
import { useSetStore } from '@/stores/useSetStore';
import { Modal } from '@/components/ui/Modal';
import { cn, FOLDER_COLORS } from '@/lib/utils';

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
  const { folders } = useFolderStore();
  const { sets, updateSet } = useSetStore();

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Move to Folder" size="sm">
      <div
        className="max-h-64 overflow-y-auto -mx-1.5"
        style={{ scrollbarWidth: 'thin' }}
      >
        {rootFolders.length === 0 && (
          <p
            className="text-sm text-center py-6"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            No folders yet. Create one from the sidebar.
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

      {currentFolderId && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
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
        </div>
      )}
    </Modal>
  );
}

export default MoveToFolderModal;
