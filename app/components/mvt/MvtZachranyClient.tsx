'use client';

/**
 * Záchrany — "dokončeno se záchranou": montér finished the job despite a
 * defect, usually by improvising on site. This is a READING report (Karel,
 * 2026-10-08, replaces the never-built "Výsledky montérů"): the free text the
 * montér typed is the only place that says what was actually wrong, and it was
 * previously buried in the submission detail where nobody opened it.
 *
 * Filters: period, team, montér, workflow, and "jen s textem" — plus a search
 * that looks INSIDE the text, because that is what a TL wants ("plisé", "síť").
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TeamFilter, type TeamSelection } from '../teams/TeamFilter';
import { eventInTeam, fmtDateTime, ymd, WORKFLOW_LABEL, type TlDayEvent } from './shared';

export interface ZachranaItem {
  outcomeId: number;
  workflow: string;
  submittedAt: string;
  monterName: string | null;
  monterRaynetId: number;
  event: TlDayEvent | null;
  eventId: number;
  orderId: number | null;
  erpOrderId: number | null;
  erpUrl: string | null;
  orderUrl: string | null;
  infoKZachrane: string | null;
  infoKeSleve: string | null;
  slevaMvt: number | null;
  komentar: string | null;
  vybranoKolik: number | null;
  zpusobUhrady: string | null;
}

const kc = (n: number | null | undefined) =>
  n == null ? '—' : `${new Intl.NumberFormat('cs-CZ').format(n)} Kč`;

export function MvtZachranyClient() {
  // Dates are computed on the client to avoid a server/client mismatch; the
  // lazy initialiser keeps them out of an effect (react-hooks/set-state-in-effect).
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [items, setItems] = useState<ZachranaItem[]>([]);
  const [totalSleva, setTotalSleva] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [team, setTeam] = useState<TeamSelection | null>(null);
  const [monter, setMonter] = useState('');
  const [workflow, setWorkflow] = useState('');
  const [onlyText, setOnlyText] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvt-zachrany?from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setItems((json.data?.items ?? []) as ZachranaItem[]);
      setTotalSleva(json.data?.totalSleva ?? 0);
    } catch {
      setError('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    void load();
  }, [load]);

  const monteri = useMemo(
    () => [...new Set(items.map((i) => i.monterName).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'cs')),
    [items]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      // Same fallback as the sibling reports: without event details, judge the
      // team by the montér who submitted it.
      const ids = team?.memberRaynetIds ?? null;
      const inTeam = i.event
        ? eventInTeam(i.event, ids)
        : !ids || ids.map(String).includes(String(i.monterRaynetId));
      if (!inTeam) return false;
      if (monter && i.monterName !== monter) return false;
      if (workflow && i.workflow !== workflow) return false;
      const text = [i.infoKZachrane, i.infoKeSleve, i.komentar].filter(Boolean).join(' ');
      if (onlyText && !text.trim()) return false;
      if (q) {
        const hay = `${text} ${i.event?.customer ?? ''} ${i.monterName ?? ''} ${i.orderId ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, team, monter, workflow, onlyText, search]);

  const withText = visible.filter((i) => (i.infoKZachrane || i.infoKeSleve || i.komentar || '').trim()).length;
  const slevaVisible = visible.reduce((s, i) => s + (i.slevaMvt ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Od
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Do
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <TeamFilter
          workforce="mvt"
          value={teamId}
          onChange={(sel) => {
            setTeamId(sel?.id ?? null);
            setTeam(sel);
          }}
        />
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Montér
          <select value={monter} onChange={(e) => setMonter(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">Všichni</option>
            {monteri.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Typ
          <select value={workflow} onChange={(e) => setWorkflow(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">Vše</option>
            {Object.entries(WORKFLOW_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Hledat v textu
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="např. plisé, síť, zákazník…"
            className="w-52 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyText} onChange={(e) => setOnlyText(e.target.checked)} />
          jen s popisem
        </label>
        <button type="button" onClick={() => void load()} className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">
          Obnovit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Záchran', visible.length],
          ['S popisem', withText],
          ['Bez popisu', visible.length - withText],
          ['Slevy montérů', kc(slevaVisible)],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">{l}</div>
            <div className="text-xl font-semibold text-gray-900">{v}</div>
          </div>
        ))}
      </div>
      {totalSleva !== slevaVisible && (
        <p className="text-xs text-gray-500">Za celé období bez filtrů: {kc(totalSleva)} slev.</p>
      )}

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Kdy / montér</th>
              <th className="px-3 py-2">Zákazník</th>
              <th className="px-3 py-2">Důvod záchrany</th>
              <th className="px-3 py-2">Sleva</th>
              <th className="px-3 py-2">Odkazy</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                  Načítám…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                  Žádné záchrany v tomto období.
                </td>
              </tr>
            ) : (
              visible.map((i) => (
                <tr key={i.outcomeId} className="border-t border-gray-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2">
                    <p className="text-gray-800">{fmtDateTime(i.submittedAt)}</p>
                    <p className="text-xs text-gray-500">
                      {i.monterName ?? '—'} · {WORKFLOW_LABEL[i.workflow] ?? i.workflow}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-gray-900">{i.event?.customer ?? '—'}</p>
                    {i.event?.address && <p className="text-xs text-gray-500">{i.event.address}</p>}
                  </td>
                  <td className="max-w-[460px] px-3 py-2">
                    {i.infoKZachrane ? (
                      <p className="whitespace-pre-wrap text-gray-900">{i.infoKZachrane}</p>
                    ) : (
                      <p className="text-xs italic text-gray-400">Montér popis nevyplnil.</p>
                    )}
                    {i.infoKeSleve && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                        <span className="font-medium">Ke slevě:</span> {i.infoKeSleve}
                      </p>
                    )}
                    {i.komentar && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                        <span className="font-medium">Komentář:</span> {i.komentar}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <p className={i.slevaMvt ? 'font-medium text-amber-700' : 'text-gray-400'}>{i.slevaMvt ? kc(i.slevaMvt) : '—'}</p>
                    {i.vybranoKolik != null && (
                      <p className="text-xs text-gray-500">
                        vybráno {kc(i.vybranoKolik)}
                        {i.zpusobUhrady ? ` · ${i.zpusobUhrady}` : ''}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                      <Link href={`/mvt/zapisy/${i.outcomeId}`} className="text-blue-600 hover:underline">
                        Zápis
                      </Link>
                      {i.event?.raynetUrl && (
                        <a href={i.event.raynetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Raynet
                        </a>
                      )}
                      {i.erpUrl && (
                        <a href={i.erpUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          ERP
                        </a>
                      )}
                      {i.orderUrl && (
                        <a href={i.orderUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Objednávka
                        </a>
                      )}
                    </div>
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
