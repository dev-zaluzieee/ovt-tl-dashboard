'use client';

import type { RefObject } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';
import {
  assignOverlapLanes,
  computeVisibleHourRange,
  DEFAULT_DAY_END_EXCLUSIVE,
  DEFAULT_DAY_START_HOUR,
  eventBarGeometry,
  hourLabels,
  nowIndicatorLeftPct,
  parseEventMs,
} from '@/lib/officeDayCalendar';
import {
  getOfficeDayEventTier,
  officeDayEventTierBarClass,
  officeDayEventTierBadgeClass,
  officeDayEventTierLabelCs,
} from '@/lib/officeDayEventTier';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import { RetentionBadge } from '@/app/components/retention/RetentionBadge';
import type { PairedPersonOption } from './PersonFilterCombobox';

type PairedOwner = {
  raynet_id: string;
  raynet_name: string | null;
  app_email: string | null;
};

export type CalendarEventRow = {
  raynetEventId: number;
  title: string;
  scheduledFrom: string | null;
  scheduledTill: string | null;
  categoryLabel: string | null;
  /** Free-form Raynet tags (case as the user typed them). Empty for legacy events. */
  tags: string[];
  /** State B: Raynet event has CN tag. */
  inRetention: boolean;
  /** State A: open OVT_REQUEST in our DB. */
  inRetentionRequested: boolean;
  /** OVT's note + identity from the open request. Null when no open request. */
  openRequest: {
    id: number;
    reason: string;
    user_id: string;
    created_at: string;
  } | null;
  owners: PairedOwner[];
  order: {
    id: number;
    customerName: string | null;
    source_erp_order_id: number | null;
    admfExportStatus?: 'none' | 'not_exported' | 'exported' | null;
  } | null;
};

type OfficeDayCalendarGridProps = {
  ymd: string;
  pairedPeople: PairedPersonOption[];
  /** `null` = všichni obchodníci se dnem s událostí (řádek jen pokud má událost). */
  selectedPersonId: string | null;
  events: CalendarEventRow[];
  orderLinkingAvailable: boolean;
  /** Called when user clicks the "Změnit stav" button on an event popover. */
  onTriage?: (orderId: number) => void;
};

const LANE_HEIGHT_PX = 26;
const LANE_GAP_PX = 4;
const ROW_PADDING_PX = 8;

function formatTimeRangeCs(ev: CalendarEventRow): string {
  const a = parseEventMs(ev.scheduledFrom);
  const b = parseEventMs(ev.scheduledTill);
  const tf = new Intl.DateTimeFormat('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (a != null && b != null) {
    return `${tf.format(new Date(a))} – ${tf.format(new Date(b))}`;
  }
  if (a != null) {
    return tf.format(new Date(a));
  }
  return '—';
}

function ownerSummary(owners: PairedOwner[]): string {
  if (owners.length === 0) {
    return '—';
  }
  return owners
    .map((o) => o.raynet_name?.trim() || o.app_email || `Raynet #${o.raynet_id}`)
    .join(', ');
}

function hourTickLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

/** Svislá čára aktuálního času; `leftPct` je stejné jako u pruhů událostí (0–100 % šířky osy). */
function CalendarNowMarker({ leftPct }: { leftPct: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-[15] w-px bg-red-500 shadow-[0_0_0_1px_rgba(255,255,255,0.85)]"
      style={{ left: `${leftPct}%` }}
      aria-hidden
    />
  );
}

/**
 * Časová osa podle obchodníků — kompaktní názvy v pruzích, detail po kliknutí (klávesnice + čtečky).
 */
