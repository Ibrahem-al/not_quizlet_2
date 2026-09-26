import { useAuthStore } from '@/stores/useAuthStore';

// ============================================================
// App-level cloud pull. Sets/folders are pulled once when a user
// signs in (or auth restores a session), and again when the tab
// becomes visible after a while away — instead of on every page
// mount. The stores dedupe and throttle, and a pull is a small
// manifest query unless something actually changed remotely.
// Stores are imported lazily so anonymous visitors (e.g. shared
// links) never download the Dexie/sync code for this.
// ============================================================

const REFRESH_AFTER_HIDDEN_MS = 5 * 60 * 1000;

async function pullAll(force: boolean): Promise<void> {
  const [{ useSetStore }, { useFolderStore }] = await Promise.all([
    import('@/stores/useSetStore'),
    import('@/stores/useFolderStore'),
  ]);
  await Promise.all([
    useSetStore.getState().loadSets({ force }),
    useFolderStore.getState().loadFolders({ force }),
  ]);
}

/** Starts the listeners; returns a cleanup function. */
export function startCloudBootstrap(): () => void {
  let lastUserId: string | null = null;
  let hiddenAt: number | null = null;

  const onUser = (userId: string | null) => {
    if (userId && userId !== lastUserId) void pullAll(false);
    lastUserId = userId;
  };
  onUser(useAuthStore.getState().user?.id ?? null);
  const unsubscribe = useAuthStore.subscribe((state) => onUser(state.user?.id ?? null));

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const awayLong = hiddenAt !== null && Date.now() - hiddenAt > REFRESH_AFTER_HIDDEN_MS;
    hiddenAt = null;
    if (awayLong && useAuthStore.getState().user) void pullAll(true);
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
