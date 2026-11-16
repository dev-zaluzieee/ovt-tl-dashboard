'use client';

import { useState } from 'react';
import { tlGet, tlSend } from '@/lib/tl-api';
import { parseAction, parseDoplatek } from '@/lib/tl-parse';
import { errorText } from '@/lib/tl-errors';
import type { DoplatekRow, MvtDoplatek } from '@/lib/types';
import { fmtDateTime, fmtKc, isYmd, shiftYmd } from '@/lib/format';
import { useMeta } from '@/app/components/shell/MetaContext';
import { DateRange, PersonSelect, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, ErpOrderLink, EventLinks, LoadError, PageHeader, ReasonDialog, Skeleton, btnSmall } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';

const SEV_TONE: Record<string, 'red' | 'amber' | 'sky' | 'gray' | 'green'> = { red: 'red', amber: 'amber', invoice: 'sky', low: 'gray', info: 'gray', ok: 'green' };
const CHECK_LABEL: Record<string, string> = {
  disabled: 'kontrola faktur vypnuta',
  not_asked: 'neověřováno',
  paid: 'faktura uhrazena',
  unpaid: 'faktura neuhrazena',
  unknown: 'stav faktury neznámý',
};

/** Nesedí doplatek: collected differs from expected, or paid by invoice; resolve with a reason. */
export function MvtDoplatekClient() {
  const { meta } = useMeta();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const [resolving, setResolving] = useState<DoplatekRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const today = meta?.today ?? '';
  const from = isYmd(get('from')) ? get('from') : shiftYmd(today, -29);
  const to = isYmd(get('to')) ? get('to') : today;
  const person = get('person');
  const severity = get('severity');
  const resolved = get('resolved') === '1';

  const { data, error, loading, reload } = useLoad<MvtDoplatek>(`doplatek-${from}-${to}-${person}-${severity}-${resolved}`, async (signal) =>
    parseDoplatek(await tlGet('mvt/doplatek', { from, to, person, severity, includeResolved: resolved }, signal)),
  );
  const pad = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';

  async function undo(r: DoplatekRow) {
    if (!r.resolution) return;
    setRowError(null);
    try {
      await tlSend('POST', `resolutions/${r.resolution.id}/undo`);
      setNotice('Uzavření bylo vzato zpět. Zápis do ERP, pokud proběhl, se nevrací.');
      reload();
    } catch (e) {
      setRowError(errorText(e));
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Nesedí doplatek" subtitle="Návštěvy, kde se vybraná částka liší od očekávané, nebo se platilo fakturou. Období = den návštěvy." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <DateRange from={from} to={to} onChange={(f, t) => set({ from: f, to: t })} />
          <PersonSelect side="mvt" value={person} onChange={(v) => set({ person: v })} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={resolved} onChange={(e) => set({ resolved: e.target.checked ? '1' : null })} />
            zobrazit i vyřešené
          </label>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
        </div>
        {data && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.counts).map(([k, n]) => (
              <Chip key={k} tone={SEV_TONE[k] ?? 'gray'} active={severity === k} onClick={() => set({ severity: severity === k ? null : k })}>
                {data.severityLabels[k] ?? k} · {n}
              </Chip>
            ))}
            <span className="self-center text-xs text-gray-500">k vyřízení celkem {data.openCount}</span>
          </div>
        )}
        {data && !data.invoiceCheckEnabled && <Alert tone="gray">Kontrola faktur u fakturační služby je vypnutá: řádek s fakturou nejde uzavřít jako „v pořádku“.</Alert>}
        {notice && <Alert tone="green">{notice}</Alert>}
        {rowError && <Alert tone="red">{rowError}</Alert>}
        {error && <LoadError error={error} onRetry={reload} />}
        {data?.warnings.map((w) => (
          <Alert key={w} tone="amber">{w}</Alert>
        ))}
        {data?.truncated && <Alert tone="amber">Seznam je zkrácený (nejvýše 1000 řádků).</Alert>}
        {!data && !error && <Skeleton />}
        {data && (data.rows.length === 0 ? (
          <Empty title="Žádné nesedící doplatky">V tomto období a filtru nic k řešení.</Empty>
        ) : (
          <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className={pad}>Závažnost</th>
                  <th className={pad}>Návštěva</th>
                  <th className={pad}>Montér</th>
                  <th className={pad}>Zakázka</th>
                  <th className={`${pad} text-right`}>Očekáváno</th>
                  <th className={`${pad} text-right`}>Vybráno</th>
                  <th className={`${pad} text-right`}>Rozdíl</th>
                  <th className={pad}>Platba</th>
                  <th className={`${pad} text-right`}>Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r) => (
                  <tr key={r.event.id} className={`align-top ${r.resolution ? 'bg-gray-50 text-gray-500' : ''}`}>
                    <td className={pad}>
                      <Chip tone={SEV_TONE[r.severity] ?? 'gray'}>{r.severityLabel}</Chip>
                    </td>
                    <td className={pad}>
                      <p className="font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? '—'}</p>
                      <p className="text-xs text-gray-500">{r.event.typeLabel} · {fmtDateTime(r.event.startsAt)}</p>
                    </td>
                    <td className={`${pad} whitespace-nowrap`}>{r.event.people.map((p) => p.name).join(', ') || '—'}</td>
                    <td className={`${pad} whitespace-nowrap`}><ErpOrderLink orderId={r.event.orderId} />{r.orderCreatedAt && density === 'standard' && <p className="text-xs text-gray-400">od {fmtDateTime(r.orderCreatedAt)}</p>}</td>
                    <td className={`${pad} whitespace-nowrap text-right tabular-nums`}>{fmtKc(r.expected)}</td>
                    <td className={`${pad} whitespace-nowrap text-right tabular-nums`}>{fmtKc(r.collected)}</td>
                    <td className={`${pad} whitespace-nowrap text-right tabular-nums ${r.difference ? 'font-semibold text-rose-700' : ''}`}>{fmtKc(r.difference)}</td>
                    <td className={pad}>
                      {r.methodLabel ?? r.method ?? '—'}
                      {r.discount ? <p className="text-xs text-gray-500">sleva {fmtKc(r.discount)}</p> : null}
                      {r.invoice && r.invoiceCheck && <p className="text-xs text-gray-500">{CHECK_LABEL[r.invoiceCheck] ?? r.invoiceCheck}</p>}
                      {r.sediDoplatek && <p className="text-xs text-gray-500">sedí doplatek v ERP: {r.sediDoplatek}</p>}
                      {r.resolution && (
                        <p className="mt-0.5 text-xs text-gray-600">
                          {data.reasons[r.resolution.reason] ?? r.resolution.reason} · {r.resolution.actorName ?? r.resolution.actorEmail}
                          {r.resolution.erpWrittenAt ? ' · zapsáno do ERP' : ''}
                          {r.resolution.note ? ` · „${r.resolution.note}“` : ''}
                        </p>
                      )}
                    </td>
                    <td className={`${pad} whitespace-nowrap text-right text-xs`}>
                      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                        {r.resolution ? (
                          <button type="button" className={btnSmall} onClick={() => void undo(r)}>Vrátit zpět</button>
                        ) : (
                          <button type="button" className={btnSmall} onClick={() => setResolving(r)}>Vyřešit</button>
                        )}
                        <EventLinks ev={r.event} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {resolving && data && (
        <ReasonDialog
          title="Vyřešit nesedící doplatek"
          intro={
            <>
              {resolving.event.customer?.name ?? resolving.event.title} · očekáváno {fmtKc(resolving.expected)}, vybráno {fmtKc(resolving.collected)}.
              {resolving.invoice ? ' U faktury zapíše důvod „v pořádku“ do ERP „sedí doplatek = ano“ (jen když fakturační služba potvrdí úhradu).' : ' Řešení je vaše poznámka v dashboardu, do ERP se nezapisuje.'}
            </>
          }
          reasons={data.reasons}
          submitLabel="Vyřešit"
          onClose={() => {
            setResolving(null);
            reload();
          }}
          onSubmit={async ({ reason, note }) => {
            const res = (await tlSend('POST', 'mvt/doplatek/resolve', { eventId: resolving.event.id, reason, note: note || undefined })) as { steps?: unknown[] };
            setNotice('Doplatek byl vyřešen.');
            return Array.isArray(res.steps) && res.steps.length ? parseAction(res, 'doplatek.resolve') : undefined;
          }}
        />
      )}
    </main>
  );
}
