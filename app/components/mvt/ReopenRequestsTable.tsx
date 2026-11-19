'use client';

import { useState } from 'react';
import { TlApiError, tlGet, tlSend } from '@/lib/tl-api';
import { parseAction, parseReopenRequest, parseReopenRequests } from '@/lib/tl-parse';
import type { ActionResult, MvtReopenRequests, ReopenRequest, ReopenRequestRow } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import { approveNotice } from '@/lib/reopen-request';
import { useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, EventLinks, LoadError, ReasonDialog, btnAmber, btnSmall } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';

const STATUS_TONE: Record<string, 'amber' | 'green' | 'gray' | 'slate'> = { requested: 'amber', opened: 'green', declined: 'gray', withdrawn: 'slate', obsolete: 'slate' };

type Pick = { row: ReopenRequestRow; kind: 'approve' | 'decline' };

/**
 * "Žádosti montérů": the fitters' requests to reopen a closed visit, one per line. The team leader opens the visit
 * (ERP reopen, optional note) or declines (note mandatory, the fitter sees it). Pending ones by default, a switch shows
 * the last 90 days with the decision. Silent (renders nothing) when the backend does not know the route yet.
 */
export function ReopenRequestsTable({ person, onChanged }: { person: string; onChanged: () => void }) {
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const [pick, setPick] = useState<Pick | null>(null);
  const all = get('zadosti') === 'all';
  const { data, error, loading, reload } = useLoad<MvtReopenRequests>(`reopen-requests-${all}-${all ? person : ''}`, async (signal) =>
    // pending requests are never filtered by person (the filter sits below the table); the decided view keeps it
    parseReopenRequests(await tlGet('mvt/reopen-requests', { status: all ? 'all' : 'open', person: all ? person : '' }, signal)),
    { refreshMs: 120_000 },
  );
  const pad = density === 'compact' ? 'px-3 py-1' : 'px-3 py-2';

  // an older backend does not have the route: no table, no message
  if (error instanceof TlApiError && error.status === 404) return null;
  // nothing before the first answer: an older backend must not flash the heading before the 404 hides the table
  if (!data && !error) return null;

  const refresh = () => {
    reload();
    onChanged();
  };
  const lost = (e: unknown) => {
    // someone decided meanwhile: show who (the dialog prints the error text), and refresh behind it
    if (e instanceof TlApiError && (e.code === 'REQUEST_DECIDED' || e.code === 'EVENT_CANCELLED' || e.code === 'REQUEST_NOT_FOUND')) refresh();
  };

  return (
    <section className="space-y-2" aria-label="Žádosti montérů">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-gray-900">
          Žádosti montérů {data && !data.pending && <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal">{all ? `${data.rows.length}` : data.openCount}</span>}
        </h2>
        {data && !data.pending && (
          <>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={all} onChange={(e) => set({ zadosti: e.target.checked ? 'all' : null })} />
              zobrazit i vyřízené (posledních 90 dní)
            </label>
            {all && person && <span className="text-xs text-gray-500">filtrováno podle zvoleného montéra</span>}
            <DensityToggle density={density} onChange={setDensity} />
          </>
        )}
        <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
      </div>
      {error && <LoadError error={error} onRetry={reload} />}
      {data?.pending && <p className="text-sm text-gray-500">Žádosti montérů zatím nejsou k dispozici (databázová část ještě není nasazená).</p>}
      {data && !data.pending && (data.rows.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-500">{all ? 'Za posledních 90 dní nejsou žádné žádosti.' : 'Žádná žádost montéra nečeká na vyřízení.'}</p>
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Požádáno</th>
                <th className="px-3 py-2">Návštěva</th>
                <th className="px-3 py-2">Důvod montéra</th>
                <th className="px-3 py-2">Stav</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.map((row) => {
                const q = row.request;
                const ev = row.event;
                const pendingRow = q.status === 'requested';
                return (
                  <tr key={q.id} className="align-top">
                    <td className={`${pad} whitespace-nowrap border-l-4 ${pendingRow ? 'border-amber-400' : 'border-transparent'}`}>
                      {fmtDateTime(q.requestedAt)}
                      <p className="text-xs text-gray-500">{q.requestedByName ?? q.requestedByEmail ?? '—'}</p>
                    </td>
                    <td className={pad}>
                      {ev ? (
                        <>
                          <p className="font-medium text-gray-900"><Chip tone="slate">{ev.typeLabel}</Chip> <span className="ml-1">{ev.customer?.name ?? ev.title ?? `Událost ${ev.id}`}</span></p>
                          <p className="text-xs text-gray-500">{fmtDateTime(ev.startsAt)}{ev.customer?.city ? ` · ${ev.customer.city}` : ''}{ev.people.length ? ` · ${ev.people.map((p) => p.name).join(', ')}` : ''}</p>
                          <p className="text-xs"><EventLinks ev={ev} /></p>
                        </>
                      ) : (
                        <p className="text-gray-600">Událost {q.eventId} <span className="text-xs text-gray-400">(mimo dosah dashboardu, otevřít z něj nejde)</span></p>
                      )}
                    </td>
                    <td className={`${pad} max-w-xs text-gray-800`}>{q.reason || '—'}</td>
                    <td className={`${pad} text-xs`}>
                      <Chip tone={STATUS_TONE[q.status] ?? 'gray'}>{q.statusLabel}</Chip>
                      {!pendingRow && (
                        <div className="mt-1 space-y-0.5 text-gray-700">
                          {(q.decidedByName || q.decidedAt) && <p>{q.decidedByName ?? '—'}{q.decidedAt ? ` · ${fmtDateTime(q.decidedAt)}` : ''}{q.decidedActorEmail && <span className="text-gray-500"> (v zastoupení: {q.decidedActorEmail})</span>}</p>}
                          {q.decidedViaLabel && <p className="text-gray-500">{q.decidedViaLabel}</p>}
                          {q.decisionNote && <p>Poznámka: „{q.decisionNote}“</p>}
                        </div>
                      )}
                    </td>
                    <td className={`${pad} whitespace-nowrap text-right`}>
                      {pendingRow && (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {ev && <button type="button" className={btnAmber} onClick={() => setPick({ row, kind: 'approve' })}>Otevřít</button>}
                          <button type="button" className={btnSmall} onClick={() => setPick({ row, kind: 'decline' })}>Zamítnout</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {pick && (
        <ReasonDialog
          key={`${pick.kind}-${pick.row.request.id}`}
          title={pick.kind === 'approve' ? 'Otevřít k opravě na žádost montéra' : 'Zamítnout žádost montéra'}
          intro={
            <>
              {pick.row.event?.customer?.name ?? pick.row.event?.title ?? `Událost ${pick.row.request.eventId}`}{pick.row.event ? ` · ${pick.row.event.typeLabel}` : ''}. {pick.row.request.requestedByName ? `Montér ${pick.row.request.requestedByName} píše` : 'Montér píše'}: „{pick.row.request.reason}“.
              {pick.kind === 'approve' ? ' Návštěva se vrátí do stavu naplánováno, montér ji pak zapíše znovu. Poznámku uvidí montér.' : ' Důvod zamítnutí uvidí montér ve své aplikaci.'}
            </>
          }
          noReason
          renderResult={(r) => {
            const n = approveNotice(r as ActionResult & { request?: ReopenRequest | null });
            return n ? <Alert tone={n.kind === 'mismatch' ? 'amber' : 'green'}>{n.text}</Alert> : null;
          }}
          noteMin={pick.kind === 'decline' ? 3 : 0}
          noteMax={pick.kind === 'approve' ? 500 : 1000}
          noteLabel={pick.kind === 'approve' ? 'Poznámka pro montéra' : 'Důvod zamítnutí'}
          submitLabel={pick.kind === 'approve' ? 'Otevřít k opravě' : 'Zamítnout'}
          onClose={() => {
            setPick(null);
            refresh();
          }}
          onSubmit={async ({ note }) => {
            const id = pick.row.request.id;
            try {
              if (pick.kind === 'approve') {
                const a = parseAction<{ request?: unknown }>(await tlSend('POST', `mvt/reopen-requests/${id}/approve`, note ? { note } : {}));
                return { ...a, request: a.request ? parseReopenRequest(a.request, 'approve.request') : null } as ActionResult;
              }
              parseReopenRequest(((await tlSend('POST', `mvt/reopen-requests/${id}/decline`, { note })) as { request?: unknown } | null)?.request, 'decline.request');
              return undefined;
            } catch (e) {
              lost(e);
              if (e instanceof TlApiError && e.code === 'EVENT_CANCELLED') throw new Error('Událost je zrušená, žádost už neplatí. Seznam se obnoví.');
              throw e;
            }
          }}
        />
      )}
    </section>
  );
}
