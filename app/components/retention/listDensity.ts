'use client';

/**
 * Shared "standard vs compact" preference for the dashboard's lists. One global key; flipping it on one list changes all
 * lists on the page (custom event) and in other tabs (storage event). Compact is the default: that is how the team
 * works day to day. Read through useSyncExternalStore, so the server render and hydration use the default and the
 * stored choice follows without a setState in an effect.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type ListDensity = 'standard' | 'compact';

const STORAGE_KEY = 'office-list-density';
const CHANGE_EVENT = 'office-list-density-change';

function readStored(): ListDensity {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'compact' || v === 'standard') return v;
  } catch {
    /* storage disabled */
  }
  return 'compact';
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useListDensity(): [ListDensity, (d: ListDensity) => void] {
  const density = useSyncExternalStore<ListDensity>(subscribe, readStored, () => 'compact');
  const setDensity = useCallback((d: ListDensity) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, d);
    } catch {
      /* non-fatal */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [density, setDensity];
}
