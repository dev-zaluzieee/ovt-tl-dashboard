'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { NAV, SHARED_NAV } from '../navigation/Navigation';
import { STATE_UI, fmtDateTime, type TlDayEvent } from './shared';
import { KIND_UI, ProblemRow, type ProblemItem } from './MvtProblemsClient';
import { REOPEN_STATUS_UI, hoursLeftLabel, openForCorrection, reopenAction, type TlReopenItem } from './reopen';

type OpenKind = 'no_outcome' | 'erp_failed' | 'failed' | 'reklamace_waiting';
interface OpenItem {
  kind: OpenKind;
  event: TlDayEvent;
  reason: string;
  ageHours: number;
}
interface Overview {
  generatedAt: string;
  problems: { counts: Record<string, number>; top: ProblemItem[] };
  open: { counts: Record<OpenKind, number>; top: OpenItem[] };
  reopens: { open: TlReopenItem[]; requested: TlReopenItem[] };
}
const OPEN_KIND_LABEL: Record<OpenKind, string> = { no_outcome: 'bez výsledku', erp_failed: 'ERP nezapsáno', failed: 'zápis selhal', reklamace_waiting: 'reklamace čeká' };

function Block({ title, count, href, children, tone }: { title: string; count: number; href: string; children: React.ReactNode; tone: 'rose' | 'amber' | 'sky' | 'gray' }) {
  const ring = { rose: 'border-rose-200', amber: 'border-amber-200', sky: 'border-sky-200', gray: 'border-gray-200' }[tone];
  const badge = { rose: 'bg-rose-600', amber: 'bg-amber-500', sky: 'bg-sky-600', gray: 'bg-gray-400' }[tone];
  return (
    <section className={`rounded-xl border bg-white shadow-sm ${ring}`}>
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {title}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${count === 0 ? 'bg-gray-300' : badge}`}>{count}</span>
        </h2>
        <Link href={href} className="text-xs font-medium text-blue-600 hover:underline">Otevřít stránku →</Link>
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}

/** Přehled — the MVT team leader's inbox: everything that needs a decision, plus the navigation tiles. */
export function MvtOverviewClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mvt-overview');
      const j = await res.json();
      if (!res.ok || !j.success) setError(j.error || j.message || `HTTP ${res.status}`);
      else setData(j.data);
    } catch {
      setError('Chyba spojení.');
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const problemsTotal = data ? Object.values(data.problems.counts).reduce((a, b) => a + b, 0) : 0;
  const openTotal = data ? Object.values(data.open.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-8">
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {!data && !error && <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">Načítám přehled…</div>}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Block title="Problematické zakázky" count={problemsTotal} href="/mvt/problematicke-zakazky" tone="rose">
            <p className="px-2 pb-2 text-xs text-gray-500">
              {(Object.keys(KIND_UI) as (keyof typeof KIND_UI)[]).map((k) => `${KIND_UI[k].label.toLowerCase()} ${data.problems.counts[k] ?? 0}`).join(' · ')}
            </p>
            {data.problems.top.length === 0 ? (
              <p className="px-2 pb-2 text-sm text-gray-500">Nic k rozhodnutí.</p>
            ) : (
              <table className="min-w-full text-sm">
                <tbody>
                  {data.problems.top.map((it) => (
                    <ProblemRow key={`${it.kind}-${it.key}`} it={it} onChanged={() => void load()} compact />
                  ))}
                </tbody>
              </table>
            )}
          </Block>

          <Block title="Otevřeno k opravě" count={data.reopens.open.length + data.reopens.requested.length} href="/mvt/nedokoncene" tone="amber">
            {data.reopens.open.length + data.reopens.requested.length === 0 ? (
              <p className="px-2 pb-2 text-sm text-gray-500">Žádná událost není otevřená k opravě.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {[...data.reopens.open, ...data.reopens.requested].map((r) => (
                  <ReopenLine key={r.id} r={r} onChanged={() => void load()} />
                ))}
              </ul>
            )}
          </Block>

          <Block title="Nedokončené montáže" count={openTotal} href="/mvt/nedokoncene" tone="sky">
            <p className="px-2 pb-2 text-xs text-gray-500">{(Object.keys(OPEN_KIND_LABEL) as OpenKind[]).map((k) => `${OPEN_KIND_LABEL[k]} ${data.open.counts[k] ?? 0}`).join(' · ')}</p>
            {data.open.top.length === 0 ? (
              <p className="px-2 pb-2 text-sm text-gray-500">Vše má výsledek.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.open.top.map((it) => (
                  <li key={`${it.kind}-${it.event.id}`} className="flex items-start justify-between gap-2 px-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{it.event.customer ?? it.event.title ?? it.event.id}</p>
                      <p className="text-xs text-gray-500">{it.event.monters.map((m) => m.name).join(', ') || it.event.monterName || '—'} · {fmtDateTime(it.event.scheduledFrom)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_UI[it.event.appState].cls}`}>{STATE_UI[it.event.appState].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </div>
      )}

      <div className="space-y-8">
        {NAV.mvt.map((g) => (
          <section key={g.label}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{g.label}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {g.items
                .filter((t) => t.href !== '/mvt')
                .map((t) => (
                  <Link key={t.href} href={t.href} className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#1E8449] hover:shadow">
                    <p className="text-lg font-semibold text-gray-900">{t.label}</p>
                    <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                  </Link>
                ))}
            </div>
          </section>
        ))}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Nastavení</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {SHARED_NAV.map((t) => (
              <Link key={t.href} href={t.href} className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#1E8449] hover:shadow">
                <p className="text-lg font-semibold text-gray-900">{t.label}</p>
                <p className="mt-1 text-sm text-gray-600">{t.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ReopenLine({ r, onChanged }: { r: TlReopenItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (a: 'approve' | 'decline' | 'cancel') => {
    const note = window.prompt(a === 'decline' ? 'Důvod zamítnutí (povinný):' : 'Poznámka (nepovinná):', '');
    if (note == null) return;
    setBusy(true);
    try {
      if (await reopenAction(r.id, a, note || null)) onChanged();
    } finally {
      setBusy(false);
    }
  };
  const ui = REOPEN_STATUS_UI[r.status];
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 px-2 py-2 text-sm">
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ui.cls}`}>{ui.label}</span>
          <Link href={`/mvt/zapisy?event=${r.eventId}`} className="font-medium text-gray-900 hover:underline">Událost {r.eventId}</Link>
          {r.status === 'open' && <span className="text-xs font-semibold text-amber-800">zbývá {hoursLeftLabel(r.expiresAt)}</span>}
        </p>
        <p className="mt-0.5 text-xs text-gray-600">
          {r.status === 'open' ? `${r.openedBy ?? ''} · „${r.openReason ?? ''}“ · do ${fmtDateTime(r.expiresAt)}` : `${r.requestedBy ?? ''} · „${r.requestReason ?? ''}“ · ${fmtDateTime(r.requestedAt)}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-1 text-xs">
        {r.status === 'requested' && (
          <>
            <button type="button" disabled={busy} onClick={() => void act('approve')} className="rounded bg-[#1E8449] px-2 py-1 font-medium text-white disabled:opacity-50">Otevřít (48 h)</button>
            <button type="button" disabled={busy} onClick={() => void act('decline')} className="rounded border border-rose-300 px-2 py-1 text-rose-800 disabled:opacity-50">Zamítnout</button>
          </>
        )}
        {r.status === 'open' && (
          <button type="button" disabled={busy} onClick={() => void act('cancel')} className="rounded border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-50">Zavřít</button>
        )}
      </div>
    </li>
  );
}

export { openForCorrection };
