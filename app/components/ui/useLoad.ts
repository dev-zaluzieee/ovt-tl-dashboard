'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data for a key (re-runs when the key changes), keeps the previous data while the next load runs (screens dim it),
 * aborts a superseded request, optionally refreshes on an interval and exposes `reload()` for after-action refreshes.
 * `loading` is derived (no state is set synchronously in the effect).
 */
export function useLoad<T>(key: string, fn: (signal: AbortSignal) => Promise<T>, opts?: { refreshMs?: number }) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ id: string; data?: T; error?: unknown } | null>(null);
  const [lastData, setLastData] = useState<T | undefined>(undefined);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const id = `${key}#${tick}`;

  useEffect(() => {
    const ac = new AbortController();
    fnRef.current(ac.signal).then(
      (data) => {
        if (ac.signal.aborted) return;
        setState({ id, data });
        setLastData(data);
      },
      (error) => {
        if (ac.signal.aborted) return;
        setState({ id, error });
      },
    );
    return () => ac.abort();
  }, [id]);

  const refreshMs = opts?.refreshMs;
  useEffect(() => {
    if (!refreshMs) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1);
    }, refreshMs);
    return () => window.clearInterval(t);
  }, [refreshMs]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const settled = state !== null && state.id === id;
  return {
    data: state?.data ?? lastData,
    error: settled ? (state?.error ?? null) : null,
    loading: !settled,
    reload,
  };
}
