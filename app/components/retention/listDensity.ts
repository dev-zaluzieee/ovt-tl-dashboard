'use client';

/**
 * Shared "standard vs compact" preference for office list pages. One global
 * key drives the retention portal lists (Moje OP, Fronta, Aktivní OP,
 * Nedopadlé) AND the sales queue (/fronta-zakazek) — flip it once, it sticks
 * across the whole office UI.
 *
 * Same-page sync: when one list flips the toggle, others using the hook on
 * the same page pick it up via a custom event + storage event (latter
 * handles other tabs too).
 *
 * The legacy key (`retention-portal-list-density`) is read once at module
 * load and migrated forward, so users who previously set compact don't get
 * reset.
 */

import { useCallback, useEffect, useState } from 'react';

export type ListDensity = 'standard' | 'compact';

const STORAGE_KEY = 'office-list-density';
const LEGACY_STORAGE_KEY = 'retention-portal-list-density';
const CHANGE_EVENT = 'office-list-density-change';

function readStored(): ListDensity {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'compact' || v === 'standard') return v;
    // One-shot migration from the legacy retention-portal key. Move the
    // value to the new key so subsequent reads are fast.
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === 'compact' || legacy === 'standard') {
      window.localStorage.setItem(STORAGE_KEY, legacy);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }
  } catch {
    /* SSR or storage disabled — fall through */
  }
  // TL dashboard defaults to compact (that's how the office team works day-to-day).
  return 'compact';
}

export function useListDensity(): [ListDensity, (d: ListDensity) => void] {
  // Start with the SSR-safe default; the layout effect below upgrades it to
  // whatever's in localStorage after mount. Two-render flicker is intentional
  // — better than mismatched hydration.
  const [density, setDensityState] = useState<ListDensity>('compact');

  useEffect(() => {
    setDensityState(readStored());
  }, []);

  const setDensity = useCallback((d: ListDensity) => {
    setDensityState(d);
    try {
      window.localStorage.setItem(STORAGE_KEY, d);
    } catch {
      /* non-fatal */
    }
    // Sibling components on the same page won't see the storage event (it
    // only fires across tabs), so we dispatch a custom event too.
    try {
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    const onChange = () => setDensityState(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return [density, setDensity];
}
