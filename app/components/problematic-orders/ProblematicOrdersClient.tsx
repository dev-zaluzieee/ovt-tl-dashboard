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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import {
  TlBatchConfirmWizardModal,
  type BatchConfirmItem,
  type TlConfirmDecision,
} from './TlBatchConfirmWizardModal';
import { TlBatchConfirmSetupModal } from './TlBatchConfirmSetupModal';

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
// Search / filter / sort
// ---------------------------------------------------------------------------

/** Sortable column keys. `default` = severity-based order from `REASON_SEVERITY`. */
type SortKey = 'default' | 'customer' | 'owner' | 'value' | 'termin';
type SortDir = 'asc' | 'desc';

interface ReasonChip {
  kind: ReasonKind;
  label: string;
}

const REASON_CHIPS: ReasonChip[] = [
  { kind: 'nedopadla_recent', label: 'Nedopadla' },
  { kind: 'admf_not_exported', label: 'Neexportováno' },
  { kind: 'no_admf', label: 'Bez ADMF' },
  { kind: 'raynet_only', label: 'Bez zakázky' },
];

/** Severity index (lower = more urgent) for the default sort. Order matches
 *  `REASON_SEVERITY` in the row view (nedopadla_recent = 0, …). */
const REASON_SEVERITY_INDEX: Record<ReasonKind, number> = {
  nedopadla_recent: 0,
  admf_not_exported: 1,
  no_admf: 2,
  raynet_only: 3,
};

function rowSeverity(row: ProblematicRow): number {
  let best = 99;
  for (const r of row.reasons) {
    const i = REASON_SEVERITY_INDEX[r.kind] ?? 99;
    if (i < best) best = i;
  }
  return best;
}

function parseSortParam(raw: string | null): {
  key: SortKey;
  dir: SortDir;
} {
  if (!raw) return { key: 'default', dir: 'desc' };
  const [k, d] = raw.split('_');
  const key: SortKey =
    k === 'customer' || k === 'owner' || k === 'value' || k === 'termin'
      ? k
      : 'default';
  const dir: SortDir = d === 'asc' ? 'asc' : 'desc';
  return { key, dir };
}

