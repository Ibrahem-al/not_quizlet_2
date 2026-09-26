import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches React.lazy's own constraint
type AnyComponent = ComponentType<any>;

export type PreloadableComponent<T extends AnyComponent> = LazyExoticComponent<T> & {
  /** Start downloading the chunk now (e.g. on hover or when idle). Safe to call repeatedly. */
  preload: () => Promise<unknown>;
};

/** React.lazy with a `preload()` handle, so likely-next screens can be fetched
 *  on intent (hover/focus) or idle time instead of on click. */
export function lazyWithPreload<T extends AnyComponent>(
  factory: () => Promise<{ default: T }>,
): PreloadableComponent<T> {
  let pending: Promise<{ default: T }> | null = null;
  const load = () => {
    pending ??= factory().catch((error: unknown) => {
      pending = null; // allow a retry after a failed chunk fetch
      throw error;
    });
    return pending;
  };
  const component = lazy(load) as PreloadableComponent<T>;
  component.preload = load;
  return component;
}

/** Run `task` when the browser is idle (falls back to a short timeout). */
export function whenIdle(task: () => void, timeout = 2000): void {
  if (typeof window === 'undefined') return;
  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (ric) ric(task, { timeout });
  else setTimeout(task, 300);
}
