'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '../teams/TeamFilter';
import { STATE_UI, eventInTeam, fmtDateTime, ymd, type TlDayEvent } from './shared';

type OpenKind = 'no_outcome' | 'erp_failed' | 'failed' | 'reklamace_waiting';
interface OpenItem {
  kind: OpenKind;
  event: TlDayEvent;
  reason: string;
  ageHours: number;
  mark: { note: string | null; marked_by_email: string; created_at: string } | null;
}
const KIND_UI: Record<OpenKind, { label: string; cls: string }> = {
  no_outcome: { label: 'Bez výsledku', cls: 'bg-rose-100 text-rose-800' },
  erp_failed: { label: 'ERP nezapsáno', cls: 'bg-amber-100 text-amber-800' },
  failed: { label: 'Zápis selhal', cls: 'bg-red-100 text-red-800' },
  reklamace_waiting: { label: 'Reklamace čeká', cls: 'bg-purple-100 text-purple-800' },
};

function age(h: number): string {
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'den' : d < 5 ? 'dny' : 'dní'}`;
}

/** Nedokončené montáže: the MVT team leader's work list, with "Vyřízeno" marks. */
export function MvtOpenClient() {
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 13 * 86_400_000)));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [includeMarked, setIncludeMarked] = useState(false);
  const [items, setItems] = useState<OpenItem[]>([]);
  const [markedCount, setMarkedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);
  const [kinds, setKinds] = useState<OpenKind[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvt-open?from=${from}&to=${to}&include_marked=${includeMarked}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setItems(json.data.items ?? []);
      setMarkedCount(json.data.markedCount ?? 0);
    } catch {
      setError('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  }, [from, to, includeMarked]);
  useEffect(() => {
    void load();
  }, [load]);

  const mark = async (it: OpenItem) => {
    const note = window.prompt(`Označit jako vyřízené — ${it.event.customer ?? it.event.id}. Poznámka (nepovinná):`, '');
    if (note === null) return;
    setBusy(it.event.id);
    try {
      await fetch(`/api/mvt-open/${it.event.id}/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
      await load();
    } finally {
      setBusy(null);
    }
  };
  const unmark = async (it: OpenItem) => {
    setBusy(it.event.id);
    try {
      await fetch(`/api/mvt-open/${it.event.id}/mark`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(
    () => items.filter((i) => eventInTeam(i.event, team?.memberRaynetIds ?? null) && (kinds.length === 0 || kinds.includes(i.kind))),
    [items, team, kinds]
  );
  const counts = useMemo(() => items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {}), [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">Od<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">Do<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" /></label>
        <TeamFilter workforce="mvt" value={teamId} onChange={(sel) => { setTeamId(sel?.id ?? null); setTeam(sel); }} />
        <div className="flex flex-wrap gap-1">
          {(Object.keys(KIND_UI) as OpenKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${KIND_UI[k].cls} ${kinds.includes(k) ? 'ring-2 ring-gray-500 ring-offset-1' : 'opacity-80'}`}
            >
              {KIND_UI[k].label} · {counts[k] ?? 0}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeMarked} onChange={(e) => setIncludeMarked(e.target.checked)} />
          zobrazit vyřízené ({markedCount})
        </label>
        <button type="button" onClick={() => void load()} className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">Obnovit</button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Proč</th>
              <th className="px-3 py-2">Čeká</th>
              <th className="px-3 py-2">Termín</th>
              <th className="px-3 py-2">Montér</th>
              <th className="px-3 py-2">Zákazník</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Načítám…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Nic nevyřízeného. 🎉</td></tr>
            ) : (
              visible.map((it) => (
                <tr key={`${it.kind}-${it.event.id}`} className={`border-t border-gray-100 align-top ${it.mark ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${KIND_UI[it.kind].cls}`}>{KIND_UI[it.kind].label}</span>
                    <p className="mt-1 max-w-xs text-xs text-gray-600">{it.reason}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{age(it.ageHours)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtDateTime(it.event.scheduledFrom)}</td>
                  <td className="px-3 py-2">{it.event.monters.map((m) => m.name).join(', ') || it.event.monterName || '—'}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">{it.event.customer ?? it.event.title ?? '—'}</p>
                    {it.event.address && <p className="text-xs text-gray-500">{it.event.address}</p>}
                    {it.event.zamerovac && <p className="text-xs text-gray-500">Zaměřovač: {it.event.zamerovac.name}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_UI[it.event.appState].cls}`}>{STATE_UI[it.event.appState].label}</span>
                    {it.mark && <p className="mt-1 text-xs text-gray-500">Vyřízeno · {it.mark.marked_by_email}{it.mark.note ? ` · ${it.mark.note}` : ''}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <a href={it.event.raynetUrl} target="_blank" rel="noopener noreferrer" className="mr-2 text-blue-600 hover:underline">Raynet</a>
                    {it.event.outcome && <Link href={`/mvt/zapisy/${it.event.outcome.id}`} className="mr-2 text-blue-600 hover:underline">Zápis</Link>}
                    {it.mark ? (
                      <button type="button" disabled={busy === it.event.id} onClick={() => void unmark(it)} className="rounded border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-50">Vrátit</button>
                    ) : (
                      <button type="button" disabled={busy === it.event.id} onClick={() => void mark(it)} className="rounded bg-[#1E8449] px-2 py-1 font-medium text-white disabled:opacity-50">Vyřízeno</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
