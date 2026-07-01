'use client';

/**
 * Problematic orders — day-scoped view for the OVT TL dashboard.
 *
 * Two sections stacked:
 *   1. Eskalované na TL (all open OVT-TL escalations, not day-scoped).
 *      TLs can resolve here via a modal that captures reason + note.
 *   2. Problematic orders for the selected day, from two rules:
 *        - Rule A: aged ≥ 2 working days AND not through the OVT pipeline
 *          (three flavors: raynet-only / no ADMF / ADMF not exported)
 *        - Rule B: OVT marked "Zakázka nedopadla" within [D-2wd, D]
 *
 * Each row explains WHY it appeared (reasons array).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import { TeamFilter, type TeamSelection } from '@/app/components/teams/TeamFilter';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import {
  OrderValuePill,
  type OrderValueSyncBlock,
} from '@/app/components/retention/OrderValuePill';

// ---------------------------------------------------------------------------
// Payload types — kept in sync with backend
// (backend/src/services/problematicOrders.service.ts)
// ---------------------------------------------------------------------------

type ReasonKind =
  | 'raynet_only'
  | 'no_admf'
  | 'admf_not_exported'
  | 'nedopadla_recent';

type Reason =
  | { kind: 'raynet_only'; agedWorkingDays: number; eventScheduledFrom: string | null }
  | { kind: 'no_admf'; agedWorkingDays: number; orderCreatedAt: string }
  | { kind: 'admf_not_exported'; agedWorkingDays: number; orderCreatedAt: string }
  | {
      kind: 'nedopadla_recent';
      markedAt: string;
      markedAgoWorkingDays: number;
      nedopadloReason: string | null;
    };

type EscalatedByRole = 'office' | 'retention' | 'ovt_tl_self';

interface EscalationRow {
  id: number;
  order_id: number;
  escalated_by: string;
  escalated_by_role: EscalatedByRole;
  escalated_at: string;
  escalation_note: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_reason: string | null;
  resolution_note: string | null;
}

interface ProblematicRow {
  key: string;
  raynetEventId: number | null;
  title: string;
  scheduledFrom: string | null;
  categoryId: number | null;
  categoryLabel: string | null;
  order: {
    id: number;
    customerName: string | null;
    source_erp_order_id: number | null;
    createdAt: string;
  } | null;
  raynetCompanyId: number | null;
  orderValue: OrderValueSyncBlock | null;
  owner: { email: string | null; raynetId: string | null; name: string | null };
  reasons: Reason[];
  openEscalation: EscalationRow | null;
}

interface Payload {
  day: string;
  rows: ProblematicRow[];
  escalations: EscalationRow[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Reason meta — labels, colors, and a tooltip explaining exactly why the
// row is here. Feeds both the badge and the aria/title.
// ---------------------------------------------------------------------------

function labelForReason(r: Reason): string {
  switch (r.kind) {
    case 'raynet_only':
      return 'Není v systému';
    case 'no_admf':
      return 'Bez ADMF';
    case 'admf_not_exported':
      return 'ADMF neexportován';
    case 'nedopadla_recent':
      return 'Zakázka nedopadla';
  }
}

function tooltipForReason(r: Reason): string {
  switch (r.kind) {
    case 'raynet_only':
      return `V Raynetu je událost, ale v našem systému chybí lokální zakázka.\nStáří: ${r.agedWorkingDays} prac. dnů.`;
    case 'no_admf':
      return `Zakázka existuje ${r.agedWorkingDays} prac. dnů, ale OVT dosud nevytvořil ADMF formulář.`;
    case 'admf_not_exported':
      return `ADMF existuje, ale nebyl úspěšně exportován do Raynetu (${r.agedWorkingDays} prac. dnů starý).`;
    case 'nedopadla_recent':
      return (
        `OVT označil zakázku jako "Zakázka nedopadla"${
          r.nedopadloReason ? ` (${r.nedopadloReason})` : ''
        } před ${r.markedAgoWorkingDays} prac. dny. ` +
        `TL může ověřit, proč to nešlo na retenční oddělení.`
      );
  }
}

/** Ordered by severity for the left-edge stripe color. */
const REASON_SEVERITY: ReasonKind[] = [
  'nedopadla_recent',
  'admf_not_exported',
  'no_admf',
  'raynet_only',
];

function stripeClass(reasons: Reason[]): string {
  const kinds = new Set(reasons.map((r) => r.kind));
  for (const k of REASON_SEVERITY) {
    if (kinds.has(k)) {
      switch (k) {
        case 'nedopadla_recent':
          return 'border-l-4 border-l-rose-500';
        case 'admf_not_exported':
          return 'border-l-4 border-l-amber-500';
        case 'no_admf':
          return 'border-l-4 border-l-amber-400';
        case 'raynet_only':
          return 'border-l-4 border-l-slate-400';
      }
    }
  }
  return 'border-l-4 border-l-slate-200';
}

