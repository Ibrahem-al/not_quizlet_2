import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Session key storing the timestamp of the last automatic chunk-reload.
 * Used to self-heal stale-chunk-after-redeploy while guarding against
 * an infinite reload loop when the chunk is genuinely unreachable.
 */
const CHUNK_RELOAD_KEY = 'sf-chunk-reload-at';
/** Minimum gap between automatic reloads (ms). Under this, we assume a loop. */
const CHUNK_RELOAD_COOLDOWN = 10_000;

/**
 * Detect a failed dynamic `import()` (lazy chunk load). These surface with a
 * variety of names/messages across browsers and bundlers, so match broadly.
 */
function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: string }).name ?? '';
  const message = (error as { message?: string }).message ?? '';
  return (
    name === 'ChunkLoadError' ||
    /loading chunk [\d]+ failed/i.test(message) ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)
  );
}

/**
 * App-level error boundary. Catches render/lifecycle errors (including a
 * rejected lazy `import()` that Suspense cannot handle) and shows a friendly
 * recoverable fallback instead of a blank white screen.
 *
 * For chunk-load errors — common for an offline-first app hitting a
 * not-yet-cached route, or after a redeploy invalidates old hashed chunk
 * names — it forces a one-time `window.location.reload()` so the client
 * picks up fresh chunk names. A sessionStorage cooldown prevents a reload
 * loop if the chunk is truly unavailable.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (isChunkLoadError(error)) {
      try {
        const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? '0');
        const now = Date.now();
        // Only auto-reload if we haven't just done so — avoids an infinite loop
        // when the chunk is genuinely missing, while still self-healing across
        // separate redeploys within the same tab session.
        if (now - last > CHUNK_RELOAD_COOLDOWN) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage may be unavailable (private mode) — fall through to UI.
      }
    }
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isChunk = isChunkLoadError(this.state.error);

    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center min-h-dvh px-6 text-center"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <div
          className="w-full max-w-md p-8 flex flex-col items-center gap-4"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
              fontSize: 28,
              fontWeight: 700,
            }}
            aria-hidden="true"
          >
            !
          </div>

          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Something went wrong
          </h1>

          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {isChunk
              ? 'We couldn’t load part of the app. This can happen after an update or while offline. Reloading usually fixes it.'
              : 'An unexpected error interrupted the page. Your saved work is stored locally and is safe.'}
          </p>

          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center justify-center h-10 px-5 font-medium cursor-pointer transition-colors mt-2"
            style={{
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