export function OfficeDayCalendarGrid({
  ymd,
  pairedPeople,
  selectedPersonId,
  events,
  orderLinkingAvailable,
  onTriage,
}: OfficeDayCalendarGridProps) {
  const dialogTitleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const visiblePeople = useMemo(() => {
    if (selectedPersonId) {
      return pairedPeople.filter((p) => p.raynet_id === selectedPersonId);
    }
    return pairedPeople;
  }, [pairedPeople, selectedPersonId]);

  /** Raynet osoby, které mají aspoň jednu událost v `events` (řádky kalendáře). */
  const ownerIdsWithEvents = useMemo(() => {
    const s = new Set<string>();
    for (const ev of events) {
      for (const o of ev.owners) {
        s.add(o.raynet_id);
      }
    }
    return s;
  }, [events]);

  const peopleWithEventsToday = useMemo(
    () => visiblePeople.filter((p) => ownerIdsWithEvents.has(p.raynet_id)),
    [visiblePeople, ownerIdsWithEvents]
  );

  const { startHour, endExclusive } = useMemo(
    () =>
      computeVisibleHourRange(ymd, events, {
        defaultStartHour: DEFAULT_DAY_START_HOUR,
        defaultEndExclusive: DEFAULT_DAY_END_EXCLUSIVE,
      }),
    [ymd, events]
  );

  const hours = useMemo(() => hourLabels(startHour, endExclusive), [startHour, endExclusive]);

  /** Aktuální čas pro indikátor „teď“; obnovuje se při změně dne v UI a v intervalu jen u dnešního data. */
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
  }, [ymd]);

  useEffect(() => {
    if (nowIndicatorLeftPct(ymd, startHour, endExclusive, Date.now()) == null) {
      return;
    }
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(id);
  }, [ymd, startHour, endExclusive]);

  const nowLeftPct = useMemo(
    () => nowIndicatorLeftPct(ymd, startHour, endExclusive, nowMs),
    [ymd, startHour, endExclusive, nowMs]
  );

  const [openEvent, setOpenEvent] = useState<CalendarEventRow | null>(null);

  useEffect(() => {
    if (!openEvent) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenEvent(null);
      }
    };
    document.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [openEvent]);

  const eventsForPerson = useCallback(
    (raynetId: string) =>
      events.filter((ev) => ev.owners.some((o) => o.raynet_id === raynetId)),
    [events]
  );

  const rowLayouts = useMemo(() => {
    return peopleWithEventsToday.map((person) => {
      const list = eventsForPerson(person.raynet_id);
      const bars = list
        .map((ev) => {
          const g = eventBarGeometry(ev, ymd, startHour, endExclusive);
          if (!g) {
            return null;
          }
          return { ev, ...g };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);

      const laned = assignOverlapLanes(bars);
      const laneCount = laned.length === 0 ? 1 : Math.max(...laned.map((b) => b.lane)) + 1;
      const rowInnerHeight =
        ROW_PADDING_PX * 2 + laneCount * LANE_HEIGHT_PX + Math.max(0, laneCount - 1) * LANE_GAP_PX;

      return { person, laned, rowInnerHeight, laneCount };
    });
  }, [peopleWithEventsToday, eventsForPerson, ymd, startHour, endExclusive]);

  if (visiblePeople.length === 0) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
        role="status"
      >
        <p className="font-medium">Kalendář nelze zobrazit — chybí řádek obchodníka.</p>
        <p className="mt-1 text-amber-900">
          Zkuste zrušit filtr osoby (všichni obchodníci) nebo vyberte jiného obchodníka ze seznamu.
        </p>
      </div>
    );
  }

  if (peopleWithEventsToday.length === 0 && events.length > 0) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
        role="status"
      >
        <p className="font-medium">Žádný obchodník z výběru nemá k této události přiřazení v datech.</p>
        <p className="mt-1 text-amber-900">
          Zkuste zrušit filtr osoby, nebo kontaktujte správce — u událostí chybí vlastník v Raynetu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Zobrazují se jen obchodníci s aspoň jednou událostí v tento den.
        Kliknutím na pruh otevřete detail.
      </p>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-400 bg-slate-200" />
          Bez zakázky
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-amber-500 bg-amber-100" />
          Zakázka — čeká na export ADMF
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-emerald-600 bg-emerald-100" />
          ADMF exportován
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-orange-500 bg-orange-100" />
          Stav ADMF nelze načíst
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-px shrink-0 bg-red-500 shadow-[0_0_0_1px_rgba(255,255,255,0.85)]" />
          Nyní (jen u dnešního dne)
        </li>
      </ul>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="min-w-[720px]">
          {/* Hlavička hodin */}
          <div
            className="grid border-b border-gray-200 bg-gray-50"
            style={{
              gridTemplateColumns: `minmax(10rem, 12rem) 1fr`,
            }}
          >
            <div className="sticky left-0 z-20 border-r border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Obchodník
            </div>
            <div className="relative flex min-h-[2.5rem] border-l border-gray-100">
              {hours.map((h) => (
                <div
                  key={h}
                  className="flex-1 border-l border-gray-200/80 py-2 text-center text-[11px] font-semibold tabular-nums text-gray-600 first:border-l-0"
                >
                  {hourTickLabel(h)}
                </div>
              ))}
              {nowLeftPct != null && <CalendarNowMarker leftPct={nowLeftPct} />}
            </div>
          </div>

          {/* Řádky */}
          {rowLayouts.map(({ person, laned, rowInnerHeight }) => (
            <div
              key={person.raynet_id}
              className="grid border-b border-gray-100 last:border-b-0"
              style={{
                gridTemplateColumns: `minmax(10rem, 12rem) 1fr`,
              }}
            >
              <div className="sticky left-0 z-10 flex items-start border-r border-gray-200 bg-white px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{person.label}</p>
                  {person.app_emails[0] && (
                    <p className="mt-0.5 truncate text-xs text-gray-500">{person.app_emails[0]}</p>
                  )}
                </div>
              </div>

              <div
                className="relative border-l border-gray-100 bg-[linear-gradient(to_right,#f3f4f6_1px,transparent_1px)]"
                style={{
                  backgroundSize: `${100 / hours.length}% 100%`,
                  minHeight: Math.max(rowInnerHeight, 56),
                }}
              >
                {/* Vertikální značky hodin (jemně přes gradient) */}
                <div
                  className="pointer-events-none absolute inset-0 flex"
                  aria-hidden
                >
                  {hours.map((h) => (
                    <div key={h} className="flex-1 border-l border-gray-200/80 first:border-l-0" />
                  ))}
                </div>

                <div
                  className="relative px-0"
                  style={{
                    paddingTop: ROW_PADDING_PX,
                    paddingBottom: ROW_PADDING_PX,
                    minHeight: Math.max(rowInnerHeight, 56),
                  }}
                >
                  {laned.map(({ ev, leftPct, widthPct, lane }) => {
                    const tier = getOfficeDayEventTier(ev.order, orderLinkingAvailable);
                    const barCls = officeDayEventTierBarClass(tier);
                    const inRetention = ev.inRetention;
                    const inRequested = ev.inRetentionRequested && !ev.inRetention;
                    return (
                      <button
                        key={ev.raynetEventId}
                        type="button"
                        className={`absolute flex max-w-full items-center gap-1 overflow-hidden rounded-md border px-1.5 text-left text-xs font-medium shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-600 ${barCls} ${
                          inRetention
                            ? 'ring-2 ring-red-500 ring-offset-1'
                            : inRequested
                              ? 'ring-2 ring-amber-500 ring-offset-1'
                              : ''
                        }`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          top:
                            ROW_PADDING_PX +
                            lane * (LANE_HEIGHT_PX + LANE_GAP_PX),
                          height: LANE_HEIGHT_PX,
                        }}
                        title={`${ev.title} · ${formatTimeRangeCs(ev)} · ${officeDayEventTierLabelCs(tier)}${
                          inRetention ? ' · v retencích' : inRequested ? ' · zasláno na retence' : ''
                        }`}
                        onClick={() => setOpenEvent(ev)}
                      >
                        {inRetention ? (
                          <span aria-hidden className="shrink-0 rounded-sm bg-red-700 px-1 text-[10px] font-bold uppercase tracking-tight text-white">
                            R
                          </span>
                        ) : inRequested ? (
                          <span aria-hidden className="shrink-0 rounded-sm bg-amber-600 px-1 text-[10px] font-bold uppercase tracking-tight text-white">
                            R?
                          </span>
                        ) : null}
                        <span className="block truncate">{ev.title}</span>
                      </button>
                    );
                  })}
                </div>
                {nowLeftPct != null && <CalendarNowMarker leftPct={nowLeftPct} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail události (modal — bez hover-only, vhodné pro kancelář i dotyk) */}
      {openEvent && (
        <OpenEventModalBody
          openEvent={openEvent}
          orderLinkingAvailable={orderLinkingAvailable}
          dialogTitleId={dialogTitleId}
          closeBtnRef={closeBtnRef}
          onClose={() => setOpenEvent(null)}
          hourTickLabelStart={hourTickLabel(startHour)}
          hourTickLabelEnd={hourTickLabel(endExclusive)}
          onTriage={onTriage}
        />
      )}
    </div>
  );
}

