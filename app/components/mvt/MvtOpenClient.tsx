'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '../teams/TeamFilter';
import { eventInTeam, fmtDateTime, ymd, type TlDayEvent } from './shared';
import { openForCorrection } from './reopen';

type OpenKind = 'no_outcome' | 'closed_outside';
type CloseReason = 'pripomenuto' | 'uzavreno_v_raynetu' | 'netyka_se';
interface OpenItem {
  kind: OpenKind;
  event: TlDayEvent;
  reason: string;
  ageHours: number;
  mark: { note: string | null; marked_by_email: string; created_at: string } | null;
  resolution: { reason: string; note: string | null; resolved_by: string; resolved_at: string } | null;
}
interface OpenResult {
  missing: OpenItem[];
  older: OpenItem[];
  closedOutsideApp: OpenItem[];
  closedOutsideCount: number;
  byMonter: { name: string; raynetId: number | null; missing: number; older: number }[];
  handledCount: number;
  recentDays: number;
}

const REASON_LABEL: Record<string, string> = {
  pripomenuto: 'Připomenuto montérovi',
  uzavreno_v_raynetu: 'Uzavřeno v Raynetu',
  netyka_se: 'Netýká se / neplatí',
};

function age(h: number): string {
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'den' : d < 5 ? 'dny' : 'dní'}`;
}

/**
 * "Chybí výsledek" — one question only: which finished job has no result recorded.
 * Failed writes, ERP problems and reklamace waiting for a follow-up moved to
 * Problematické zakázky (they need a decision). Rows closed in Raynet without the
 * app are kept apart, and anything older than a week sits in its own backlog, so
 * the handful that matter today are visible (Karel, 2026-09-22).
 */
export function MvtOpenClient() {
  // Dates are filled after mount: the server and the browser can disagree on
  // "today", so the SSR markup differed from the first client render (React #418).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    setFrom(ymd(new Date(Date.now() - 13 * 86_400_000)));
    setTo(ymd(new Date()));
  }, []);
  const [includeHandled, setIncludeHandled] = useState(false);
  const [data, setData] = useState<OpenResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvt-open?from=${from}&to=${to}&include_marked=${includeHandled}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      // Tolerate the previous flat shape ({ items, markedCount }) so a backend /
      // portal deploy skew shows data instead of an empty page.
      const d = json.data as Partial<OpenResult> & { items?: OpenItem[]; markedCount?: number };
      setData({
        missing: d.missing ?? (d.items ?? []).filter((i) => i.kind !== 'closed_outside'),
        older: d.older ?? [],
        closedOutsideApp: d.closedOutsideApp ?? [],
        closedOutsideCount: d.closedOutsideCount ?? (d.closedOutsideApp ?? []).length,
        byMonter: d.byMonter ?? [],
        handledCount: d.handledCount ?? d.markedCount ?? 0,
        recentDays: d.recentDays ?? 7,
      });
    } catch {
      setError('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  }, [from, to, includeHandled]);
  useEffect(() => {
    void load();
  }, [load]);

  const inTeam = useCallback((it: OpenItem) => eventInTeam(it.event, team?.memberRaynetIds ?? null), [team]);
  const missing = useMemo(() => (data?.missing ?? []).filter(inTeam), [data, inTeam]);
  const older = useMemo(() => (data?.older ?? []).filter(inTeam), [data, inTeam]);
  const closed = useMemo(() => (data?.closedOutsideApp ?? []).filter(inTeam), [data, inTeam]);
  const byMonter = useMemo(() => {
    if (!team?.memberRaynetIds) return data?.byMonter ?? [];
    const names = new Set([...missing, ...older].flatMap((i) => i.event.monters.map((m) => m.name)));
    return (data?.byMonter ?? []).filter((r) => names.has(r.name));
  }, [data, team, missing, older]);

  const close = async (it: OpenItem) => {
    const reason = window.prompt(
      `Uzavřít — ${it.event.customer ?? it.event.id}.\nDůvod: pripomenuto / uzavreno_v_raynetu / netyka_se`,
      it.kind === 'closed_outside' ? 'uzavreno_v_raynetu' : 'pripomenuto'
    );
    if (reason == null) return;
    const r = reason.trim().toLowerCase() as CloseReason;
    if (!['pripomenuto', 'uzavreno_v_raynetu', 'netyka_se'].includes(r)) {
      window.alert('Zadejte pripomenuto, uzavreno_v_raynetu nebo netyka_se.');
      return;
    }
    const note = window.prompt('Poznámka (nepovinná):', '') ?? '';
    setBusy(it.event.id);
    try {
      await fetch(`/api/mvt-open/${it.event.id}/mark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: r, note }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };
  const reopenRow = async (it: OpenItem) => {
    setBusy(it.event.id);
    try {
      await fetch(`/api/mvt-open/${it.event.id}/mark`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ it }: { it: OpenItem }) => (
    <tr className={`border-t border-gray-100 align-top ${it.mark || it.resolution ? 'opacity-60' : ''}`}>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{age(it.ageHours)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtDateTime(it.event.scheduledFrom)}</td>
      <td className="px-3 py-2">{it.event.monters.map((m) => m.name).join(', ') || it.event.monterName || '—'}</td>
      <td className="px-3 py-2">
        <p className="font-medium text-gray-900">{it.event.customer ?? it.event.title ?? '—'}</p>
        {it.event.address && <p className="text-xs text-gray-500">{it.event.address}</p>}
        <p className="mt-1 max-w-md text-xs text-gray-600">{it.reason}</p>
        {(it.resolution || it.mark) && (
          <p className="mt-1 text-xs text-gray-500">
            Uzavřeno · {it.resolution ? REASON_LABEL[it.resolution.reason] ?? it.resolution.reason : 'Vyřízeno'} ·{' '}
            {it.resolution?.resolved_by ?? it.mark?.marked_by_email}
            {(it.resolution?.note ?? it.mark?.note) ? ` · ${it.resolution?.note ?? it.mark?.note}` : ''}
          </p>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-gray-600">{it.event.categoryLabel}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        <a href={it.event.raynetUrl} target="_blank" rel="noopener noreferrer" className="mr-2 text-blue-600 hover:underline">
          Raynet
        </a>
        {it.kind === 'closed_outside' && it.event.reopen?.status !== 'open' && (
          <button
            type="button"
            disabled={busy === it.event.id}
            onClick={async () => {
              setBusy(it.event.id);
              try {
                if (await openForCorrection(it.event.id, it.event.customer ?? String(it.event.id))) await load();
              } finally {
                setBusy(null);
              }
            }}
            className="mr-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 disabled:opacity-50"
          >
            Otevřít k opravě
          </button>
        )}
        {it.mark || it.resolution ? (
          <button type="button" disabled={busy === it.event.id} onClick={() => void reopenRow(it)} className="rounded border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-50">
            Vrátit
          </button>
        ) : (
          <button type="button" disabled={busy === it.event.id} onClick={() => void close(it)} className="rounded bg-[#1E8449] px-2 py-1 font-medium text-white disabled:opacity-50">
            Uzavřít
          </button>
        )}
      </td>
    </tr>
  );

  const Table = ({ items, empty }: { items: OpenItem[]; empty: string }) => (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">Čeká</th>
            <th className="px-3 py-2">Termín</th>
            <th className="px-3 py-2">Montér</th>
            <th className="px-3 py-2">Zákazník</th>
            <th className="px-3 py-2">Typ</th>
            <th className="px-3 py-2">Akce</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                {empty}
              </td>
            </tr>
          ) : (
            items.map((it) => <Row key={`${it.kind}-${it.event.id}`} it={it} />)
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Od<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Do<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <TeamFilter
          workforce="mvt"
          value={teamId}
          onChange={(sel) => {
            setTeamId(sel?.id ?? null);
            setTeam(sel);
          }}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeHandled} onChange={(e) => setIncludeHandled(e.target.checked)} />
          zobrazit uzavřené ({data?.handledCount ?? 0})
        </label>
        <button type="button" onClick={() => void load()} className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">
          Obnovit
        </button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {loading && <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">Načítám…</div>}

      {!loading && data && (
        <>
          {byMonter.length > 0 && (
            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h2 className="text-sm font-semibold text-gray-900">Kdo dluží výsledek</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {byMonter.map((m) => (
                  <span key={m.name} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800">
                    {m.name} <b className="text-rose-700">{m.missing}</b>
                    {m.older > 0 && <span className="text-gray-500"> (+{m.older} starší)</span>}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">
              Chybí výsledek <span className="text-gray-500">· posledních {data.recentDays} dní · {missing.length}</span>
            </h2>
            <p className="mb-2 text-xs text-gray-500">Termín uplynul a není zaznamenaný žádný výsledek — ani v aplikaci, ani v Raynetu.</p>
            <Table items={missing} empty="Vše z posledních dnů má výsledek. 🎉" />
          </section>

          <section>
            <button type="button" onClick={() => setShowOlder((v) => !v)} className="text-sm font-semibold text-gray-900">
              {showOlder ? '▾' : '▸'} Starší než {data.recentDays} dní <span className="text-gray-500">· {older.length}</span>
            </button>
            {showOlder && (
              <div className="mt-2">
                <p className="mb-2 text-xs text-gray-500">Nedořešený backlog. Projděte ho hromadně a uzavřete s důvodem.</p>
                <Table items={older} empty="Žádný starší backlog." />
              </div>
            )}
          </section>

          <section>
            <button type="button" onClick={() => setShowClosed((v) => !v)} className="text-sm font-semibold text-gray-900">
              {showClosed ? '▾' : '▸'} Uzavřeno mimo aplikaci <span className="text-gray-500">· {data.closedOutsideCount}</span>
            </button>
            {showClosed && (
              <div className="mt-2">
                <p className="mb-2 text-xs text-gray-500">
                  Hotovo v Raynetu, ale ne přes aplikaci. Není to problém zakázky, ale ukazuje to, jak se aplikace zavádí.
                  {data.closedOutsideCount > closed.length && <> Zobrazeno {closed.length} z {data.closedOutsideCount}.</>}
                </p>
                <Table items={closed} empty="Vše dokončené prošlo aplikací." />
              </div>
            )}
          </section>

          <p className="text-xs text-gray-500">
            Nezdařené zápisy, nezapsané ERP a reklamace čekající na naplánování najdete na{' '}
            <Link href="/mvt/problematicke-zakazky" className="text-blue-600 hover:underline">
              Problematických zakázkách
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
