import { useEffect, useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, BarChart3, FolderOpen, Upload } from 'lucide-react';
import Fuse from 'fuse.js';
import PageTransition from '@/components/layout/PageTransition';
import { useSetStore } from '@/stores/useSetStore';
import { useFolderStore } from '@/stores/useFolderStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import SetCard from '@/components/SetCard';
import ImportBackupModal from '@/components/ImportBackupModal'; // TEMPORARY: import backup feature
import type { StudySet } from '@/types';

function HomePage() {
  const navigate = useNavigate();
  const { sets, loading, searchQuery, setSearchQuery, loadSets, removeSet } =
    useSetStore();
  const { folders, selectedFolderId, loadFolders, selectFolder } =
    useFolderStore();
  const [showImport, setShowImport] = useState(false); // TEMPORARY: import backup feature

  useEffect(() => {
    loadSets();
    loadFolders();
  }, [loadSets, loadFolders]);

  const fuse = useMemo(
    () =>
      new Fuse<StudySet>(sets, {
        threshold: 0.4,
        keys: ['title', 'tags', 'cards.term'],
      }),
    [sets],
  );

  const filteredSets = useMemo(() => {
    let result = sets;

    if (searchQuery.trim()) {
      result = fuse.search(searchQuery).map((r) => r.item);
    }

    if (selectedFolderId) {
      result = result.filter((s) => s.folderId === selectedFolderId);
    }

    return result;
  }, [sets, searchQuery, selectedFolderId, fuse]);

  const handleDelete = useCallback(
    (id: string) => {
      removeSet(id);
    },
    [removeSet],
  );

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Spinner size="lg" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search sets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search size={18} />}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => navigate('/sets/new')}
              icon={<Plus size={18} />}
            >
              New Set
            </Button>
            {/* TEMPORARY: import backup feature */}
            <Button
              variant="outline"
              onClick={() => setShowImport(true)}
              icon={<Upload size={18} />}
            >
              Import
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/stats')}
              aria-label="Statistics"
            >
              <BarChart3 size={20} />
            </Button>
          </div>
        </div>

        {/* Folder filter */}
        {folders.length > 0 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            <button
              onClick={() => selectFolder(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer transition-colors"
              style={{
                background: selectedFolderId === null
                  ? 'var(--color-primary)'
                  : 'var(--color-muted)',
                color: selectedFolderId === null
                  ? '#ffffff'
                  : 'var(--color-text-secondary)',
                border: 'none',
              }}
            >
              All Sets
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => selectFolder(folder.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer transition-colors"
                style={{
                  background:
                    selectedFolderId === folder.id
                      ? 'var(--color-primary)'
                      : 'var(--color-muted)',
                  color:
                    selectedFolderId === folder.id
                      ? '#ffffff'
                      : 'var(--color-text-secondary)',
                  border: 'none',
                }}
              >
                <FolderOpen size={14} />
                {folder.name}
              </button>
            ))}
          </div>
        )}

        {/* Set grid or empty state */}
        {filteredSets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSets.map((set) => (
              <SetCard key={set.id} set={set} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'var(--color-muted)' }}
            >
              <Plus
                size={28}
                style={{ color: 'var(--color-text-tertiary)' }}
              />
            </div>
            <h2
              className="text-lg font-semibold mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              {searchQuery
                ? 'No sets found'
                : 'No study sets yet'}
            </h2>
            <p
              className="text-sm mb-4"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {searchQuery
                ? 'Try a different search term'
                : 'Create your first study set to get started'}
            </p>
            {!searchQuery && (
              <Button
                variant="primary"
                onClick={() => navigate('/sets/new')}
                icon={<Plus size={18} />}
              >
                Create Your First Set
              </Button>
            )}
          </div>
        )}
      </div>
      {/* TEMPORARY: import backup feature */}
      <ImportBackupModal isOpen={showImport} onClose={() => setShowImport(false)} />
    </PageTransition>
  );
}

export default HomePage;
