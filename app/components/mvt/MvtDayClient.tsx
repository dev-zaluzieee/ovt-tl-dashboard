'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '../teams/TeamFilter';
import { STATE_UI, eventInTeam, fmtKc, fmtTime, ymd, type AppState, type TlDayEvent, type TlPerson } from './shared';
import { hoursLeftLabel } from './reopen';

/** States hidden in the default compact view — visible via the chips and the toggle. */
const QUIET: AppState[] = ['closed_raynet', 'closed_manual', 'unassigned'];
const QUEUE_MONTAZ = 'Bez montéra (fronta trasování)';
const QUEUE_REKLAMACE = 'Bez technika (fronta reklamací)';
const isComplaintCat = (c: number | null) => c != null && [222, 223, 348].includes(c);

/**
 * Přehled dne (MVT): every montér event of a day with its app state. Read-only
 * by decision (Karel, 2026-09-06) — links lead to the pages with actions.
 * Same state machine as Chybí výsledek and the montér app (2026-09-23).
 */
export function MvtDayClient() {
  // Date is filled after mount — server and browser can disagree on "today" (React #418).
  const [date, setDate] = useState('');
  useEffect(() => {
    setDate(ymd(new Date()));
  }, []);
  const [events, setEvents] = useState<TlDayEvent[]>([]);
  const [monters, setMonters] = useState<TlPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);
  const [monter, setMonter] = useState('');
  const [states, setStates] = useState<AppState[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!date) return;
      if (!silent) setLoading(true);
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
        setRefreshedAt(new Date());
      } catch {
        setError('Chyba spojení.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [date]
  );
  useEffect(() => {
    void load();
  }, [load]);
  // The page is watched during the day: refresh on return and every two minutes.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const t = setInterval(refresh, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(t);
    };
  }, [load]);

  const shift = (n: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + n);
    setDate(ymd(d));
  };

  /** Who the event belongs to: registry participants; the Montér field only on a montáž (inherited elsewhere). */
  const ownersOf = useCallback((e: TlDayEvent): string[] => {
    if (e.monters.length) return e.monters.map((m) => m.name);
    if (e.categoryId === 221 && e.monterName) return [e.monterName];
    return [isComplaintCat(e.categoryId) ? QUEUE_REKLAMACE : QUEUE_MONTAZ];
  }, []);
  const selectedMonterName = useMemo(() => monters.find((m) => String(m.raynetId) === monter)?.name ?? null, [monters, monter]);

  const visible = useMemo(
    () =>
      events.filter(
        (e) =>
          eventInTeam(e, team?.memberRaynetIds ?? null) &&
          (!monter || e.monters.some((m) => String(m.raynetId) === monter) || (e.categoryId === 221 && !!selectedMonterName && e.monterName === selectedMonterName)) &&
          (states.length === 0 ? showAll || !QUIET.includes(e.appState) : states.includes(e.appState))
      ),
    [events, team, monter, selectedMonterName, states, showAll]
  );
  const counts = useMemo(() => events.reduce<Record<string, number>>((a, e) => ({ ...a, [e.appState]: (a[e.appState] ?? 0) + 1 }), {}), [events]);
  const toggleState = (s: AppState) => setStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const hiddenCount = useMemo(() => (showAll || states.length ? 0 : events.filter((e) => QUIET.includes(e.appState)).length), [events, showAll, states]);

  // Day totals — what a team leader scans at 17:00.
  const totals = useMemo(() => {
    const n = (...ss: AppState[]) => ss.reduce((a, s) => a + (counts[s] ?? 0), 0);
    return {
      app: n('done', 'zachrana', 'reklamace'),
      raynet: n('closed_raynet', 'closed_manual'),
      pastEnd: n('past_end'),
      missing: n('overdue', 'failed'),
      running: n('in_progress'),
      planned: n('planned'),
      reopened: n('reopened'),
      unassigned: n('unassigned'),
    };
  }, [counts]);

  const groups = useMemo(() => {
    const map = new Map<string, TlDayEvent[]>();
    for (const e of visible) for (const k of ownersOf(e)) map.set(k, [...(map.get(k) ?? []), e]);
    const rank = (k: string) => (k === QUEUE_MONTAZ ? 1 : k === QUEUE_REKLAMACE ? 2 : 0);
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], 'cs'));
  }, [visible, ownersOf]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">‹</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="button" onClick={() => shift(1)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">›</button>
          <button type="button" onClick={() => setDate(ymd(new Date()))} className="ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm">Dnes</button>
        </div>
        <TeamFilter
          workforce="mvt"
          value={teamId}
          onChange={(sel) => {
            setTeamId(sel?.id ?? null);
            setTeam(sel);
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700">Montér</span>
          <select value={monter} onChange={(e) => setMonter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">všichni</option>
            {monters.map((m) => (
              <option key={m.raynetId} value={m.raynetId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          zobrazit i uzavřené a frontu{hiddenCount ? ` (${hiddenCount})` : ''}
        </label>
        <button type="button" onClick={() => void load()} className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">
          Obnovit
        </button>
      </div>

      {!loading && events.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
          <span className="font-semibold text-gray-900">{events.length} událostí</span>
          <span className="text-green-800">přes aplikaci <b>{totals.app}</b></span>
          <span className="text-gray-700">v Raynetu <b>{totals.raynet}</b></span>
          {totals.reopened > 0 && <span className="text-amber-800">otevřeno k opravě <b>{totals.reopened}</b></span>}
          <span className="text-amber-800">skončilo, čeká na zápis <b>{totals.pastEnd}</b></span>
          <span className={totals.missing ? 'font-semibold text-rose-700' : 'text-gray-500'}>bez výsledku <b>{totals.missing}</b></span>
          <span className="text-blue-800">probíhá <b>{totals.running}</b></span>
          <span className="text-gray-600">naplánováno <b>{totals.planned}</b></span>
          <span className="text-gray-500">fronta <b>{totals.unassigned}</b></span>
          {refreshedAt && <span className="ml-auto text-xs text-gray-400">obnoveno {refreshedAt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {(Object.keys(STATE_UI) as AppState[])
          .filter((s) => counts[s])
          .map((s) => (
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

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {loading ? (
        <p className="py-8 text-center text-gray-500">Načítám…</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          {hiddenCount ? `Nic otevřeného. ${hiddenCount} uzavřených nebo nepřiřazených událostí je skryto — zapněte „zobrazit i uzavřené a frontu“.` : 'Žádné události pro tento den a filtr.'}
        </p>
      ) : (
        groups.map(([name, list]) => (
          <section key={name} className="rounded-lg border border-gray-200 bg-white">
            <h2 className="flex items-center justify-between border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-800">
              <span>{name}</span>
              <span className="text-xs font-normal text-gray-500">
                {list.length} {list.length === 1 ? 'událost' : list.length < 5 ? 'události' : 'událostí'}
              </span>
            </h2>
            <table className="min-w-full text-sm">
              <tbody>
                {list.map((e) => {
                  const partners = e.monters.filter((m) => m.name !== name);
                  const ui = STATE_UI[e.appState] ?? { label: e.appState, cls: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={`${name}-${e.id}`} className="border-t border-gray-100 align-top hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-700">
                        {fmtTime(e.scheduledFrom)}–{fmtTime(e.scheduledTill)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{e.categoryLabel}</span>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{e.customer ?? e.title ?? '—'}</p>
                        {e.address && <p className="text-xs text-gray-500">{e.address}</p>}
                        {partners.length > 0 && <p className="text-xs text-sky-700">ve dvou s {partners.map((m) => m.name).join(' a ')}</p>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {isComplaintCat(e.categoryId) ? (
                          e.claim ? (
                            <>
                              <a href={e.claim.portalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                Reklamace #{e.claim.id}
                              </a>{' '}
                              <span className="text-gray-800">{e.claim.statusLabel}</span>
                              {e.claim.blockerLabel && <span className="text-gray-500"> · čeká na {e.claim.blockerLabel}</span>}
                            </>
                          ) : (
                            <span className="text-amber-700">Reklamace v ERP nenalezena</span>
                          )
                        ) : e.zamerovac ? (
                          <>
                            Zaměřovač: <span className="text-gray-800">{e.zamerovac.name}</span>
                          </>
                        ) : (
                          <span className="text-amber-700">Zaměření nenalezeno</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ui.cls}`}>{ui.label}</span>
                        {e.appState === 'closed_manual' && <p className="mt-1 text-xs text-gray-500">{e.categoryId === 221 ? `Stav zakázky: ${e.stavZakazky}` : 'Dokončeno: Ano'} · bez „Mám hotovo“</p>}
                        {e.reopen?.isOpen && (
                          <p className="mt-1 text-xs text-amber-800">
                            zbývá {hoursLeftLabel(e.reopen.expiresAt)}
                            {e.reopen.openedBy ? ` · ${e.reopen.openedBy}` : ''}
                            {e.reopen.openReason ? ` · „${e.reopen.openReason}“` : ''}
                          </p>
                        )}
                        {e.reopen?.status === 'requested' && <p className="mt-1 text-xs text-sky-800">žádost o otevření čeká{e.reopen.requestReason ? ` · „${e.reopen.requestReason}“` : ''}</p>}
                        {e.outcome && (
                          <p className="mt-1 text-xs text-gray-600">
                            {e.outcome.vybranoKolik != null && (
                              <>
                                {fmtKc(e.outcome.vybranoKolik)}
                                {e.outcome.zpusobUhrady ? ` · ${e.outcome.zpusobUhrady}` : ''}
                              </>
                            )}
                            {e.outcome.slevaMvt ? <> · sleva {fmtKc(e.outcome.slevaMvt)}</> : null}
                            {e.outcome.status === 'PARTIAL_SUCCESS' && <span className="ml-1 text-amber-700">· ERP nezapsáno</span>}
                            {e.outcome.erpUnpaired && <span className="ml-1 font-medium text-rose-700">· ERP nezapsáno (bez párování)</span>}
                            {e.outcome.duvod && <span className="ml-1 text-rose-700">· {e.outcome.duvod}</span>}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                        {e.outcome && (
                          <Link href={`/mvt/zapisy/${e.outcome.id}`} className="mr-2 text-blue-600 hover:underline">
                            Zápis
                          </Link>
                        )}
                        {(e.appState === 'overdue' || e.appState === 'closed_manual') && (
                          <Link href="/mvt/nedokoncene" className="mr-2 text-blue-600 hover:underline">
                            Chybí výsledek
                          </Link>
                        )}
                        {(e.appState === 'failed' || e.outcome?.status === 'PARTIAL_SUCCESS' || e.outcome?.erpUnpaired || e.reopen?.status === 'requested') && (
                          <Link href="/mvt/problematicke-zakazky" className="mr-2 text-blue-600 hover:underline">
                            Problematické
                          </Link>
                        )}
                        {e.erpUrl && (
                          <a href={e.erpUrl} target="_blank" rel="noopener noreferrer" className="mr-2 text-blue-600 hover:underline">
                            ERP
                          </a>
                        )}
                        <a href={e.raynetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Raynet
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
