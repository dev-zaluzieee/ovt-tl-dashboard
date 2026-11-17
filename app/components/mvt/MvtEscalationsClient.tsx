'use client';

import { useRef, useState } from 'react';
import { tlGet, tlSend, errorText, TlApiError } from '@/lib/tl-api';
import { NOTE_MAX, STATE_LABELS, noteValid, parseEscalations, parseFilter, parseResolved, safeLink, visibleRows, type EscalationRow, type Escalations } from '@/lib/escalations';
import { fmtDateTime } from '@/lib/format';
import { useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, ErpOrderLink, EventLinks, LoadError, Modal, PageHeader, Skeleton, btnGhost, btnPrimary, btnSmall, inputCls } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';
import { ESCALATIONS_CHANGED } from './EscalationEvents';

const TONE = { open: 'amber', resolved: 'green', withdrawn: 'gray' } as const;

/** The row changed under the dialog (resolved elsewhere, withdrawn by finance, gone): the list must be reloaded, not retried. */
const isStale = (err: unknown) => err instanceof TlApiError && (err.status === 409 || err.status === 404);

function ResolveDialog({ row, onClose, onDone, onStale }: { row: EscalationRow; onClose: () => void; onDone: () => void; onStale: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false); // double-submit guard that holds even before React re-renders the disabled button
  const e = row.escalation;

  async function go() {
    if (lock.current || !noteValid(note)) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    let res: unknown;
    try {
      res = await tlSend('POST', `mvt/escalations/${e.id}/resolve`, { note: note.trim() });
    } catch (err) {
      if (isStale(err)) {
        onStale();
        return;
      }
      setError(errorText(err));
      lock.current = false;
      setBusy(false);
      return;
    }
    // The request succeeded: the resolve happened. A shape problem in the answer must not read as a failed resolve.
    try {
      parseResolved(res);
    } catch {
      // ignored on purpose: the reloaded list shows the real state
    }
    onDone();
  }

  return (
    <Modal title="Vyřešit eskalaci z financí" onClose={busy ? () => undefined : onClose}>
      <div className="space-y-3 text-sm">
        <div className="text-gray-700">
          <p className="font-medium text-gray-900">{row.event?.customer?.name ?? `Zakázka #${e.erpOrderId}`}</p>
          <p className="mt-1">{e.escalatedByName ?? e.escalatedBy}: {e.reason}</p>
          <p className="mt-2 text-xs text-gray-500">Poznámku uvidí finance. Vyřešení nejde vzít zpět.</p>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Poznámka – povinné pole (aspoň 3 znaky)</span>
          <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={4} maxLength={NOTE_MAX} disabled={busy} className={`${inputCls} mt-1 w-full`} />
        </label>
        {error && <Alert tone="red">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>Zrušit</button>
          <button type="button" disabled={!noteValid(note) || busy} onClick={() => void go()} className={btnPrimary}>{busy ? 'Ukládám…' : 'Vyřešit'}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Z financí: visits that finance escalated to the MVT team leader (own answer, separate from the ERP-derived lists). */
export function MvtEscalationsClient({ financeOrigin }: { financeOrigin: string | null }) {
  const { get, set } = useUrlParams();
  const filter = parseFilter(get('show'));
  const [density, setDensity] = useListDensity();
  const [resolving, setResolving] = useState<EscalationRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad<Escalations>(`escalations-${filter}`, async (signal) => parseEscalations(await tlGet('mvt/escalations', { includeClosed: filter === 'all' }, signal)), { refreshMs: 120_000 });
  const rows = data ? visibleRows(data.rows, filter) : [];
  const pad = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Z financí" subtitle="Návštěvy, které finance eskalovaly vedoucímu týmu (například nesedí doklad nebo platba). Vyřešení vyžaduje poznámku, kterou uvidí finance." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="tablist" aria-label="Zobrazení">
            {([['open', `Otevřené${data ? ` (${data.openCount})` : ''}`], ['all', 'Vše (90 dní)']] as const).map(([v, label], i) => (
              <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => set({ show: v === 'open' ? null : v })} className={`px-3 py-1.5 font-semibold ${i > 0 ? 'border-l border-gray-300' : ''} ${filter === v ? 'bg-[#1E8449] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={() => { setNotice(null); reload(); }}>Obnovit</button>
        </div>
        {notice && <Alert tone="amber">{notice}</Alert>}
        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton />}
        {data?.pending && <Alert tone="amber">Tato část potřebuje databázovou migraci, která ještě není nasazená. Seznam je zatím prázdný. Obraťte se na správce.</Alert>}
        {data && !data.pending && (rows.length === 0 ? (
          <Empty title={filter === 'open' ? 'Žádné otevřené eskalace z financí' : 'Žádné eskalace za posledních 90 dní'} />
        ) : (
          <div className={`overflow-x-auto rounded-lg border border-gray-200 bg-white ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[960px] text-xs">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className={`${pad} font-medium`}>Eskalováno</th>
                  <th className={`${pad} font-medium`}>Kým</th>
                  <th className={`${pad} font-medium`}>Důvod</th>
                  <th className={`${pad} font-medium`}>Návštěva</th>
                  <th className={`${pad} font-medium`}>Zakázka</th>
                  <th className={`${pad} font-medium`}>Stav</th>
                  <th className={pad} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const e = r.escalation;
                  const link = safeLink(e.link, financeOrigin);
                  return (
                    <tr key={e.id} className="align-top hover:bg-gray-50">
                      <td className={`${pad} whitespace-nowrap`}>{fmtDateTime(e.createdAt)}</td>
                      <td className={`${pad} whitespace-nowrap`} title={e.escalatedBy}>{e.escalatedByName ?? e.escalatedBy}</td>
                      <td className={`${pad} max-w-sm whitespace-normal text-gray-800`}>
                        {e.reason}
                        {link && <> <a href={link} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-blue-600 hover:underline">Otevřít ve financích</a></>}
                      </td>
                      <td className={`${pad} whitespace-normal`}>
                        {r.event ? (
                          <>
                            <span className="font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? '—'}</span>
                            <span className="block text-gray-500">{r.event.typeLabel} · {fmtDateTime(r.event.startsAt)} · {r.event.people.map((p) => p.name).join(', ') || 'bez montéra'}</span>
                            <EventLinks ev={r.event} />
                          </>
                        ) : (
                          <span className="text-gray-500">Návštěva #{e.erpEventId} už není v přehledu dashboardu.</span>
                        )}
                      </td>
                      <td className={`${pad} whitespace-nowrap`}><ErpOrderLink orderId={e.erpOrderId}>{`#${e.erpOrderId}`}</ErpOrderLink></td>
                      <td className={`${pad} whitespace-normal`}>
                        <Chip tone={TONE[e.state]}>{STATE_LABELS[e.state]}</Chip>
                        {e.state === 'resolved' && (
                          <span className="mt-1 block text-gray-600">{e.resolvedByName ?? e.resolvedBy ?? '—'}{e.resolvedAt ? `, ${fmtDateTime(e.resolvedAt)}` : ''}{e.resolutionNote ? `: ${e.resolutionNote}` : ''}</span>
                        )}
                        {e.state === 'withdrawn' && e.withdrawnAt && <span className="mt-1 block text-gray-600">{fmtDateTime(e.withdrawnAt)}</span>}
                      </td>
                      <td className={`${pad} whitespace-nowrap text-right`}>
                        {e.state === 'open' && <button type="button" className={btnSmall} onClick={() => setResolving(r)}>Vyřešit</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {resolving && (
        <ResolveDialog
          row={resolving}
          onClose={() => setResolving(null)}
          onStale={() => {
            setResolving(null);
            setNotice('Eskalace se mezitím změnila (vyřešil ji někdo jiný nebo ji finance stáhly). Seznam je znovu načtený.');
            reload();
            window.dispatchEvent(new Event(ESCALATIONS_CHANGED));
          }}
          onDone={() => {
            setResolving(null);
            setNotice(null);
            reload();
            window.dispatchEvent(new Event(ESCALATIONS_CHANGED));
          }}
        />
      )}
    </main>
  );
}
