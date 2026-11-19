'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { NAV, isActive, sideOfPath, type Side } from './nav';
import { useMeta } from './MetaContext';
import { useLoad } from '@/app/components/ui/useLoad';
import { EscalationBadge } from '@/app/components/mvt/EscalationBadge';
import { ReadinessBadge } from '@/app/components/mvt/ReadinessBadge';

const KEY = 'tl-side';

function readStored(): Side {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'mvt' ? 'mvt' : 'ovt';
  } catch {
    return 'ovt';
  }
}

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { meta } = useMeta();
  const [stored, setStored] = useState<Side>('ovt');
  useEffect(() => {
    const t = window.setTimeout(() => setStored(readStored()), 0);
    return () => window.clearTimeout(t);
  }, []);
  const pathSide = sideOfPath(pathname);
  const side: Side = pathSide ?? stored;

  useEffect(() => {
    if (!pathSide) return;
    try {
      localStorage.setItem(KEY, pathSide);
    } catch {
      /* storage may be blocked */
    }
  }, [pathSide]);

  const switchTo = (s: Side) => {
    setStored(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* ignore */
    }
    router.push(s === 'mvt' ? '/mvt' : '/ovt');
  };

  const items = NAV[side].flatMap((g) => g.items);
  // Hotovost needs FINANCE_API_URL on the server: the entry stays, but says when it is not set up.
  const { data: cashStatus } = useLoad<boolean>('cash-status', async (signal) => {
    const res = await fetch('/api/cash/status', { headers: { Accept: 'application/json' }, signal });
    const json = (await res.json().catch(() => null)) as { data?: { configured?: unknown } } | null;
    return json?.data?.configured !== false;
  });
  const cashConfigured = cashStatus !== false;

  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href={side === 'mvt' ? '/mvt' : '/ovt'} className="inline-block">
              <Image src="/logo-zaluzieee.png" alt="žaluzieee logo" width={384} height={94} priority unoptimized className="h-8 w-auto" />
            </Link>
            <div className="flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="tablist" aria-label="Pracovní síla">
              {(['ovt', 'mvt'] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={side === s}
                  onClick={() => switchTo(s)}
                  title={s === 'ovt' ? 'OVT (zaměřovači)' : 'Montéři (MVT)'}
                  className={`px-3 py-1.5 font-semibold transition-colors ${side === s ? 'bg-[#1E8449] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-700">
            <span className="font-medium">{meta?.user.name ?? meta?.user.email ?? ''}</span>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a route handler that must be a full navigation */}
<a href="/api/auth/sso-logout" className="transition-colors hover:text-[#1E8449]">
              Odhlásit se
            </a>
          </div>
        </div>
      </header>
      <nav className="relative z-50 bg-[#1E8449] text-white" aria-label="Hlavní navigace">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            {items.map((it) => (
              <Link key={it.href} href={it.href} className={`transition-opacity hover:opacity-80 ${isActive(pathname, it.href) ? 'font-semibold underline' : ''}`}>
                {it.label}
                {it.href === '/mvt/eskalace' && <EscalationBadge />}
                {it.href === '/mvt/pripravenost' && <ReadinessBadge />}
                {it.href === '/hotovost' && !cashConfigured && <span className="ml-1 text-xs font-normal opacity-80" title="Hotovost není nastavena (chybí FINANCE_API_URL)">(není nastavena)</span>}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
