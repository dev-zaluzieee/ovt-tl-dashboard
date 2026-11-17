'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cashGet } from '@/lib/cash-api';
import {
  ENTRY_SIGN,
  ENTRY_TYPE_LABELS,
  anchorAt as findAnchor,
  entryNote,
  entryOrderId,
  entryTypeLabel,
  expenseSince,
  fmtCzk,
  parseCashDetail,
  personName,
  sourceLabel,
  type CashPersonDetail,
} from '@/lib/cash';
import { fmtDateTime, fmtYmd, plural, pragueYmd } from '@/lib/format';
import { useListDensity } from '@/app/components/retention/listDensity';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { Alert, Chip, ErpOrderLink, Skeleton, btnSmall } from '@/app/components/ui/kit';
import { useLoad } from '@/app/components/ui/useLoad';
import { CashLoadError, Stat } from './CashUi';

function day(iso: string | null): string {
  if (!iso) return '—';
  const ymd = pragueYmd(iso);
  return ymd ? fmtYmd(ymd) : iso;
}

/**
 * One person's cash: the same view finance has, read-only. Entries before the latest inventura are dimmed (they no longer
 * count toward the balance); voided entries are struck through. Receipts open through the attachments route of Hotovost.
 */
export function PersonCashClient({ personId }: { personId: number }) {
  const { data, error, loading, reload } = useLoad<CashPersonDetail>(`cash-person-${personId}`, async (signal) => parseCashDetail(await cashGet(`persons/${personId}`, signal)));
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [density, setDensity] = useListDensity();

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const anchor = useMemo(() => findAnchor(entries), [entries]);
  const expenses = useMemo(() => expenseSince(entries, anchor), [entries, anchor]);
  const typeCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of entries) out[e.entry_type] = (out[e.entry_type] ?? 0) + 1;
    return out;
  }, [entries]);
  const rows = useMemo(() => (typeFilter ? entries.filter((e) => e.entry_type === typeFilter) : entries), [entries, typeFilter]);
  const missingIds = useMemo(() => new Set((data?.missingProof.entries ?? []).map((m) => m.id)), [data]);

  const pad = density === 'compact' ? 'px-2 py-0.5' : 'px-2 py-1.5';

  if (error && !data) {
    return (
      <main className="container mx-auto px-4 py-8">
        <Link href="/hotovost" className="text-sm text-blue-700 hover:underline">← Hotovost</Link>
        <div className="mt-4">
          <CashLoadError error={error} onRetry={reload} />
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="container mx-auto px-4 py-8">
        <Skeleton />
      </main>
    );
  }

  const { person, summary, erpSync, missingProof } = data;
  const activated = person.inventura_at !== null;
  const overdue = Number(person.overdue_czk);

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-4 text-sm">
        <Link href="/hotovost" className="text-blue-700 hover:underline">← Hotovost</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1E8449]">{personName(person)}</h1>
          <p className="text-sm text-gray-500">
            {person.email} · {person.role.toUpperCase()}
            {summary.ovtCode ? ` · ${summary.ovtCode}` : ''}
            {!person.active && ' · neaktivní'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Má u sebe"
            value={activated ? fmtCzk(person.balance_czk) : '—'}
            sub={activated && summary.pendingDepositsCzk > 0 ? `čeká na banku ${fmtCzk(summary.pendingDepositsCzk)}` : undefined}
          />
          <Stat label="Po termínu" value={activated ? fmtCzk(overdue) : '—'} sub={activated && overdue > 0 ? `drží od ${day(person.held_since)}` : undefined} tone={overdue > 0 ? 'red' : undefined} />
          <Stat label="Výdaje od inventury" value={fmtCzk(expenses)} />
          <Stat label="Inventura" value={activated ? day(person.inventura_at) : 'čeká'} sub={activated ? 'kotva zůstatku' : 'appka zatím neaktivní'} tone={activated ? undefined : 'amber'} />
        </div>
      </div>

      <div className="mb-4 space-y-2">
        {erpSync.stale && <Alert tone="amber">{erpSync.message ?? 'Platby z ERP se zatím nepodařilo načíst. Zobrazená data nemusí být aktuální.'}</Alert>}
        {summary.discrepancyDepositsCzk > 0 && (
          <Alert tone="red">Nesrovnalost u vkladů: {fmtCzk(summary.discrepancyDepositsCzk)} nesouhlasí s bankou nebo se nepodařilo spárovat. Řeší finance.</Alert>
        )}
        {missingProof.count > 0 && (
          <Alert tone="red">
            {missingProof.count} {plural(missingProof.count, 'vklad', 'vklady', 'vkladů')} do banky bez nahraného dokladu. Doklad doplní osoba v aplikaci, nebo finance.
          </Alert>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Typ:</span>
        <Chip tone="slate" active={typeFilter === null} onClick={() => setTypeFilter(null)}>{`Vše (${entries.length})`}</Chip>
        {Object.keys(ENTRY_TYPE_LABELS).map((t) =>
          typeCounts[t] ? (
            <Chip key={t} tone="slate" active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
              {`${ENTRY_TYPE_LABELS[t]} (${typeCounts[t]})`}
            </Chip>
          ) : null,
        )}
        <span className="ml-auto flex items-center gap-2">
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
        </span>
      </div>
      {error && <div className="mb-3"><CashLoadError error={error} onRetry={reload} /></div>}

      <div className={`overflow-x-auto rounded-lg border border-gray-200 bg-white ${loading ? 'opacity-60' : ''}`}>
        <table className="w-full min-w-[900px] table-fixed whitespace-nowrap text-xs">
          <colgroup>
            <col className="w-[120px]" />
            <col className="w-[150px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[190px]" />
            <col className="w-[130px]" />
            <col className="w-[170px]" />
          </colgroup>
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className={`${pad} font-medium`}>Datum</th>
              <th className={`${pad} font-medium`}>Typ</th>
              <th className={`${pad} text-right font-medium`}>Částka</th>
              <th className={`${pad} font-medium`}>Zákazník / poznámka</th>
              <th className={`${pad} font-medium`}>Stav / doklad</th>
              <th className={`${pad} font-medium`}>Odkazy</th>
              <th className={`${pad} font-medium`}>Zdroj</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((e) => {
              const isInventura = e.entry_type === 'inventura';
              const beforeAnchor = !!anchor && !isInventura && e.happened_at < anchor;
              const dimmed = !!e.voided_at || beforeAnchor;
              const sign = ENTRY_SIGN[e.entry_type] ?? 1;
              const amount = Number(e.amount_czk);
              const note = entryNote(e);
              const orderId = entryOrderId(e);
              return (
                <tr
                  key={e.id}
                  className={dimmed ? 'bg-gray-50/60 text-gray-400' : 'hover:bg-gray-50'}
                  title={e.voided_at ? `Stornováno ${day(e.voided_at)} (${e.voided_by ?? ''}): ${e.void_reason ?? ''}` : beforeAnchor ? 'Před poslední inventurou, do zůstatku se už nepočítá' : undefined}
                >
                  <td className={pad}>{fmtDateTime(e.happened_at)}</td>
                  <td className={`${pad} truncate ${e.voided_at ? 'line-through' : ''}`}>{entryTypeLabel(e)}</td>
                  <td className={`${pad} text-right tabular-nums ${e.voided_at ? 'line-through' : isInventura ? 'text-indigo-700' : dimmed ? '' : sign > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {isInventura ? '= ' : sign > 0 ? '+' : '−'}
                    {fmtCzk(Math.abs(amount))}
                  </td>
                  <td className={`${pad} truncate`} title={note || undefined}>
                    {note || <span className="text-gray-300">—</span>}
                    {e.voided_at && <span className="ml-1.5 text-rose-600">storno: {e.void_reason ?? ''}</span>}
                  </td>
                  <td className={`${pad} truncate`}>
                    {e.entry_type === 'bank_deposit' && e.recon_status === 'reconciled' && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800">spárováno</span>
                    )}
                    {e.entry_type === 'bank_deposit' && e.recon_status && e.recon_status !== 'reconciled' && (
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${e.recon_status === 'discrepancy' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                        {e.recon_status === 'discrepancy' ? 'nesrovnalost' : 'čeká na banku'}
                      </span>
                    )}
                    {missingIds.has(e.id) && !e.voided_at && (
                      <span className="ml-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white" title="Vklad bez nahraného dokladu">bez dokladu</span>
                    )}
                    {e.attachments.map((a, i) => (
                      <a key={a.id} className="ml-1.5 text-blue-600 hover:underline" href={`/api/cash/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" title={a.filename}>
                        doklad{e.attachments.length > 1 ? ` ${i + 1}` : ''}
                      </a>
                    ))}
                  </td>
                  <td className={`${pad} overflow-hidden`}>
                    {orderId !== null ? <ErpOrderLink orderId={orderId}>{`ERP #${orderId}`}</ErpOrderLink> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`${pad} truncate text-gray-500`} title={e.created_by ?? undefined}>
                    {sourceLabel(e.source)}
                    {e.created_by && !e.created_by.startsWith('system:') && e.created_by !== 'bank' && <span className="text-gray-400"> · {e.created_by.split('@')[0]}</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-gray-500">Žádné záznamy.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
