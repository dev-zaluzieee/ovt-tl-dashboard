'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Which workforce the team leader is working with right now: OVT (obchodníci)
 * or MVT (montéři). Everyone sees everything; the choice only decides which
 * side's pages come first in the navigation and which teams the team filter
 * offers. Remembered per browser; the default comes from the user's TL tags.
 */
export type Workforce = 'ovt' | 'mvt';

const STORAGE_KEY = 'tl-workforce';

interface Ctx {
  workforce: Workforce;
  setWorkforce: (w: Workforce) => void;
  /** True once the stored choice (and the user's tags) have been read. */
  ready: boolean;
  /** Tags of the signed-in user (drives the default + the badge). */
  isOvtTl: boolean;
  isMvtTl: boolean;
}

const WorkforceCtx = createContext<Ctx>({ workforce: 'ovt', setWorkforce: () => {}, ready: false, isOvtTl: false, isMvtTl: false });

function readStored(): Workforce | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'ovt' || v === 'mvt' ? v : null;
  } catch {
    return null;
  }
}

export function WorkforceProvider({ children }: { children: React.ReactNode }) {
  const [workforce, setWf] = useState<Workforce>('ovt');
  const [tags, setTags] = useState<{ isOvtTl: boolean; isMvtTl: boolean }>({ isOvtTl: false, isMvtTl: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setWf(stored);
      setReady(true); // a remembered choice wins; tags only decorate
    }
    // Default from the signed-in user's tags when nothing is stored yet.
    (async () => {
      try {
        const email = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('user_email='))?.split('=').slice(1).join('=') ?? '');
        if (!email) return;
        const res = await fetch('/api/users', { headers: { Accept: 'application/json' } });
        const body = await res.json().catch(() => null);
        const me = ((body?.data ?? []) as { email?: string | null; is_ovt_tl?: boolean; is_mvt_tl?: boolean }[]).find(
          (u) => (u.email ?? '').toLowerCase() === email.toLowerCase()
        );
        const isOvtTl = !!me?.is_ovt_tl;
        const isMvtTl = !!me?.is_mvt_tl;
        setTags({ isOvtTl, isMvtTl });
        if (!stored && isMvtTl && !isOvtTl) setWf('mvt');
      } catch {
        /* keep default */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setWorkforce = useCallback((w: Workforce) => {
    setWf(w);
    try {
      localStorage.setItem(STORAGE_KEY, w);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ workforce, setWorkforce, ready, ...tags }), [workforce, setWorkforce, ready, tags]);
  return <WorkforceCtx.Provider value={value}>{children}</WorkforceCtx.Provider>;
}

export function useWorkforce(): Ctx {
  return useContext(WorkforceCtx);
}

export const WORKFORCE_LABEL: Record<Workforce, string> = { ovt: 'OVT', mvt: 'MVT' };
export const WORKFORCE_LONG: Record<Workforce, string> = { ovt: 'Obchodníci (OVT)', mvt: 'Montéři (MVT)' };
