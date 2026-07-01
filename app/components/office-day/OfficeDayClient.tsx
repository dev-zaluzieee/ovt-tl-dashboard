'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { erpOrderDeepLink } from '@/lib/erpUrls';
import { officePortalOrderDeepLink } from '@/lib/officePortalUrls';
import {
  getOfficeDayEventTier,
  officeDayEventTierBadgeClass,
  officeDayEventTierShortLabelCs,
} from '@/lib/officeDayEventTier';
import { raynetEventDeepLink } from '@/lib/raynetUrls';
import { OfficeDayCalendarGrid, type CalendarEventRow } from './OfficeDayCalendarGrid';
import { RetentionBadge } from '@/app/components/retention/RetentionBadge';
import { TeamFilter, type TeamSelection } from '@/app/components/teams/TeamFilter';
import {
  PersonFilterCombobox,
  type PairedPersonOption,
} from './PersonFilterCombobox';

/** Backend `PairedRaynetPerson` */
type PairedOwner = {
  raynet_id: string;
  raynet_name: string | null;
  app_email: string | null;
};

/** Stejný tvar jako `CalendarEventRow` (seznam událostí z API). */
type OfficeDayEventRow = CalendarEventRow;

type FetchWarning = {
  raynet_id: string;
  raynet_name: string | null;
  message: string;
};

