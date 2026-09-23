'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDateTime, fmtKc, fmtTime, ymd } from './shared';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';

const ERP_BASE = (process.env.NEXT_PUBLIC_ERP_BASE_URL?.replace(/\/$/, '')) || 'https://systeeem.cz';
const erpOrderLink = (id: number) => `${ERP_BASE}/orders/${id}`;

type Status = 'linked' | 'office' | 'auto_high' | 'auto_medium' | 'ambiguous' | 'unpaired' | 'no_order';
interface Candidate {
  id: number; name: string | null; phone: string | null; address: string | null; city: string | null; createdAt: string; erpOrderId: number | null;
  userId: string | null; admfCount: number; admfExported: boolean; doplatek: number | null; via: ('client' | 'phone' | 'email' | 'address')[];
}
interface Row {
  eventId: number; scheduledFrom: string | null; scheduledTill: string | null; title: string | null; customer: string | null; address: string | null; phone: string | null;
  monteri: string[]; raynetUrl: string; status: Status; orderId: number | null;
  auto: { orderId: number; method: string; confidence: string; matched: string } | null;
  candidates: Candidate[];
  office: { decision: 'paired' | 'no_order'; order_id: number | null; decided_by: string; decided_at: string; note: string | null; raynet_linked: boolean } | null;
  hasSubmission: boolean;
}
interface Day { date: string; total: number; unresolved: Row[]; uncertain: Row[]; settled: Row[] }

