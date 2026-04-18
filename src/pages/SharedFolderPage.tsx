import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  BookOpen,
  GraduationCap,
  Puzzle,
  ClipboardCheck,
  Gamepad2,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { StudySet, Folder } from '@/types';
import { fetchSharedFolder } from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { FOLDER_COLORS } from '@/lib/utils';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { GameBrowserModal } from '@/components/GameBrowserModal';

interface FolderData {
  folder: Folder;
  subfolders: Folder[];
  sets: StudySet[];
}

function SharedFolderPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'not_found' | 'network' | null>(null);
  const [gameBrowserSetId, setGameBrowserSetId] = useState<string | null>(null);

  const fetchFolder = useCallback((options?: { bypassCache?: boolean }) => {
    if (!token) {
      setError('Invalid share link.');
      setErrorType('not_found');
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      setError('Cloud features are not configured. This share link cannot be loaded.');
      setErrorType('not_found');
      setLoading(false);
      return;
    }

    setError(null);
    setErrorType(null);
    setLoading(true);

    let cancelled = false;
    fetchSharedFolder(token, options)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setData(result);
        } else {
          setError('This folder was not found. The share link may have expired or been removed.');
          setErrorType('not_found');
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load shared folder. Check your connection and try again.');
          setErrorType('network');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleRefresh = useCallback(() => {
    void fetchFolder({ bypassCache: true });
  }, [fetchFolder]);

  useEffect(() => {
    return fetchFolder();
  }, [fetchFolder]);

  // Group sets by their folder
  const setsByFolder = useMemo(() => {
    if (!data) return new Map<string, StudySet[]>();
    const map = new Map<string, StudySet[]>();
    for (const set of data.sets) {
      const fid = set.folderId ?? data.folder.id;
      const list = map.get(fid) ?? [];
      list.push(set);
      map.set(fid, list);
    }
    return map;
  }, [data]);

  const totalCards = useMemo(() => {
    if (!data) return 0;
    return data.sets.reduce((sum, s) => sum + s.cards.length, 0);
  }, [data]);

  const studyModes = useMemo(
    () => [
      { id: 'flashcards', label: 'Flashcards', icon: <BookOpen size={14} />, minCards: 1 },
      { id: 'learn', label: 'Learn', icon: <GraduationCap size={14} />, minCards: 2 },
      { id: 'match', label: 'Match', icon: <Puzzle size={14} />, minCards: 2 },
      { id: 'test', label: 'Test', icon: <ClipboardCheck size={14} />, minCards: 2 },
    ],
    [],
  );

  if (loading) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading shared folder...</p>
        </div>
      </PageTransition>
    );
  }

  if (error || !data) {
    return (
      <PageTransition>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <AlertCircle size={48} className="mx-auto mb-4" style={{ color: 'var(--color-danger)' }} />
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            Unable to load folder
          </h1>
          <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {error}
          </p>
          <div className="flex items-center justify-center gap-3">
            {errorType === 'network' && (
              <Button variant="primary" icon={<RefreshCw size={16} />} onClick={handleRefresh}>
                Try Again
              </Button>
            )}
            <Button variant={errorType === 'network' ? 'outline' : 'primary'} onClick={() => navigate('/')}>
              Go to Home
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }

  const { folder, subfolders } = data;
  const folderColor = FOLDER_COLORS[folder.color] ?? FOLDER_COLORS.blue;

  // Build folder name lookup for section headers
  const folderNameMap = new Map<string, string>();
  folderNameMap.set(folder.id, folder.name);
  for (const sf of subfolders) {
    folderNameMap.set(sf.id, sf.name);
  }

  // Get all folder IDs that have sets, root first
  const folderOrder = [folder.id, ...subfolders.map((sf) => sf.id)].filter((id) =>
    setsByFolder.has(id),
  );

  const getValidCardCount = (set: StudySet) =>
    set.cards.filter((c) => {
      const t = c.term?.replace(/<[^>]*>/g, '').trim();
      const d = c.definition?.replace(/<[^>]*>/g, '').trim();
      return (t && t.length > 0) || (d && d.length > 0);
    }).length;

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Shared banner */}
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-lg mb-4 text-sm"
          style={{
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            border: '1px solid var(--color-primary)',
            borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
          }}
        >
          <FolderOpen size={16} />
          <span className="font-medium">Shared Folder</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>— view only</span>
        </div>

        {/* Folder header */}
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: folderColor }}
          >
            <FolderOpen size={18} color="#fff" />
          </div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}
          >
            {folder.name}
          </h1>
        </div>

        {folder.description && (
          <p className="text-sm mb-3 ml-11" style={{ color: 'var(--color-text-secondary)' }}>
            {folder.description}
          </p>
        )}

        {/* Stats */}
        <p className="text-sm mb-6 ml-11" style={{ color: 'var(--color-text-tertiary)' }}>
          {data.sets.length} set{data.sets.length !== 1 ? 's' : ''}
          {' · '}
          {totalCards} card{totalCards !== 1 ? 's' : ''}
          {subfolders.length > 0 && ` · ${subfolders.length} subfolder${subfolders.length !== 1 ? 's' : ''}`}
        </p>

        {/* Sets grouped by folder */}
        {data.sets.length === 0 ? (
          <div className="py-16 text-center">
            <p style={{ color: 'var(--color-text-secondary)' }}>This folder has no sets yet.</p>
            <div className="mt-4">
              <Button variant="outline" icon={<RefreshCw size={16} />} onClick={handleRefresh}>
                Refresh
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {folderOrder.map((fid) => {
              const sets = setsByFolder.get(fid) ?? [];
              const isRoot = fid === folder.id;
              return (
                <div key={fid}>
                  {/* Section header for subfolders */}
                  {!isRoot && (
                    <div className="flex items-center gap-2 mb-3">
                      <FolderOpen size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                      <span
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {folderNameMap.get(fid) ?? 'Subfolder'}
                      </span>
                    </div>
                  )}

                  {/* Set cards grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sets.map((set) => {
                      const cardCount = getValidCardCount(set);
                      return (
                        <div
                          key={set.id}
                          className="rounded-xl p-5"
                          style={{
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-card)',
                          }}
                        >
                          <h3
                            className="text-base font-semibold mb-1 truncate"
                            style={{ color: 'var(--color-text)' }}
                          >
                            {set.title || 'Untitled Set'}
                          </h3>
                          {set.description && (
                            <p
                              className="text-xs mb-2 line-clamp-2"
                              style={{ color: 'var(--color-text-secondary)' }}
                            >
                              {set.description}
                            </p>
                          )}
                          <p
                            className="text-xs mb-3"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {cardCount} card{cardCount !== 1 ? 's' : ''}
                          </p>

                          {/* Study mode buttons */}
                          {cardCount > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {studyModes.map((m) => (
                                <Button
                                  key={m.id}
                                  variant="outline"
                                  size="sm"
                                  icon={m.icon}
                                  disabled={cardCount < m.minCards}
                                  onClick={() =>
                                    navigate(`/shared/folder/${token}/set/${set.id}/study/${m.id}`, {
                                      state: { set },
                                    })
                                  }
                                >
                                  {m.label}
                                </Button>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                icon={<Gamepad2 size={14} />}
                                disabled={cardCount < 2}
                                onClick={() => setGameBrowserSetId(set.id)}
                              >
                                Games
                              </Button>
                            </div>
                          )}
                          <GameBrowserModal
                            isOpen={gameBrowserSetId === set.id}
                            onClose={() => setGameBrowserSetId(null)}
                            setId={set.id}
                            cardCount={cardCount}
                            onNavigate={(url) => {
                              const gameId = url.split('/study/')[1];
                              navigate(`/shared/folder/${token}/set/${set.id}/study/${gameId}`, {
                                state: { set },
                              });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

export default SharedFolderPage;
