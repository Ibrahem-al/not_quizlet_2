import { Cloud, CloudOff, CloudAlert, RefreshCw } from 'lucide-react';
import { useSyncStatusStore, flushSyncQueue } from '@/lib/syncEngine';
import { useAuthStore } from '@/stores/useAuthStore';

/** Small header indicator for the cloud-first sync engine. Only rendered
 *  for signed-in users; clicking it retries a failed/offline sync. */
export function SyncStatusIndicator() {
  const user = useAuthStore((s) => s.user);
  const { state, pending, lastError } = useSyncStatusStore();

  if (!user) return null;

  const { icon, label, color } =
    state === 'offline'
      ? {
          icon: <CloudOff size={18} />,
          label: 'Offline — changes saved on this device and synced when you reconnect',
          color: 'var(--color-text-secondary)',
        }
      : state === 'error'
        ? {
            icon: <CloudAlert size={18} />,
            label: lastError
              ? `Sync problem: ${lastError} — click to retry`
              : 'Sync problem — click to retry',
            color: 'var(--color-danger, #dc2626)',
          }
        : state === 'syncing' || pending > 0
          ? {
              icon: <RefreshCw size={18} className="animate-spin" />,
              label: 'Saving to cloud…',
              color: 'var(--color-primary)',
            }
          : {
              icon: <Cloud size={18} />,
              label: 'All changes saved to cloud',
              color: 'var(--color-text-secondary)',
            };

  return (
    <button
      onClick={() => flushSyncQueue()}
      className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors"
      style={{ background: 'transparent', border: 'none', color }}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
