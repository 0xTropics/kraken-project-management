"use client";

import * as React from "react";

const EVENT = "kraken:storage";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

/**
 * localStorage as an external store rather than as state copied in an effect.
 * The server snapshot is the fallback, so the first client render matches the
 * server exactly and the real value arrives on the following render -- no
 * hydration mismatch, and no cascading render from a setState-in-effect.
 */
export function usePersistedState<T extends string>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const value = React.useSyncExternalStore(
    subscribe,
    () => (localStorage.getItem(key) as T | null) ?? fallback,
    () => fallback,
  );

  const set = React.useCallback(
    (next: T) => {
      localStorage.setItem(key, next);
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}

/** True only after hydration. Used to defer client-only affordances. */
export function useMounted(): boolean {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
