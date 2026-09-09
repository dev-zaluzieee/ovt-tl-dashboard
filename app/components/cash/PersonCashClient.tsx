'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';
import {
  type CashEntry,
  type CashPerson,
  ENTRY_SIGN,
  ENTRY_TYPE_LABELS,
  SOURCE_LABELS,
  fmtCzk,
  fmtDate,
  fmtDateTime,
  personName,
} from './cashTypes';

/**
 * One person's cash ledger — the same view finance has on /osoby/[id], read-only.
 * Entries before the latest inventura are dimmed (they no longer count toward the
 * balance); voided entries are struck through. Receipts open via /api/cash/attachments.
 */
export function PersonCashClient({ personId }: { personId: number }) {
  const [person, setPerson] = useState<CashPerson | null>(null);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cash/persons/${personId}`, { credentials: 'include' });
        const json = await res.json();
        if (!res.ok || !json.success) {
          if (!cancelled) setError(json.message || json.error || 'Načtení selhalo.');
          return;
        }
        if (!cancelled) {
          setPerson(json.data.person as CashPerson);
          setEntries(json.data.entries as CashEntry[]);
        }
      } catch {
        if (!cancelled) setError('Chyba spojení.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  // Balance anchor = latest non-voided inventura (same rule as finance).
  const anchorAt = useMemo(() => {
    let best: string | null = null;
    for (const e of entries) {
      if (e.entry_type !== 'inventura' || e.voided_at) continue;
      if (!best || e.happened_at > best) best = e.happened_at;
    }
    return best;
  }, [entries]);

  const typeCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of entries) out[e.entry_type] = (out[e.entry_type] ?? 0) + 1;
    return out;
  }, [entries]);

  const rows = useMemo(
    () => (typeFilter ? entries.filter((e) => e.entry_type === typeFilter) : entries),
    [entries, typeFilter]
  );

  const expenseTotal = useMemo(
    () =>
      entries
        .filter((e) => e.entry_type === 'expense' && !e.voided_at && (!anchorAt || e.happened_at >= anchorAt))
        .reduce((s, e) => s + Number(e.amount_czk), 0),
    [entries, anchorAt]
  );

  if (loading) return <p className="text-sm text-gray-500">Načítám…</p>;
  if (error) {
    return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>;
  }
  if (!person) return null;

  const activated = person.inventura_at != null;
  const overdue = Number(person.overdue_czk);

  return (
    <div>
      <div className="mb-4 text-sm">
        <Link href="/hotovost" className="text-blue-700 hover:underline">
          ← Hotovost
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1E8449]">{personName(person)}</h1>
          <p className="text-sm text-gray-500">
            {person.email} · {person.role.toUpperCase()}
            {!person.active && ' · neaktivní'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Má u sebe" value={activated ? fmtCzk(Number(person.balance_czk)) : '—'} />
          <Stat
            label="Po termínu"
            value={activated ? fmtCzk(overdue) : '—'}
            sub={activated && overdue > 0 ? `drží od ${fmtDate(person.held_since)}` : undefined}
            tone={overdue > 0 ? 'red' : undefined}
          />
          <Stat label="Výdaje od inventury" value={fmtCzk(expenseTotal)} />
          <Stat
            label="Inventura"
            value={activated ? fmtDate(person.inventura_at) : 'čeká'}
            sub={activated ? 'kotva zůstatku' : 'appka zatím neaktivní'}
            tone={activated ? undefined : 'amber'}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Typ:</span>
        <Chip active={typeFilter == null} onClick={() => setTypeFilter(null)} label={`Vše (${entries.length})`} />
        {Object.keys(ENTRY_TYPE_LABELS).map((t) =>
          typeCounts[t] ? (
            <Chip
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              label={`${ENTRY_TYPE_LABELS[t]} (${typeCounts[t]})`}
            />
          ) : null
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full table-fixed whitespace-nowrap text-xs">
          <colgroup>
            <col className="w-[90px]" />
            <col className="w-[150px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[130px]" />
            <col className="w-[180px]" />
            <col className="w-[170px]" />
          </colgroup>
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-1 font-medium">Datum</th>
              <th className="px-2 py-1 font-medium">Typ</th>
              <th className="px-2 py-1 text-right font-medium">Částka</th>
              <th className="px-2 py-1 font-medium">Zákazník / poznámka</th>
              <th className="px-2 py-1 font-medium">Stav / doklad</th>
              <th className="px-2 py-1 font-medium">Odkazy</th>
              <th className="px-2 py-1 font-medium">Zdroj</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((e) => {
              const isInventura = e.entry_type === 'inventura';
              const beforeAnchor = !!anchorAt && !isInventura && e.happened_at < anchorAt;
              const dimmed = !!e.voided_at || beforeAnchor;
              const sign = ENTRY_SIGN[e.entry_type] ?? 1;
              const amount = Number(e.amount_czk);
              const note = [
                e.customer_name,
                e.expense_category && e.expense_category !== 'Other' ? e.expense_category : null,
                e.entry_type === 'bank_deposit' && e.deposit_channel === 'post'
                  ? `${e.declared_variable_symbol ? `VS ${e.declared_variable_symbol}` : 'bez VS'}${
                      e.declared_gross_czk ? ` · předáno ${fmtCzk(Number(e.declared_gross_czk))}` : ''
                    }${e.fee_czk && Number(e.fee_czk) > 0 ? ` · poplatek ${fmtCzk(Number(e.fee_czk))}` : ''}`
                  : null,
                e.note,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <tr
                  key={e.id}
                  className={`${dimmed ? 'bg-gray-50/60 text-gray-400' : 'hover:bg-gray-50'}`}
                  title={
                    e.voided_at
                      ? `Stornováno ${fmtDate(e.voided_at)} (${e.voided_by ?? ''}): ${e.void_reason ?? ''}`
                      : beforeAnchor
                        ? 'Před poslední inventurou — do zůstatku se už nepočítá'
                        : undefined
                  }
                >
                  <td className="px-2 py-1">{fmtDateTime(e.happened_at)}</td>
                  <td className={`truncate px-2 py-1 ${e.voided_at ? 'line-through' : ''}`}>
                    {e.entry_type === 'bank_deposit' && e.deposit_channel === 'post'
                      ? 'Vklad na poště'
                      : ENTRY_TYPE_LABELS[e.entry_type] ?? e.entry_type}
                  </td>
                  <td
                    className={`px-2 py-1 text-right tabular-nums ${
                      e.voided_at
                        ? 'line-through'
                        : isInventura
                          ? 'text-indigo-700'
                          : dimmed
                            ? ''
                            : sign > 0
                              ? 'text-emerald-700'
                              : 'text-red-700'
                    }`}
                  >
                    {isInventura ? '= ' : sign > 0 ? '+' : '−'}
                    {fmtCzk(Math.abs(amount))}
                  </td>
                  <td className="truncate px-2 py-1" title={note || undefined}>
                    {note || <span className="text-gray-300">—</span>}
                    {e.voided_at && (
                      <span className="ml-1.5 text-rose-600">storno: {e.void_reason ?? ''}</span>
                    )}
                  </td>
                  <td className="truncate px-2 py-1">
                    {e.entry_type === 'bank_deposit' && e.recon_status && e.recon_status !== 'reconciled' && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          e.recon_status === 'discrepancy' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {e.recon_status === 'discrepancy' ? 'nesrovnalost' : 'čeká na banku'}
                      </span>
                    )}
                    {e.entry_type === 'bank_deposit' && e.recon_status === 'reconciled' && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800">
                        spárováno
                      </span>
                    )}
                    {e.attachments.map((a, i) => (
                      <a
                        key={a.id}
                        className="ml-1.5 text-blue-600 hover:underline"
                        href={`/api/cash/attachments/${a.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title={a.filename}
                      >
                        doklad{e.attachments.length > 1 ? ` ${i + 1}` : ''}
                      </a>
                    ))}
                  </td>
                  <td className="overflow-hidden px-2 py-1">
                    <div className="flex gap-2 overflow-hidden">
                      {e.source_order_id != null && (
                        <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                          href={officePortalOrderDeepLink(e.source_order_id)}>#{e.source_order_id}</a>
                      )}
                      {e.raynet_event_id != null && (
                        <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                          href={raynetEventDeepLink(e.raynet_event_id)}>Raynet</a>
                      )}
                      {e.erp_order_id != null && (
                        <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer"
                          href={erpOrderDeepLink(e.erp_order_id)}>ERP</a>
                      )}
                    </div>
                  </td>
                  <td className="truncate px-2 py-1 text-gray-500" title={e.created_by ?? undefined}>
                    {SOURCE_LABELS[e.source] ?? e.source}
                    {e.created_by && !e.created_by.startsWith('system:') && (
                      <span className="text-gray-400"> · {e.created_by.split('@')[0]}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-gray-500">
                  Žádné záznamy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-medium ${
        active ? 'border-gray-700 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'amber' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900'}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}