/** Modal vypnuto do podkomponenty kvůli přehlednosti a jednomu výpočtu `tier`. */
function OpenEventModalBody({
  openEvent,
  orderLinkingAvailable,
  dialogTitleId,
  closeBtnRef,
  onClose,
  hourTickLabelStart,
  hourTickLabelEnd,
  onTriage,
}: {
  openEvent: CalendarEventRow;
  orderLinkingAvailable: boolean;
  dialogTitleId: string;
  closeBtnRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onTriage?: (orderId: number) => void;
  hourTickLabelStart: string;
  hourTickLabelEnd: string;
}) {
  const tier = getOfficeDayEventTier(openEvent.order, orderLinkingAvailable);

  return (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  id={dialogTitleId}
                  className="text-lg font-semibold leading-snug text-gray-900"
                >
                  {openEvent.title}
                </p>
                <p className="mt-1 text-sm text-gray-600">{formatTimeRangeCs(openEvent)}</p>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={onClose}
              >
                Zavřít
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${officeDayEventTierBadgeClass(
                  tier
                )}`}
              >
                {officeDayEventTierLabelCs(tier)}
              </span>
              {openEvent.categoryLabel && (
                <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                  {openEvent.categoryLabel}
                </span>
              )}
              {openEvent.order && (
                <span className="rounded-md border border-[#1565C0]/40 bg-[#E3F2FD] px-2.5 py-1 text-xs font-semibold text-[#1565C0]">
                  Objednávka #{openEvent.order.id}
                </span>
              )}
              <RetentionBadge
                inRetention={openEvent.inRetention}
                inRetentionRequested={openEvent.inRetentionRequested}
              />
            </div>

            <p className="mt-3 text-sm text-gray-600">
              <span className="font-medium text-gray-800">Účast / vlastník v Raynetu: </span>
              {ownerSummary(openEvent.owners)}
            </p>
            {openEvent.order?.customerName && (
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Zákazník v objednávce: </span>
                {openEvent.order.customerName}
              </p>
            )}

            {openEvent.openRequest && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-900">
                  Poznámka OVT — {openEvent.openRequest.user_id}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-amber-900">
                  {openEvent.openRequest.reason}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                href={raynetEventDeepLink(openEvent.raynetEventId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg border border-[#1E8449] px-4 py-2.5 text-sm font-semibold text-[#1E8449] hover:bg-[#F1F8F4]"
              >
                Otevřít v Raynetu
              </a>
              {openEvent.order && (
                <>
                  <a
                    href={officePortalOrderDeepLink(openEvent.order.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg bg-[#1E8449] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#166d3b]"
                  >
                    Zakázka v kancelářském portálu
                  </a>
                  {openEvent.order.source_erp_order_id != null && (
                    <a
                      href={erpOrderDeepLink(openEvent.order.source_erp_order_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border-2 border-[#1565C0] bg-white px-4 py-2.5 text-sm font-semibold text-[#1565C0] hover:bg-[#E3F2FD]"
                    >
                      Otevřít zakázku v ERP
                    </a>
                  )}
                </>
              )}
              {openEvent.order && onTriage && (
                <button
                  type="button"
                  onClick={() => {
                    onTriage(openEvent.order!.id);
                    onClose();
                  }}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700"
                >
                  Změnit stav
                </button>
              )}
            </div>

          </div>
        </div>
  );
}