function formatSortParam(key: SortKey, dir: SortDir): string | null {
  if (key === 'default') return null;
  return `${key}_${dir}`;
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
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(
    () => new Set()
  );
  const [batchSetup, setBatchSetup] = useState<TlConfirmDecision | null>(null);
  const [batchWizardPayload, setBatchWizardPayload] = useState<{
    decision: TlConfirmDecision;
    reason: string;
    note: string | null;
    items: BatchConfirmItem[];
  } | null>(null);

  // ── URL-backed search / filter / sort ──────────────────────────
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const reasonsParam = searchParams.get('reasons');
  const reasonsFilter = useMemo<Set<ReasonKind>>(() => {
    const out = new Set<ReasonKind>();
    if (!reasonsParam) return out;
    for (const raw of reasonsParam.split(',')) {
      const t = raw.trim();
      if (
        t === 'raynet_only' ||
        t === 'no_admf' ||
        t === 'admf_not_exported' ||
        t === 'nedopadla_recent'
      ) {
        out.add(t);
      }
    }
    return out;
  }, [reasonsParam]);
  const escalatedOnly = searchParams.get('escalated') === '1';
  const { key: sortKey, dir: sortDir } = parseSortParam(searchParams.get('sort'));

  const updateSearchParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams]
  );

  const setQ = useCallback(
    (value: string) => updateSearchParam({ q: value.length > 0 ? value : null }),
    [updateSearchParam]
  );
  const toggleReason = useCallback(
    (kind: ReasonKind) => {
      const next = new Set(reasonsFilter);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      const joined = [...next].join(',');
      updateSearchParam({ reasons: joined.length > 0 ? joined : null });
    },
    [reasonsFilter, updateSearchParam]
  );
  const setEscalatedOnly = useCallback(
    (value: boolean) => updateSearchParam({ escalated: value ? '1' : null }),
    [updateSearchParam]
  );
  const handleSortClick = useCallback(
    (key: Exclude<SortKey, 'default'>) => {
      // Cycle: current column asc → desc → default; different column → asc.
      if (sortKey === key) {
        if (sortDir === 'asc') {
          updateSearchParam({ sort: formatSortParam(key, 'desc') });
        } else {
          // desc → clear
          updateSearchParam({ sort: null });
        }
      } else {
        updateSearchParam({ sort: formatSortParam(key, 'asc') });
      }
    },
    [sortKey, sortDir, updateSearchParam]
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
    setSelectedOrderIds(new Set());
  }, [load, day]);

  // Selectable rows = those with a local order id (Raynet-only rows can't be
  // confirmed because the underlying services need source_raynet_event_id via
  // an orders row).
  const selectableOrderIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of data?.rows ?? []) {
      if (r.order?.id != null) ids.add(r.order.id);
    }
    return ids;
  }, [data]);

  const toggleOrderSelected = useCallback((orderId: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const selectedItems: BatchConfirmItem[] = useMemo(() => {
    const rows = data?.rows ?? [];
    const out: BatchConfirmItem[] = [];
    for (const r of rows) {
      if (r.order?.id == null) continue;
      if (!selectedOrderIds.has(r.order.id)) continue;
      out.push({
        order_id: r.order.id,
        customer_name: r.order.customerName ?? r.title ?? null,
      });
    }
    return out;
  }, [data, selectedOrderIds]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];

    // ── Team filter (existing behavior) ─────────────────────────
    const teamEmails = teamFilter
      ? new Set(teamFilter.memberEmails.map((e) => e.toLowerCase()))
      : null;
    const teamRaynetIds = teamFilter
      ? new Set(teamFilter.memberRaynetIds)
      : null;

    // ── Search (case-insensitive substring across customer / OVT / IDs) ──
    const needle = q.trim().toLowerCase();
    const matchesSearch = (r: ProblematicRow): boolean => {
      if (needle.length === 0) return true;
      const parts: Array<string | null | undefined> = [
        r.order?.customerName,
        r.title,
        r.owner.name,
        r.owner.email,
        r.owner.raynetId,
        r.order?.id != null ? `#${r.order.id}` : null,
        r.order?.id != null ? String(r.order.id) : null,
        r.order?.source_erp_order_id != null
          ? String(r.order.source_erp_order_id)
          : null,
      ];
      for (const p of parts) {
        if (p && p.toLowerCase().includes(needle)) return true;
      }
      return false;
    };

    // ── Reason chips (AND across chips: row matches iff it has at least
    //    one reason of ANY selected kind — i.e. multi-select OR within
    //    reasons, but the whole filter is applied conjunctively with the
    //    other filters). Empty selection = no restriction. ──
    const matchesReason = (r: ProblematicRow): boolean => {
      if (reasonsFilter.size === 0) return true;
      for (const rr of r.reasons) {
        if (reasonsFilter.has(rr.kind)) return true;
      }
      return false;
    };

    // ── Escalated-only toggle ───────────────────────────────────
    const matchesEscalated = (r: ProblematicRow): boolean =>
      !escalatedOnly || r.openEscalation != null;

    // ── Team filter (existing) ──────────────────────────────────
    const matchesTeam = (r: ProblematicRow): boolean => {
      if (!teamEmails || !teamRaynetIds) return true;
      const email = r.owner.email?.toLowerCase();
      return (
        (email != null && teamEmails.has(email)) ||
        (r.owner.raynetId != null && teamRaynetIds.has(r.owner.raynetId))
      );
    };

    const filtered = rows.filter(
      (r) =>
        matchesTeam(r) && matchesSearch(r) && matchesReason(r) && matchesEscalated(r)
    );

    // ── Sort ────────────────────────────────────────────────────
    const sorted = [...filtered];
    if (sortKey === 'default') {
      // Severity first (nedopadla → raynet-only), then termín DESC as
      // a stable secondary. Preserves the useful "worst-first" ordering
      // when the user hasn't explicitly picked a sort.
      sorted.sort((a, b) => {
        const sa = rowSeverity(a);
        const sb = rowSeverity(b);
        if (sa !== sb) return sa - sb;
        const ta = a.scheduledFrom ? Date.parse(a.scheduledFrom) : 0;
        const tb = b.scheduledFrom ? Date.parse(b.scheduledFrom) : 0;
        return tb - ta;
      });
    } else {
      const dirMul = sortDir === 'asc' ? 1 : -1;
      const key = sortKey;
      const cmp = (a: ProblematicRow, b: ProblematicRow): number => {
        switch (key) {
          case 'customer': {
            const av = (a.order?.customerName || a.title || '').toLocaleLowerCase(
              'cs'
            );
            const bv = (b.order?.customerName || b.title || '').toLocaleLowerCase(
              'cs'
            );
            return av.localeCompare(bv, 'cs');
          }
          case 'owner': {
            const av = (a.owner.name || a.owner.email || '').toLocaleLowerCase('cs');
            const bv = (b.owner.name || b.owner.email || '').toLocaleLowerCase('cs');
            return av.localeCompare(bv, 'cs');
          }
          case 'value': {
            const av = a.orderValue?.local?.value ?? -1;
            const bv = b.orderValue?.local?.value ?? -1;
            return av - bv;
          }
          case 'termin': {
            const av = a.scheduledFrom ? Date.parse(a.scheduledFrom) : 0;
            const bv = b.scheduledFrom ? Date.parse(b.scheduledFrom) : 0;
            return av - bv;
          }
        }
      };
      sorted.sort((a, b) => dirMul * cmp(a, b));
    }
    return sorted;
  }, [data, teamFilter, q, reasonsFilter, escalatedOnly, sortKey, sortDir]);

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

      {/* ── Search + reason chips + escalated toggle ───────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat: zákazník, OVT, ID objednávky…"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 pr-8 text-sm placeholder:text-gray-400 focus:border-[#1E8449] focus:outline-none focus:ring-1 focus:ring-[#1E8449]"
          />
          {q.length > 0 && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Vymazat hledání"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {REASON_CHIPS.map((c) => {
            const active = reasonsFilter.has(c.kind);
            return (
              <button
                key={c.kind}
                type="button"
                onClick={() => toggleReason(c.kind)}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  active
                    ? reasonBadgeClass(c.kind)
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {c.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setEscalatedOnly(!escalatedOnly)}
            aria-pressed={escalatedOnly}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              escalatedOnly
                ? 'border-rose-500 bg-rose-100 text-rose-900'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Jen s eskalací
          </button>
          {(reasonsFilter.size > 0 || escalatedOnly || q.length > 0) && (
            <button
              type="button"
              onClick={() =>
                updateSearchParam({ q: null, reasons: null, escalated: null })
              }
              className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Vyčistit filtry
            </button>
          )}
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
            cellPad={cellPad}
            isCompact={isCompact}
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
              <>
                {selectedItems.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#F8FAFC] px-4 py-3">
                    <p className="text-xs font-medium text-gray-700">
                      Vybráno {selectedItems.length}{' '}
                      {selectedItems.length === 1
                        ? 'zakázka'
                        : selectedItems.length < 5
                          ? 'zakázky'
                          : 'zakázek'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderIds(new Set())}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Zrušit výběr
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchSetup('nedopadlo')}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        Označit jako nedopadlo ({selectedItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchSetup('retence')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Poslat do retence ({selectedItems.length})
                      </button>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className={`${cellPad} w-8`}>
                          <span className="sr-only">Vybrat</span>
                        </th>
                        <th className={cellPad}>Proč</th>
                        <SortableTh
                          cellPad={cellPad}
                          label="Zákazník"
                          columnKey="customer"
                          activeKey={sortKey}
                          activeDir={sortDir}
                          onClick={handleSortClick}
                        />
                        <SortableTh
                          cellPad={cellPad}
                          label="OVT"
                          columnKey="owner"
                          activeKey={sortKey}
                          activeDir={sortDir}
                          onClick={handleSortClick}
                        />
                        <SortableTh
                          cellPad={cellPad}
                          label="Hodnota"
                          columnKey="value"
                          activeKey={sortKey}
                          activeDir={sortDir}
                          onClick={handleSortClick}
                          align="right"
                        />
                        <SortableTh
                          cellPad={cellPad}
                          label="Termín"
                          columnKey="termin"
                          activeKey={sortKey}
                          activeDir={sortDir}
                          onClick={handleSortClick}
                        />
                        <th className={`${cellPad} text-right`}>Akce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRows.map((row) => {
                        const localOrderId = row.order?.id ?? null;
                        const selectable =
                          localOrderId != null &&
                          selectableOrderIds.has(localOrderId);
                        return (
                          <ProblematicRowView
                            key={row.key}
                            row={row}
                            cellPad={cellPad}
                            isCompact={isCompact}
                            selectable={selectable}
                            selected={
                              selectable && selectedOrderIds.has(localOrderId!)
                            }
                            onToggleSelect={
                              selectable
                                ? () => toggleOrderSelected(localOrderId!)
                                : undefined
                            }
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>

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

      {batchSetup && selectedItems.length > 0 && (
        <TlBatchConfirmSetupModal
          decision={batchSetup}
          items={selectedItems}
          onCancel={() => setBatchSetup(null)}
          onSubmit={({ reason, note }) => {
            setBatchWizardPayload({
              decision: batchSetup,
              reason,
              note,
              items: selectedItems,
            });
            setBatchSetup(null);
          }}
        />
      )}

      {batchWizardPayload && (
        <TlBatchConfirmWizardModal
          items={batchWizardPayload.items}
          decision={batchWizardPayload.decision}
          reason={batchWizardPayload.reason}
          note={batchWizardPayload.note}
          onClose={() => setBatchWizardPayload(null)}
          onDone={() => {
            setBatchWizardPayload(null);
            setSelectedOrderIds(new Set());
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
  cellPad,
  isCompact,
}: {
  escalations: EscalationRow[];
  onResolveClick: (e: EscalationRow) => void;
  cellPad: string;
  isCompact: boolean;
}) {
  if (escalations.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">
          Eskalované na team leadera{' '}
          <span className="text-gray-500">({escalations.length})</span>
        </h2>
        <p className="text-xs text-gray-500">
          Otevřené eskalace bez ohledu na den — dokud je neuzavřete.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className={cellPad}>Zdroj</th>
              <th className={cellPad}>Zakázka</th>
              <th className={cellPad}>Poznámka</th>
              <th className={cellPad}>Kdo &amp; kdy</th>
              <th className={`${cellPad} text-right`}>Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {escalations.map((e) => (
              <tr
                key={e.id}
                className="border-l-4 border-l-rose-500 align-top"
              >
                <td className={cellPad}>
                  <span className="inline-block w-fit rounded-md border border-rose-500 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-900">
                    {roleLabel(e.escalated_by_role)}
                  </span>
                </td>
                <td className={`${cellPad} whitespace-nowrap`}>
                  <div className="font-semibold text-gray-900">
                    #{e.order_id}
                  </div>
                </td>
                <td className={cellPad}>
                  <p
                    className={`whitespace-pre-line text-gray-800 ${
                      isCompact ? 'line-clamp-2' : ''
                    }`}
                    title={isCompact ? e.escalation_note : undefined}
                  >
                    {e.escalation_note}
                  </p>
                </td>
                <td className={`${cellPad} whitespace-nowrap text-gray-600`}>
                  <div className="truncate">{e.escalated_by}</div>
                  <div className="text-xs text-gray-400">
                    {formatDateTimeCs(e.escalated_at)}
                  </div>
                </td>
                <td className={`${cellPad} whitespace-nowrap text-right`}>
                  <div className="flex flex-nowrap justify-end gap-1.5">
                    <a
                      href={officePortalOrderDeepLink(e.order_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Portál
                    </a>
                    <button
                      type="button"
                      onClick={() => onResolveClick(e)}
                      className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Uzavřít
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable table header
// ---------------------------------------------------------------------------

function SortableTh({
  cellPad,
  label,
  columnKey,
  activeKey,
  activeDir,
  onClick,
  align,
}: {
  cellPad: string;
  label: string;
  columnKey: Exclude<SortKey, 'default'>;
  activeKey: SortKey;
  activeDir: SortDir;
  onClick: (key: Exclude<SortKey, 'default'>) => void;
  align?: 'left' | 'right';
}) {
  const isActive = activeKey === columnKey;
  const marker = isActive ? (activeDir === 'asc' ? '↑' : '↓') : '↕';
  return (
    <th
      className={`${cellPad} ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onClick(columnKey)}
        className={`inline-flex items-center gap-1 ${
          isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
        }`}
      >
        {label}
        <span
          aria-hidden
          className={`${isActive ? 'text-gray-900' : 'text-gray-300'} text-[10px]`}
        >
          {marker}
        </span>
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// One day row
// ---------------------------------------------------------------------------

function ProblematicRowView({
  row,
  cellPad,
  isCompact,
  selectable,
  selected,
  onToggleSelect,
}: {
  row: ProblematicRow;
  cellPad: string;
  isCompact: boolean;
  selectable: boolean;
  selected: boolean;
  onToggleSelect?: () => void;
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
      <td className={`${cellPad} w-8`}>
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Vybrat zakázku ${row.order?.id ?? row.title}`}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
        ) : (
          <span className="inline-block h-4 w-4" aria-hidden />
        )}
      </td>
      <td className={cellPad}>
        <div className="flex flex-col gap-1">
          {row.reasons.map((r, i) => (
            <span
              key={`${r.kind}-${i}`}
              title={tooltipForReason(r)}
              className={`inline-block w-fit whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${reasonBadgeClass(
                r.kind
              )}`}
            >
              {labelForReason(r)}
            </span>
          ))}
          {row.openEscalation && (
            <span
              className="inline-block w-fit whitespace-nowrap rounded-md border border-rose-500 bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900"
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
        {!isCompact && row.order && (
          <div className="text-xs text-gray-400">
            Zakázka #{row.order.id} · vytvořeno {formatDateCs(row.order.createdAt)}
          </div>
        )}
      </td>
      <td
        className={`${cellPad} whitespace-nowrap text-gray-700`}
        title={row.owner.email ?? undefined}
      >
        {row.owner.name ?? (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className={`${cellPad} whitespace-nowrap text-right`}>
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
      <td className={`${cellPad} whitespace-nowrap text-right`}>
        <div className="flex flex-nowrap justify-end gap-1.5">
          {row.raynetEventId != null && (
            <a
              href={raynetEventDeepLink(row.raynetEventId)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-[#1E8449] px-2 py-1 text-xs font-medium text-[#1E8449] hover:bg-[#F1F8F4]"
            >
              Raynet
            </a>
          )}
          {row.raynetCompanyId != null && (
            <Link
              href={`/klient/${row.raynetCompanyId}`}
              className="shrink-0 rounded-md border border-purple-300 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50"
            >
              Karta
            </Link>
          )}
          {row.raynetCompanyId != null && (
            <Link
              href={`/klient/${row.raynetCompanyId}/hovory`}
              className="shrink-0 rounded-md border border-[#1565C0] px-2 py-1 text-xs font-medium text-[#1565C0] hover:bg-[#E3F2FD]"
              title="Hovory z Daktely"
            >
              Hovory
            </Link>
          )}
          {row.order && (
            <a
              href={officePortalOrderDeepLink(row.order.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Portál
            </a>
          )}
          {row.order?.source_erp_order_id != null && (
            <a
              href={erpOrderDeepLink(row.order.source_erp_order_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-[#1565C0] px-2 py-1 text-xs font-medium text-[#1565C0] hover:bg-[#E3F2FD]"
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