type OfficeDayPayload = {
  date: string;
  pairedPeople: PairedPersonOption[];
  activePersonFilter: string | null;
  events: OfficeDayEventRow[];
  fetchWarnings: FetchWarning[];
  orderLinkingAvailable: boolean;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Zobrazení přehledu dne — sdílitelné přes `?view=`. */
export type OfficeDayViewMode = 'calendar' | 'list';

function parseViewMode(raw: string | null): OfficeDayViewMode {
  if (raw === 'list') {
    return 'list';
  }
  return 'calendar';
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmdFromUrl(raw: string | null): string | null {
  if (!raw || !YMD_RE.test(raw)) {
    return null;
  }
  const [yy, mm, dd] = raw.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(yy, mm - 1, dd);
  if (
    dt.getFullYear() !== yy ||
    dt.getMonth() !== mm - 1 ||
    dt.getDate() !== dd
  ) {
    return null;
  }
  return raw;
}

function formatLongDateCs(ymd: string): string {
  const [yy, mm, dd] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(yy, mm - 1, dd);
  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

function parseMs(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function formatTimeRangeCs(ev: OfficeDayEventRow): string {
  const a = parseMs(ev.scheduledFrom);
  const b = parseMs(ev.scheduledTill);
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

/**
 * Přehled dne — načítání z API, filtr osoby a synchronizace `?date=` + `?person=` do URL (sdílení, záložky, zpět/vpřed).
 */
export function OfficeDayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const [selectedYmd, setSelectedYmd] = useState<string>(() => {
    const fromUrl = parseYmdFromUrl(searchParams.get('date'));
    return fromUrl ?? localYmd(new Date());
  });
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(() => {
    const p = searchParams.get('person')?.trim();
    return p || null;
  });
  const [viewMode, setViewMode] = useState<OfficeDayViewMode>(() =>
    parseViewMode(searchParams.get('view'))
  );

  const [data, setData] = useState<OfficeDayPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamSelection | null>(null);

  /** Zajistí v URL vždy `date` (pro hluboké odkazy a obnovení stránky). */
  useEffect(() => {
    if (!searchParams.get('date')) {
      const p = new URLSearchParams(searchParams.toString());
      p.set('date', localYmd(new Date()));
      router.replace(`/prehled-dne?${p.toString()}`, { scroll: false });
    }
  }, [router, searchParams]);

  /** Zpět / vpřed v prohlížeči — přečte `date` a `person` z adresní řádky. */
  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const d = parseYmdFromUrl(params.get('date'));
    if (d) {
      setSelectedYmd((prev) => (d !== prev ? d : prev));
    }
    const p = params.get('person')?.trim() || null;
    setSelectedPersonId((prev) => (p !== prev ? p : prev));
    const v = parseViewMode(params.get('view'));
    setViewMode((prev) => (v !== prev ? v : prev));
  }, [queryString]);

  const replaceOfficeDayUrl = useCallback(
    (ymd: string, person: string | null, view: OfficeDayViewMode) => {
      const p = new URLSearchParams();
      p.set('date', ymd);
      if (person) {
        p.set('person', person);
      }
      if (view === 'list') {
        p.set('view', 'list');
      }
      router.replace(`/prehled-dne?${p.toString()}`, { scroll: false });
    },
    [router]
  );

  const load = useCallback(async (ymd: string, person: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ date: ymd });
      if (person) {
        qs.set('person', person);
      }
      const res = await fetch(`/api/raynet/office-day-events?${qs}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: OfficeDayPayload;
      };
      if (!res.ok || !body.success || !body.data) {
        setData(null);
        setError(body.message || `Chyba při načítání (${res.status})`);
        return;
      }
      setData(body.data);
    } catch {
      setData(null);
      setError('Nepodařilo se spojit se serverem. Zkuste to znovu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(selectedYmd, selectedPersonId);
  }, [selectedYmd, selectedPersonId, load]);

  /** Events after applying the (client-side) team filter on event owners. */
  const filteredEvents = useMemo(() => {
    if (!data) return [];
    if (!teamFilter) return data.events;
    const ids = new Set(teamFilter.memberRaynetIds);
    return data.events.filter((ev) =>
      ev.owners.some((o) => ids.has(String(o.raynet_id)))
    );
  }, [data, teamFilter]);

  const stats = useMemo(() => {
    if (!data) {
      return null;
    }
    const withOrder = filteredEvents.filter((e) => e.order != null).length;
    return {
      total: filteredEvents.length,
      withOrder,
      withoutOrder: filteredEvents.length - withOrder,
    };
  }, [data, filteredEvents]);

  const shiftDay = (delta: number) => {
    const [y, m, d] = selectedYmd.split('-').map((x) => parseInt(x, 10));
    const next = new Date(y, m - 1, d + delta);
    const ymd = localYmd(next);
    setSelectedYmd(ymd);
    replaceOfficeDayUrl(ymd, selectedPersonId, viewMode);
  };

  const goToday = () => {
    const ymd = localYmd(new Date());
    setSelectedYmd(ymd);
    replaceOfficeDayUrl(ymd, selectedPersonId, viewMode);
  };

  const onDateInputChange = (ymd: string) => {
    setSelectedYmd(ymd);
    replaceOfficeDayUrl(ymd, selectedPersonId, viewMode);
  };

  const onPersonChange = (id: string | null) => {
    setSelectedPersonId(id);
    replaceOfficeDayUrl(selectedYmd, id, viewMode);
  };

  const onViewModeChange = (mode: OfficeDayViewMode) => {
    setViewMode(mode);
    replaceOfficeDayUrl(selectedYmd, selectedPersonId, mode);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Vybraný den</h2>
          <p className="text-gray-600">{formatLongDateCs(selectedYmd)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            aria-label="Předchozí den"
          >
            ← Předchozí den
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg bg-[#1E8449] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#166d3b]"
          >
            Dnes
          </button>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            aria-label="Následující den"
          >
            Následující den →
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="sr-only">Konkrétní datum</span>
            <input
              type="date"
              value={selectedYmd}
              onChange={(e) => onDateInputChange(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm"
            />
          </label>
        </div>
      </div>

      <PersonFilterCombobox
        options={data?.pairedPeople ?? []}
        value={selectedPersonId}
        onChange={onPersonChange}
        disabled={loading && !data}
      />

      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <TeamFilter value={teamFilter?.id ?? null} onChange={setTeamFilter} />
      </div>

      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
        role="group"
        aria-label="Způsob zobrazení událostí"
      >
        <span className="text-sm font-medium text-gray-800">Zobrazení</span>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            type="button"
            onClick={() => onViewModeChange('calendar')}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              viewMode === 'calendar'
                ? 'bg-white text-[#1E8449] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={viewMode === 'calendar'}
          >
            Kalendář
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              viewMode === 'list'
                ? 'bg-white text-[#1E8449] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={viewMode === 'list'}
          >
            Seznam
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

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {data.fetchWarnings.length > 0 && (
            <div
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="status"
            >
              <p className="font-semibold">Část dat z Raynetu se nepodařilo načíst</p>
              <ul className="mt-2 list-disc pl-5">
                {data.fetchWarnings.map((w) => (
                  <li key={w.raynet_id}>
                    {w.raynet_name || w.raynet_id}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!data.orderLinkingAvailable && (
            <div
              className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800"
              role="status"
            >
              Propojení s objednávkami v databázi není k dispozici. Události z Raynetu se zobrazí,
              ale stav „v systému“ nebude vyplněn.
            </div>
          )}

          {data.pairedPeople.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
              <p className="font-medium text-gray-900">Zatím nikdo nemá propojený Raynet</p>
              <p className="mt-2 text-sm">
                Až administrátor doplní Raynet osobu u uživatelů, zde se objeví jejich události za
                vybraný den.
              </p>
            </div>
          )}

          {data.pairedPeople.length > 0 && stats && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Zobrazení
                </p>
                <p className="mt-1 text-lg font-semibold text-[#1E8449]">
                  {data.activePersonFilter ? 'Jeden obchodník' : 'Všichni obchodníci'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Propojeno v systému: {data.pairedPeople.length}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Události celkem
                </p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.total}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  S objednávkou u nás
                </p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.withOrder}</p>
                {stats.withoutOrder > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {stats.withoutOrder} bez záznamu objednávky
                  </p>
                )}
              </div>
            </div>
          )}

          {data.pairedPeople.length > 0 && filteredEvents.length === 0 && !error && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
              <p className="font-medium text-gray-900">Pro tento den nejsou žádné vybrané události</p>
              <p className="mt-2 text-sm">
                {teamFilter
                  ? `Pro tým „${teamFilter.name}“ nejsou v tento den žádné události. Zkuste jiný datum nebo tým.`
                  : 'Zkuste jiný datum, jiného obchodníka, nebo ověřte kategorie událostí v Raynetu.'}
              </p>
            </div>
          )}

          {filteredEvents.length > 0 && viewMode === 'calendar' && (
            <OfficeDayCalendarGrid
              ymd={selectedYmd}
              pairedPeople={data.pairedPeople}
              selectedPersonId={selectedPersonId}
              events={filteredEvents}
              orderLinkingAvailable={data.orderLinkingAvailable}
            />
          )}

          {filteredEvents.length > 0 && viewMode === 'list' && (
            <ul className="space-y-3">
              {filteredEvents.map((ev) => {
                const listTier = getOfficeDayEventTier(ev.order, data.orderLinkingAvailable);
                return (
                <li
                  key={ev.raynetEventId}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-[#E8F5E9] px-2.5 py-1 text-xs font-semibold text-[#1E8449]">
                          {formatTimeRangeCs(ev)}
                        </span>
                        {ev.categoryLabel && (
                          <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                            {ev.categoryLabel}
                          </span>
                        )}
                        <span
                          className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${officeDayEventTierBadgeClass(
                            listTier
                          )}`}
                        >
                          {officeDayEventTierShortLabelCs(listTier)}
                        </span>
                        {ev.order && (
                          <span className="rounded-md border border-[#1565C0]/35 bg-[#E3F2FD]/70 px-2 py-1 text-[11px] font-semibold text-[#1565C0]">
                            Zakázka #{ev.order.id}
                          </span>
                        )}
                        <RetentionBadge
                          inRetention={ev.inRetention}
                          inRetentionRequested={ev.inRetentionRequested}
                        />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{ev.title}</h3>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-700">Obchodník / účet: </span>
                        {ownerSummary(ev.owners)}
                      </p>
                      {ev.order?.customerName && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium text-gray-700">Zákazník v objednávce: </span>
                          {ev.order.customerName}
                        </p>
                      )}
                      {ev.openRequest && (
                        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          <span className="font-semibold">Poznámka OVT</span>
                          {` (${ev.openRequest.user_id}): `}
                          <span className="whitespace-pre-wrap">{ev.openRequest.reason}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col lg:items-stretch">
                      <a
                        href={raynetEventDeepLink(ev.raynetEventId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-lg border border-[#1E8449] px-4 py-2 text-sm font-semibold text-[#1E8449] hover:bg-[#F1F8F4]"
                      >
                        Otevřít v Raynetu
                      </a>
                      {ev.order && (
                        <>
                          <a
                            href={officePortalOrderDeepLink(ev.order.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-lg bg-[#1E8449] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#166d3b]"
                          >
                            Zakázka v kancelářském portálu
                          </a>
                          {ev.order.source_erp_order_id != null && (
                            <a
                              href={erpOrderDeepLink(ev.order.source_erp_order_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-lg border-2 border-[#1565C0] bg-white px-4 py-2 text-sm font-semibold text-[#1565C0] hover:bg-[#E3F2FD]"
                            >
                              Otevřít zakázku v ERP
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