function reasonBadgeClass(kind: ReasonKind): string {
  switch (kind) {
    case 'raynet_only':
      return 'border-slate-400 bg-slate-100 text-slate-800';
    case 'no_admf':
      return 'border-amber-400 bg-amber-50 text-amber-950';
    case 'admf_not_exported':
      return 'border-amber-500 bg-amber-100 text-amber-950';
    case 'nedopadla_recent':
      return 'border-rose-500 bg-rose-50 text-rose-900';
  }
}

function roleLabel(role: EscalatedByRole): string {
  switch (role) {
    case 'office':
      return 'Office';
    case 'retention':
      return 'Retence';
    case 'ovt_tl_self':
      return 'TL (self-lock)';
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDateCs(raw: string): string {
  const iso = raw.includes('T') ? raw : `${raw}T00:00:00`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return raw;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(t));
}

function formatDateTimeCs(raw: string | null): string {
  if (!raw) return '—';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return raw;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t));
}

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProblematicOrdersClient() {
  const [day, setDay] = useState<string>(() => todayYmd());
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamSelection | null>(null);
  const [density, setDensity] = useListDensity();
  const [resolveTarget, setResolveTarget] = useState<EscalationRow | null>(
    null
  );

  const load = useCallback(async (targetDay: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/problematic-orders?day=${encodeURIComponent(targetDay)}`,
        { headers: { Accept: 'application/json' } }
      );
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: Payload;
      };
      if (!res.ok || !body.success || !body.data) {
        setError(body.message || `Chyba při načítání (${res.status})`);
        setData(null);
        return;
      }
      setData(body.data);
    } catch {
      setError('Nepodařilo se spojit se serverem. Zkuste to znovu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(day);
  }, [load, day]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    if (!teamFilter) return rows;
    const emails = new Set(teamFilter.memberEmails.map((e) => e.toLowerCase()));
    const raynetIds = new Set(teamFilter.memberRaynetIds);
    return rows.filter((r) => {
      const email = r.owner.email?.toLowerCase();
      return (
        (email != null && emails.has(email)) ||
        (r.owner.raynetId != null && raynetIds.has(r.owner.raynetId))
      );
    });
  }, [data, teamFilter]);

  const isCompact = density === 'compact';
  const cellPad = isCompact ? 'px-2 py-1' : 'px-3 py-2.5';

  return (
    <div className="space-y-6">
      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700" htmlFor="day-picker">
            Den:
          </label>
          <input
            id="day-picker"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => setDay(todayYmd())}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Dnes
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TeamFilter value={teamFilter?.id ?? null} onChange={setTeamFilter} />
          <DensityToggle density={density} onChange={setDensity} />
          <button
            type="button"
            onClick={() => void load(day)}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Načítání…' : 'Obnovit'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* ── Escalations section ──────────────────────────── */}
          <EscalationsSection
            escalations={data.escalations}
            onResolveClick={setResolveTarget}
          />

          {/* ── Day rows ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">
                Zakázky pro den {formatDateCs(data.day)}
              </h2>
              <p className="text-xs text-gray-600">
                Nevyřízených:{' '}
                <span className="font-semibold text-gray-900">
                  {filteredRows.length}
                </span>
                {teamFilter && data.rows.length !== filteredRows.length
                  ? ` z ${data.rows.length}`
                  : ''}
              </p>
            </div>

            {data.truncated && (
              <div
                className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950"
                role="status"
              >
                Seznam je omezen na prvních 2000 událostí z Raynetu.
              </div>
            )}

            {filteredRows.length === 0 ? (
              <div className="p-8 text-center text-gray-600">
                <p className="font-medium text-gray-900">Nic k řešení</p>
                <p className="mt-2 text-sm">
                  {teamFilter
                    ? `Pro tým „${teamFilter.name}“ nejsou pro tento den žádné problematické zakázky.`
                    : 'Pro tento den nejsou žádné problematické zakázky.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className={cellPad}>Proč</th>
                      <th className={cellPad}>Zákazník</th>
                      <th className={`${cellPad} text-right`}>Hodnota</th>
                      <th className={cellPad}>Termín</th>
                      <th className={`${cellPad} text-right`}>Akce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((row) => (
                      <ProblematicRowView
                        key={row.key}
                        row={row}
                        cellPad={cellPad}
                        isCompact={isCompact}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {resolveTarget && (
        <ResolveModal
          escalation={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onResolved={() => {
            setResolveTarget(null);
            void load(day);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Escalations section
// ---------------------------------------------------------------------------

function EscalationsSection({
  escalations,
  onResolveClick,
}: {
  escalations: EscalationRow[];
  onResolveClick: (e: EscalationRow) => void;
}) {
  if (escalations.length === 0) return null;
  return (
    <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 shadow-sm">
      <div className="border-b border-rose-200 px-4 py-3">
        <h2 className="text-base font-semibold text-rose-900">
          Eskalované na team leadera ({escalations.length})
        </h2>
        <p className="mt-0.5 text-xs text-rose-800">
          Otevřené eskalace bez ohledu na den. Retence a office se jich
          nedotýkají, dokud je nezavřete.
        </p>
      </div>
      <ul className="divide-y divide-rose-200">
        {escalations.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                Zakázka #{e.order_id}
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 ring-1 ring-gray-200">
                  {roleLabel(e.escalated_by_role)}
                </span>
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Eskaloval/a {e.escalated_by} —{' '}
                {formatDateTimeCs(e.escalated_at)}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-800">
                {e.escalation_note}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Link
                href={officePortalOrderDeepLink(e.order_id)}
                target="_blank"
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Portál →
              </Link>
              <button
                type="button"
                onClick={() => onResolveClick(e)}
                className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Uzavřít eskalaci
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One day row
// ---------------------------------------------------------------------------

function ProblematicRowView({
  row,
  cellPad,
  isCompact,
}: {
  row: ProblematicRow;
  cellPad: string;
  isCompact: boolean;
}) {
  const compactTooltip = isCompact
    ? [
        row.title,
        row.owner.name ? `OVT: ${row.owner.name}` : null,
        row.categoryLabel,
        ...row.reasons.map((r) => tooltipForReason(r)),
      ]
        .filter((s): s is string => !!s)
        .join('\n\n')
    : undefined;
  return (
    <tr className={`align-top ${stripeClass(row.reasons)}`} title={compactTooltip}>
      <td className={cellPad}>
        <div className="flex flex-col gap-1">
          {row.reasons.map((r, i) => (
            <span
              key={`${r.kind}-${i}`}
              title={tooltipForReason(r)}
              className={`inline-block w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${reasonBadgeClass(
                r.kind
              )}`}
            >
              {labelForReason(r)}
            </span>
          ))}
          {row.openEscalation && (
            <span
              className="inline-block w-fit rounded-md border border-rose-500 bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900"
              title={`Eskalováno: ${row.openEscalation.escalation_note}`}
            >
              Eskalováno na TL
            </span>
          )}
        </div>
      </td>
      <td className={cellPad}>
        <div className="font-medium text-gray-900">
          {row.order?.customerName?.trim() || row.title}
        </div>
        {!isCompact && (
          <>
            {row.owner.name && (
              <div className="text-xs text-gray-500">OVT: {row.owner.name}</div>
            )}
            {row.order && (
              <div className="text-xs text-gray-400">
                Zakázka #{row.order.id} · vytvořeno {formatDateCs(row.order.createdAt)}
              </div>
            )}
          </>
        )}
      </td>
      <td className={`${cellPad} text-right`}>
        {row.orderValue ? (
          <OrderValuePill sync={row.orderValue} />
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className={`${cellPad} whitespace-nowrap text-gray-600`}>
        <div>{formatDateTimeCs(row.scheduledFrom)}</div>
        {!isCompact && row.categoryLabel && (
          <div className="text-xs text-gray-400">{row.categoryLabel}</div>
        )}
      </td>
      <td className={`${cellPad} text-right`}>
        <div className="flex flex-wrap justify-end gap-1.5">
          {row.raynetEventId != null && (
            <a
              href={raynetEventDeepLink(row.raynetEventId)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-[#1E8449] px-2 py-1 text-xs font-medium text-[#1E8449] hover:bg-[#F1F8F4]"
            >
              Raynet
            </a>
          )}
          {row.raynetCompanyId != null && (
            <Link
              href={`/klient/${row.raynetCompanyId}`}
              className="rounded-md border border-purple-300 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50"
            >
              Karta
            </Link>
          )}
          {row.order && (
            <a
              href={officePortalOrderDeepLink(row.order.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Portál
            </a>
          )}
          {row.order?.source_erp_order_id != null && (
            <a
              href={erpOrderDeepLink(row.order.source_erp_order_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-[#1565C0] px-2 py-1 text-xs font-medium text-[#1565C0] hover:bg-[#E3F2FD]"
            >
              ERP
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Resolve modal
// ---------------------------------------------------------------------------

type ResolutionReason = 'chyba_ovt' | 'jina_chyba';

function ResolveModal({
  escalation,
  onClose,
  onResolved,
}: {
  escalation: EscalationRow;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [reason, setReason] = useState<ResolutionReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tl-escalations/${encodeURIComponent(escalation.order_id)}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            escalationId: escalation.id,
            reason,
            note: note.trim().length > 0 ? note : undefined,
          }),
        }
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.message || `Chyba (${res.status})`);
        return;
      }
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba spojení.');
    } finally {
      setSubmitting(false);
    }
  }, [escalation.id, escalation.order_id, reason, note, onResolved]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900">
          Uzavřít eskalaci — zakázka #{escalation.order_id}
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Eskalace od {escalation.escalated_by} ({roleLabel(escalation.escalated_by_role)}).
        </p>
        <p className="mt-2 whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800">
          {escalation.escalation_note}
        </p>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        )}

        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-700">
            Důvod uzavření <span className="text-red-600">*</span>
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(
              [
                ['chyba_ovt', 'Chyba OVT'],
                ['jina_chyba', 'Jiná chyba'],
              ] as const
            ).map(([key, label]) => {
              const active = reason === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setReason(key)}
                  disabled={submitting}
                  className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-700">
            Poznámka (volitelná)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Krátký popis toho, jak byla eskalace vyřešena…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!reason || submitting}
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Ukládám…' : 'Uzavřít eskalaci'}
          </button>
        </div>
      </div>
    </div>
  );
}