const STATUS_UI: Record<Status, { label: string; cls: string }> = {
  linked: { label: 'Odkaz v Raynetu', cls: 'bg-green-100 text-green-800' },
  office: { label: 'Spárováno kanceláří', cls: 'bg-green-100 text-green-800' },
  auto_high: { label: 'Automaticky · jisté', cls: 'bg-emerald-50 text-emerald-800' },
  auto_medium: { label: 'Automaticky · nejisté', cls: 'bg-amber-100 text-amber-800' },
  ambiguous: { label: 'Více možností', cls: 'bg-rose-100 text-rose-800' },
  unpaired: { label: 'Nespárováno', cls: 'bg-rose-100 text-rose-800' },
  no_order: { label: 'Bez objednávky', cls: 'bg-gray-200 text-gray-700' },
};
const VIA: Record<string, string> = { client: 'klient', phone: 'telefon', email: 'e-mail', address: 'adresa' };
const zamerovac = (u: string | null) => {
  const m = /^([a-z]+)\.([a-z]+)@/i.exec(u ?? '');
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2][0].toUpperCase()}${m[2].slice(1)}` : u ?? '—';
};

function Candidates({ row, onPair, busy }: { row: Row; onPair: (orderId: number) => void; busy: boolean }) {
  if (row.candidates.length === 0) return <p className="text-xs text-gray-500">Žádná objednávka v našem systému neodpovídá klientovi, telefonu, e-mailu ani adrese.</p>;
  return (
    <ul className="space-y-1.5">
      {row.candidates.map((c) => {
        const chosen = row.orderId === c.id;
        return (
          <li key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 text-sm ${chosen ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
            <a href={officePortalOrderDeepLink(c.id)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline" title="Objednávka v kancelářském portálu (zaměření, formuláře)">#{c.id}</a>
            <span className="text-gray-900">{c.name ?? '—'}</span>
            <span className="text-xs text-gray-500">{[c.address, c.city].filter(Boolean).join(', ')}</span>
            <span className="text-xs text-gray-500">zaměření {fmtDateTime(c.createdAt).slice(0, 10)} · {zamerovac(c.userId)}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${c.admfExported ? 'bg-emerald-100 text-emerald-800' : c.admfCount ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              {c.admfExported ? 'ADMF objednána' : c.admfCount ? `ADMF ${c.admfCount}× neobjednána` : 'bez ADMF'}
            </span>
            {c.doplatek != null && <span className="text-xs text-gray-600">doplatek {fmtKc(c.doplatek)}</span>}
            {c.erpOrderId && (
              <a href={erpOrderLink(c.erpOrderId)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline" title="Zakázka v ERP">
                ERP #{c.erpOrderId}
              </a>
            )}
            <span className="text-[11px] text-gray-400">shoda: {c.via.map((v) => VIA[v]).join(', ')}</span>
            <button type="button" disabled={busy || chosen} onClick={() => onPair(c.id)} className={`ml-auto rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${chosen ? 'border border-green-300 text-green-800' : 'bg-[#1E8449] text-white'}`}>
              {chosen ? (row.status === 'auto_medium' ? 'Potvrdit' : 'Vybráno') : 'Spárovat'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Párování montáží — the office pairs tomorrow's uncertain events; one day per load. */
export function MvtPairingClient() {
  const [date, setDate] = useState('');
  useEffect(() => {
    setDate(ymd(new Date(Date.now() + 86_400_000)));
  }, []);
  const [data, setData] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [manual, setManual] = useState<Record<number, string>>({});
  const [q, setQ] = useState('');
  const [monterFilter, setMonterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [onlyWithSubmission, setOnlyWithSubmission] = useState(false);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mvt-pairing?date=${date}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        return;
      }
      setData(json.data as Day);
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
  const act = async (row: Row, body: Record<string, unknown>) => {
    setBusy(row.eventId);
    try {
      const res = await fetch(`/api/mvt-pairing/${row.eventId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) window.alert(j?.error || j?.message || `Nepodařilo se (HTTP ${res.status}).`);
      await load();
    } finally {
      setBusy(null);
    }
  };
  const undo = async (row: Row) => {
    if (!window.confirm(`Zrušit rozhodnutí kanceláře u události ${row.eventId}? Odkaz v Raynetu zůstane, odstraňte ho ručně.`)) return;
    setBusy(row.eventId);
    try {
      await fetch(`/api/mvt-pairing/${row.eventId}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const RowCard = ({ row }: { row: Row }) => {
    const ui = STATUS_UI[row.status] ?? { label: row.status, cls: 'bg-gray-100 text-gray-700' };
    return (
      <li className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-gray-700">{fmtTime(row.scheduledFrom)}–{fmtTime(row.scheduledTill)}</span>
              <span className="font-semibold text-gray-900">{row.customer ?? row.title ?? `Událost ${row.eventId}`}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ui.cls}`}>{ui.label}</span>
              {row.hasSubmission && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">už zapsáno v aplikaci</span>}
            </p>
            <p className="text-xs text-gray-500">
              {row.address ?? '—'}{row.phone ? ` · ${row.phone}` : ''} · {row.monteri.join(', ') || 'bez montéra'}
              {row.title && row.customer ? ` · ${row.title}` : ''}
            </p>
            {row.auto && (
              <p className="mt-1 text-xs text-gray-600">
                Automaticky:{' '}
                <a href={officePortalOrderDeepLink(row.auto.orderId)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  objednávka #{row.auto.orderId}
                </a>{' '}
                — {row.auto.matched}
              </p>
            )}
            {row.office && (
              <p className="mt-1 text-xs text-gray-600">
                Kancelář:{' '}
                {row.office.decision === 'no_order' ? (
                  'bez objednávky'
                ) : (
                  <a href={officePortalOrderDeepLink(row.office.order_id ?? 0)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    objednávka #{row.office.order_id}
                  </a>
                )}{' '}
                · {row.office.decided_by} · {fmtDateTime(row.office.decided_at)}
                {row.office.note ? ` · „${row.office.note}“` : ''}
                {row.office.decision === 'paired' && !row.office.raynet_linked && <span className="ml-1 text-amber-700">· odkaz do Raynetu se nezapsal</span>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a href={row.raynetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Raynet</a>
            {row.office ? (
              <button type="button" disabled={busy === row.eventId} onClick={() => void undo(row)} className="rounded border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-50">Zrušit rozhodnutí</button>
            ) : (
              <button
                type="button"
                disabled={busy === row.eventId}
                onClick={() => {
                  const note = window.prompt('Bez objednávky — poznámka (např. odpadnutá zakázka, poznámka v kalendáři):', '');
                  if (note == null) return;
                  void act(row, { action: 'no-order', note });
                }}
                className="rounded border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-50"
              >
                Nemá objednávku
              </button>
            )}
          </div>
        </div>
        {row.status !== 'no_order' && (
          <div className="mt-3">
            <Candidates row={row} busy={busy === row.eventId} onPair={(orderId) => void act(row, { action: 'pair', orderId })} />
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-gray-500">Jiná objednávka:</span>
              <input value={manual[row.eventId] ?? ''} onChange={(e) => setManual((m) => ({ ...m, [row.eventId]: e.target.value }))} placeholder="číslo objednávky" className="w-36 rounded border border-gray-300 px-2 py-1" inputMode="numeric" />
              <button
                type="button"
                disabled={busy === row.eventId || !/^\d+$/.test(manual[row.eventId] ?? '')}
                onClick={() => void act(row, { action: 'pair', orderId: Number(manual[row.eventId]) })}
                className="rounded bg-[#1E8449] px-2 py-1 font-medium text-white disabled:opacity-50"
              >
                Spárovat
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  const isToday = useMemo(() => date === ymd(new Date()), [date]);

  // Filters apply across all three sections; the montér list comes from the day itself.
  const allRows = useMemo(() => (data ? [...data.unresolved, ...data.uncertain, ...data.settled] : []), [data]);
  const monteri = useMemo(() => [...new Set(allRows.flatMap((r) => r.monteri))].sort((a, b) => a.localeCompare(b, 'cs')), [allRows]);
  const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matches = useCallback(
    (r: Row) => {
      if (monterFilter && !r.monteri.includes(monterFilter)) return false;
      if (statusFilter.length && !statusFilter.includes(r.status)) return false;
      if (onlyWithSubmission && !r.hasSubmission) return false;
      if (q.trim()) {
        const needle = norm(q.trim());
        const hay = norm([r.customer, r.title, r.address, r.phone, String(r.eventId), r.orderId != null ? `#${r.orderId}` : '', ...r.monteri, ...r.candidates.map((c) => `#${c.id} ${c.name ?? ''} ${c.address ?? ''}`)].filter(Boolean).join(' '));
        if (!hay.includes(needle)) return false;
      }
      return true;
    },
    [monterFilter, statusFilter, onlyWithSubmission, q]
  );
  const unresolved = useMemo(() => (data?.unresolved ?? []).filter(matches), [data, matches]);
  const uncertain = useMemo(() => (data?.uncertain ?? []).filter(matches), [data, matches]);
  const settled = useMemo(() => (data?.settled ?? []).filter(matches), [data, matches]);
  const statusCounts = useMemo(() => allRows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {}), [allRows]);
  const filtersActive = !!q.trim() || !!monterFilter || statusFilter.length > 0 || onlyWithSubmission;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <button type="button" onClick={() => shift(-1)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">‹</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        <button type="button" onClick={() => shift(1)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">›</button>
        <button type="button" onClick={() => setDate(ymd(new Date(Date.now() + 86_400_000)))} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">Zítra</button>
        {isToday && <span className="text-xs text-amber-700">Dnešní den — montéři už jsou v terénu.</span>}
        {data && (
          <span className="ml-auto text-sm text-gray-600">
            {data.total} montáží · <b className="text-rose-700">{data.unresolved.length}</b> k spárování · <b className="text-amber-700">{data.uncertain.length}</b> k potvrzení
          </span>
        )}
        <button type="button" onClick={() => void load()} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">Obnovit</button>
      </div>

      {!loading && data && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat: zákazník, adresa, telefon, montér, číslo události nebo objednávky…"
            className="min-w-[18rem] flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
          />
          <select value={monterFilter} onChange={(e) => setMonterFilter(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">všichni montéři</option>
            {monteri.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(STATUS_UI) as Status[])
              .filter((st) => statusCounts[st])
              .map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter((prev) => (prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]))}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_UI[st].cls} ${statusFilter.includes(st) ? 'ring-2 ring-gray-500 ring-offset-1' : 'opacity-80'}`}
                >
                  {STATUS_UI[st].label} · {statusCounts[st]}
                </button>
              ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={onlyWithSubmission} onChange={(e) => setOnlyWithSubmission(e.target.checked)} />
            jen už zapsané v aplikaci
          </label>
          {filtersActive && (
            <button type="button" onClick={() => { setQ(''); setMonterFilter(''); setStatusFilter([]); setOnlyWithSubmission(false); }} className="text-xs text-blue-600 hover:underline">
              zrušit filtry
            </button>
          )}
        </div>
      )}

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {loading && <p className="py-8 text-center text-gray-500">Načítám…</p>}
      {!loading && data && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">
              K spárování <span className="text-gray-500">· {unresolved.length}{filtersActive && unresolved.length !== data.unresolved.length ? ` z ${data.unresolved.length}` : ''}</span>
            </h2>
            <p className="mb-2 text-xs text-gray-500">Montér tyto události v aplikaci neuzavře, dokud nerozhodnete. Vyberte objednávku, nebo označte, že žádná není.</p>
            {unresolved.length === 0 ? (
              <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">{filtersActive && data.unresolved.length ? 'Filtru nic neodpovídá.' : 'Vše spárováno. 🎉'}</p>
            ) : (
              <ul className="space-y-3">{unresolved.map((r) => <RowCard key={r.eventId} row={r} />)}</ul>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">
              K potvrzení <span className="text-gray-500">· {uncertain.length}{filtersActive && uncertain.length !== data.uncertain.length ? ` z ${data.uncertain.length}` : ''}</span>
            </h2>
            <p className="mb-2 text-xs text-gray-500">Spárováno automaticky jen podle adresy nebo kontaktu. Montér může uzavřít i bez potvrzení — zkontrolujte, že objednávka sedí.</p>
            {uncertain.length === 0 ? (
              <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">{filtersActive && data.uncertain.length ? 'Filtru nic neodpovídá.' : 'Nic k potvrzení.'}</p>
            ) : (
              <ul className="space-y-3">{uncertain.map((r) => <RowCard key={r.eventId} row={r} />)}</ul>
            )}
          </section>
          <section>
            <button type="button" onClick={() => setShowSettled((v) => !v)} className="text-sm font-semibold text-gray-900">
              {showSettled || filtersActive ? '▾' : '▸'} Spárováno <span className="text-gray-500">· {settled.length}{filtersActive && settled.length !== data.settled.length ? ` z ${data.settled.length}` : ''}</span>
            </button>
            {(showSettled || filtersActive) && (
              settled.length === 0 ? <p className="mt-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Nic.</p> : <ul className="mt-2 space-y-3">{settled.map((r) => <RowCard key={r.eventId} row={r} />)}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
