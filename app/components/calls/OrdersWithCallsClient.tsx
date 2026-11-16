'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { callsGet, tlGet } from '@/lib/tl-api';
import { parseCallsOrders } from '@/lib/tl-parse';
import type { CallsOrder } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { Alert, Empty, ErpOrderLink, LoadError, PageHeader, Skeleton, btnSmall, inputCls } from '@/app/components/ui/kit';
import { useLoad } from '@/app/components/ui/useLoad';
import { useMeta } from '@/app/components/shell/MetaContext';
import { erpCustomerUrl } from '@/lib/links';

interface Row extends CallsOrder {
  callCount: number;
  lastCallTime: string | null;
  agents: string[];
}

function hovoryHref(o: CallsOrder): string {
  return o.customerId ? `/zakaznik/${o.customerId}/hovory` : `/zakazka/${o.orderId}/hovory`;
}

/** Objednávky s hovory: orders of the dashboard's universe with recorded calls, plus a search over every ERP order. */
export function OrdersWithCallsClient() {
  const { meta } = useMeta();
  const [density, setDensity] = useListDensity();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [agent, setAgent] = useState('');
  const [search, setSearch] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const cell = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2.5';

  const { data, error, loading, reload } = useLoad<{ rows: Row[]; truncated: boolean }>(`calls-${from}-${to}`, async (signal) => {
    const d = (await callsGet('orders', { from, to }, signal)) as { orders?: unknown; truncated?: boolean };
    return { rows: parseCallsOrders({ orders: d.orders ?? [] }) as Row[], truncated: d.truncated === true };
  });
  const found = useLoad<{ orders: CallsOrder[]; truncated: boolean } | null>(`search-${searchKey}`, async (signal) => {
    if (searchKey.length < 3) return null;
    const d = (await tlGet('calls/search', { q: searchKey }, signal)) as { orders?: unknown; truncated?: boolean };
    return { orders: parseCallsOrders({ orders: d.orders ?? [] }), truncated: d.truncated === true };
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const owners = useMemo(() => [...new Map(rows.filter((r) => r.owner).map((r) => [r.owner!.id, r.owner!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'cs')), [rows]);
  const agents = useMemo(() => [...new Set(rows.flatMap((r) => r.agents))].sort((a, b) => a.localeCompare(b, 'cs')), [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (owner && String(r.owner?.id ?? '') !== owner) return false;
      if (agent && !r.agents.includes(agent)) return false;
      if (needle && ![r.customerName, String(r.orderId), ...r.phones.map((p) => p.phone)].some((x) => (x ?? '').toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [rows, owner, agent, q]);

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Hovory" subtitle="Zakázky, ke kterým existují nahrané hovory z Daktely (shoda na posledních 9 číslicích telefonu zákazníka nebo zakázky)." />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">Od: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">Do: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></label>
          {(from || to) && <button type="button" className={btnSmall} onClick={() => { setFrom(''); setTo(''); }}>Vymazat</button>}
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls}>
            <option value="">OVT: všichni</option>
            {owners.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
          </select>
          <select value={agent} onChange={(e) => setAgent(e.target.value)} className={inputCls}>
            <option value="">Agent: všichni</option>
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" onClick={reload} disabled={loading} className={btnSmall}>{loading ? 'Načítání…' : 'Obnovit'}</button>
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrovat seznam: zákazník, telefon, číslo zakázky…" className={`${inputCls} w-full`} />

        {error && <LoadError error={error} onRetry={reload} />}
        {data?.truncated && <Alert tone="amber">Seznam zakázek je zkrácený (nejvýše 2000 zakázek v dashboardu).</Alert>}
        {!data && !error && <Skeleton />}
        {data && (filtered.length === 0 ? (
          <Empty title="Žádné shody">{rows.length === 0 ? 'Nenašli jsme žádné zakázky s hovorem. Zakázku mimo seznam najdete vyhledáváním níže.' : 'Žádná řádka nesplňuje aktuální filtry.'}</Empty>
        ) : (
          <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
            <p className="border-b border-gray-100 px-4 py-2 text-sm text-gray-600">Zobrazeno {filtered.length}{rows.length !== filtered.length ? ` z ${rows.length}` : ''}</p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr><th className={cell}>Zákazník</th><th className={cell}>Telefon</th><th className={cell}>OVT</th><th className={`${cell} text-right`}>Hovorů</th><th className={cell}>Poslední hovor</th><th className={cell}>Zakázka</th><th className={`${cell} text-right`}>Akce</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => (
                    <tr key={r.orderId} className="align-top">
                      <td className={cell}>
                        <div className="font-medium text-gray-900">{r.customerName ?? `Zakázka #${r.orderId}`}</div>
                        {density === 'standard' && r.agents.length > 0 && <div className="text-xs text-gray-400">Agent: {r.agents.slice(0, 2).join(', ')}{r.agents.length > 2 ? '…' : ''}</div>}
                      </td>
                      <td className={`${cell} whitespace-nowrap font-mono text-gray-800`}>{r.phones.map((p) => p.phone).join(', ') || '—'}</td>
                      <td className={`${cell} whitespace-nowrap text-gray-700`}>{r.owner?.name ?? '—'}</td>
                      <td className={`${cell} text-right`}><span className="rounded-md border border-emerald-500 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900">{r.callCount}</span></td>
                      <td className={`${cell} whitespace-nowrap text-gray-600`}>{fmtDateTime(r.lastCallTime)}</td>
                      <td className={`${cell} whitespace-nowrap text-gray-600`}><ErpOrderLink orderId={r.orderId} />{r.statusLabel && density === 'standard' && <div className="text-xs text-gray-400">{r.statusLabel}</div>}</td>
                      <td className={`${cell} whitespace-nowrap text-right`}>
                        <Link href={hovoryHref(r)} className="rounded-md bg-[#1565C0] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0d4f9c]">→ Hovory</Link>
                        {r.customerId && erpCustomerUrl(meta?.erpWebBaseUrl, r.customerId) && (
                          <a href={erpCustomerUrl(meta?.erpWebBaseUrl, r.customerId) ?? '#'} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-blue-600 hover:underline">Zákazník v ERP</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <section className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h2 className="font-semibold text-gray-900">Najít zakázku nebo zákazníka v ERP</h2>
          <p className="text-xs text-gray-500">Hledá mezi všemi zakázkami v ERP (číslo zakázky, jméno zákazníka nebo telefon, aspoň 3 znaky), ne jen mezi těmi výše.</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearchKey(search.trim()); }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Např. 10000123, Novák nebo 777 111 222" className={`${inputCls} w-80`} />
            <button type="submit" className={btnSmall}>Hledat</button>
          </form>
          {found.error && <LoadError error={found.error} />}
          {found.data && (found.data.orders.length === 0 ? <p className="text-sm text-gray-500">Nic nenalezeno.</p> : (
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white text-sm">
              {found.data.orders.map((o) => (
                <li key={o.orderId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span><b>{o.customerName ?? '—'}</b> · zakázka #{o.orderId}{o.statusLabel ? ` · ${o.statusLabel}` : ''}<span className="ml-2 font-mono text-xs text-gray-500">{o.phones.map((p) => p.phone).join(', ')}</span></span>
                  <Link href={hovoryHref(o)} className="rounded-md bg-[#1565C0] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0d4f9c]">→ Hovory</Link>
                </li>
              ))}
            </ul>
          ))}
        </section>
      </div>
    </main>
  );
}
