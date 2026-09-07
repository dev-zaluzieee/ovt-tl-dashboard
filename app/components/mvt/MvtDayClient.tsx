'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '../teams/TeamFilter';
import { STATE_UI, eventInTeam, fmtKc, fmtTime, ymd, type AppState, type TlDayEvent, type TlPerson } from './shared';

/** Přehled dne (MVT): every montér event of a day with its app state. Read-only. */
export function MvtDayClient() {
  const [date, setDate] = useState(() => ymd(new Date()));
  const [events, setEvents] = useState<TlDayEvent[]>([]);
  const [monters, setMonters] = useState<TlPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);
  const [monter, setMonter] = useState('');
  const [states, setStates] = useState<AppState[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvt-day?date=${date}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setEvents(json.data.events ?? []);
      setMonters(json.data.monters ?? []);
    } catch {
      setError('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  }, [date]);
  useEffect(() => {
    void load();
  }, [load]);

  const shift = (n: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + n);
    setDate(ymd(d));
  };

  const visible = useMemo(
    () =>
      events.filter(
        (e) =>
          eventInTeam(e, team?.memberRaynetIds ?? null) &&
          (!monter || e.monters.some((m) => String(m.raynetId) === monter) || (e.monterName ?? '') === monter) &&
          (states.length === 0 || states.includes(e.appState))
      ),
    [events, team, monter, states]
  );
  const counts = useMemo(() => events.reduce<Record<string, number>>((a, e) => ({ ...a, [e.appState]: (a[e.appState] ?? 0) + 1 }), {}), [events]);
  const toggleState = (s: AppState) => setStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Group rows by montér for scanning; events with several montéři appear under each.
  const groups = useMemo(() => {
    const map = new Map<string, TlDayEvent[]>();
    for (const e of visible) {
      const keys = e.monters.length ? e.monters.map((m) => m.name) : [e.monterName || 'Bez montéra (fronta trasování)'];
      for (const k of keys) map.set(k, [...(map.get(k) ?? []), e]);
    }
    const QUEUE = 'Bez montéra (fronta trasování)';
    return [...map.entries()].sort((a, b) => (a[0] === QUEUE ? 1 : b[0] === QUEUE ? -1 : a[0].localeCompare(b[0], 'cs')));
  }, [visible]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">‹</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="button" onClick={() => shift(1)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">›</button>
          <button type="button" onClick={() => setDate(ymd(new Date()))} className="ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm">Dnes</button>
        </div>
        <TeamFilter workforce="mvt" value={teamId} onChange={(sel) => { setTeamId(sel?.id ?? null); setTeam(sel); }} />
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700">Montér</span>
          <select value={monter} onChange={(e) => setMonter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">všichni</option>
            {monters.map((m) => (
              <option key={m.raynetId} value={m.raynetId}>{m.name}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(STATE_UI) as AppState[]).filter((s) => counts[s]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleState(s)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATE_UI[s].cls} ${states.includes(s) ? 'ring-2 ring-gray-500 ring-offset-1' : 'opacity-80'}`}
            >
              {STATE_UI[s].label} · {counts[s]}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">Obnovit</button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {loading ? (
        <p className="py-8 text-center text-gray-500">Načítám…</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-gray-500">Žádné události pro tento den a filtr.</p>
      ) : (
        groups.map(([name, list]) => (
          <section key={name} className="rounded-lg border border-gray-200 bg-white">
            <h2 className="flex items-center justify-between border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-800">
              <span>{name}</span>
              <span className="text-xs font-normal text-gray-500">{list.length} {list.length === 1 ? 'událost' : 'událostí'}</span>
            </h2>
            <table className="min-w-full text-sm">
              <tbody>
                {list.map((e) => (
                  <tr key={`${name}-${e.id}`} className="border-t border-gray-100 align-top hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-700">{fmtTime(e.scheduledFrom)}–{fmtTime(e.scheduledTill)}</td>
                    <td className="px-3 py-2"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{e.categoryLabel}</span></td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{e.customer ?? e.title ?? '—'}</p>
                      {e.address && <p className="text-xs text-gray-500">{e.address}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {e.zamerovac ? <>Zaměřovač: <span className="text-gray-800">{e.zamerovac.name}</span></> : <span className="text-amber-700">Zaměření nenalezeno</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_UI[e.appState].cls}`}>{STATE_UI[e.appState].label}</span>
                      {e.outcome && (
                        <p className="mt-1 text-xs text-gray-600">
                          {e.outcome.vybranoKolik != null && <>{fmtKc(e.outcome.vybranoKolik)}{e.outcome.zpusobUhrady ? ` · ${e.outcome.zpusobUhrady}` : ''}</>}
                          {e.outcome.slevaMvt ? <> · sleva {fmtKc(e.outcome.slevaMvt)}</> : null}
                          {e.outcome.status === 'PARTIAL_SUCCESS' && <span className="ml-1 text-amber-700">· ERP nezapsáno</span>}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                      {e.outcome && <Link href={`/mvt/zapisy/${e.outcome.id}`} className="mr-2 text-blue-600 hover:underline">Zápis</Link>}
                      <a href={e.raynetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Raynet</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
