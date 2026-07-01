'use client';

/**
 * Karta klienta — customer-level overview that mirrors Raynet's Company
 * detail page (see `Company&ei=X` URL in Raynet). Three-column layout on
 * desktop:
 *   • Left sidebar  — customer name, address, contact, owner, Raynet deep-link
 *   • Center        — "Časová osa" (timeline) split into "Co nás čeká" /
 *                     "Co se stalo", containing events, phoneCalls, tasks,
 *                     and business cases — all routed through one /klient
 *                     API call. Each item shows date, kind icon, status,
 *                     title, description, category color pill, owner avatar.
 *   • Right sidebar — KPI strip: Prodáno za / Poslední výhra / Rozjednáno /
 *                     Otevřených OP / Následující aktivita / Poslední aktivita.
 *
 * No edit affordances yet — V1 is read-only. Existing edits (CN sending,
 * notes append, close-OP) all happen on the per-OP detail page, reachable
 * from each business-case timeline item via the "Otevřít v retenci" link
 * when our portal has a local mirror.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface KlientCardCompany {
  raynetCompanyId: number;
  name: string | null;
  code: string | null;
  rating: string | null;
  raynetStatus: string | null;
  isCompany: boolean;
  address: {
    street: string | null;
    city: string | null;
    zip: string | null;
    country: string | null;
    province: string | null;
    gpsLat: number | null;
    gpsLng: number | null;
  } | null;
  territory: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  email: string | null;
  email2: string | null;
  website: string | null;
  regNumber: string | null;
  taxNumber: string | null;
  owner: { id: number; fullName: string | null } | null;
  raynetDeepLink: string;
}

interface KlientCardStats {
  prodanoZa: number;
  posledniVyhraAt: string | null;
  rozjednano: number;
  otevrenychOp: number;
  nasledujiciAktivitaAt: string | null;
  posledniAktivitaAt: string | null;
}

type TimelineKind = 'event' | 'phoneCall' | 'task' | 'businessCase';

interface KlientTimelineItem {
  kind: TimelineKind;
  id: number;
  title: string;
  when: string;
  statusLabel: string | null;
  description: string | null;
  category: { id: number; label: string; color: string | null } | null;
  owner: { id: number; fullName: string | null } | null;
  raynetDeepLink: string;
  businessCase: {
    id: number;
    name: string | null;
    mirroredOrderId: number | null;
  } | null;
  phase: { id: number; label: string; color: string | null } | null;
  totalAmount: number | null;
}

interface KlientCardData {
  company: KlientCardCompany;
  stats: KlientCardStats;
  timeline: KlientTimelineItem[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatCzechDate(iso: string): string {
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/** Relative-days label matching Raynet's "za 3 dny" / "-13 dní" style. */
function formatRelativeDays(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  const diffMs = then.getTime() - now.getTime();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return 'dnes';
  if (days > 0) {
    if (days === 1) return 'zítra';
    if (days < 5) return `za ${days} dny`;
    return `za ${days} dní`;
  }
  if (days === -1) return 'včera';
  return `${days} dní`;
}

function formatKc(n: number): string {
  return `${new Intl.NumberFormat('cs-CZ').format(Math.round(n))} Kč`;
}

function formatKcShort(n: number): string {
  // Czech short form — "23,4 tis. Kč" for >=10000, full otherwise.
  if (Math.abs(n) >= 10000) {
    const thousands = n / 1000;
    return `${thousands.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} tis. Kč`;
  }
  return formatKc(n);
}

function initialsFromName(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Icons (minimal inline SVG — matches Raynet's compact circular badge style).
// ---------------------------------------------------------------------------

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function CheckSquareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}
function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
function MapIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
function RouteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  );
}
function GpsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function kindMeta(kind: TimelineKind): {
  label: string;
  Icon: React.FC<{ className?: string }>;
  ringColor: string;
} {
  switch (kind) {
    case 'phoneCall':
      return { label: 'Telefonát', Icon: PhoneIcon, ringColor: '#1565C0' };
    case 'task':
      return { label: 'Úkol', Icon: CheckSquareIcon, ringColor: '#1E8449' };
    case 'businessCase':
      return { label: 'Obchodní případ', Icon: BriefcaseIcon, ringColor: '#7C3AED' };
    case 'event':
    default:
      return { label: 'Událost', Icon: CalendarIcon, ringColor: '#0EA5E9' };
  }
}

function statusLabelCs(kind: TimelineKind, raw: string | null): string | null {
  if (!raw) return null;
  if (kind === 'businessCase') return raw; // Raynet phase value is already Czech.
  const map: Record<string, string> = {
    SCHEDULED: 'Naplánován',
    NEW: 'Nový',
    COMPLETED: 'Realizován',
    CANCELLED: 'Zrušen',
  };
  return map[raw] ?? raw;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KlientCardClient({
  raynetCompanyId,
}: {
  raynetCompanyId: number;
}) {
  const [data, setData] = useState<KlientCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/retention/klient/${encodeURIComponent(raynetCompanyId)}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || 'Nepodařilo se načíst kartu klienta.');
        setData(null);
        return;
      }
      setData(json.data as KlientCardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba spojení.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [raynetCompanyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Split + sort timeline. Future items ascend (nearest first); past items
  // descend (most recent first) — matching Raynet's UX.
  const { future, past } = useMemo(() => {
    const nowIso = new Date().toISOString();
    const items = data?.timeline ?? [];
    const fut = items.filter((i) => i.when > nowIso).sort((a, b) =>
      a.when.localeCompare(b.when)
    );
    const pst = items.filter((i) => i.when <= nowIso).sort((a, b) =>
      b.when.localeCompare(a.when)
    );
    return { future: fut, past: pst };
  }, [data?.timeline]);

  if (loading && !data) {
    return (
      <div className="grid animate-pulse grid-cols-1 gap-5 lg:grid-cols-[280px_1fr_240px]">
        <div className="h-96 rounded-2xl bg-gray-100" />
        <div className="h-96 rounded-2xl bg-gray-100" />
        <div className="h-96 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 rounded-md border border-red-400 px-2 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { company, stats, warnings } = data;

  return (
    <div>
      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Karta klienta načtena částečně:</p>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/retencni-portal"
          className="text-sm font-medium text-[#1E8449] hover:underline"
        >
          ← Zpět na retenční portál
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Načítání…' : 'Obnovit'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr_240px]">
        {/* ── LEFT SIDEBAR ── */}
        <CompanySidebar company={company} />

        {/* ── CENTER: TIMELINE ── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Časová osa</h2>
          {future.length === 0 && past.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-600">
              U tohoto klienta zatím nejsou žádné aktivity ani obchodní případy.
            </p>
          ) : (
            <>
              {future.length > 0 && (
                <Section title="Co nás čeká" items={future} />
              )}
              {past.length > 0 && (
                <Section title="Co se stalo" items={past} />
              )}
            </>
          )}
        </div>

        {/* ── RIGHT SIDEBAR: KPI STATS ── */}
        <StatsSidebar stats={stats} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar — company info
// ---------------------------------------------------------------------------

function CompanySidebar({ company }: { company: KlientCardCompany }) {
  const addressLines = company.address
    ? [
        company.address.street,
        [company.address.zip, company.address.city]
          .filter(Boolean)
          .join(' ') || null,
        company.address.province,
        company.address.country,
      ].filter((s): s is string => !!s && s.trim().length > 0)
    : [];

  const gpsLat = company.address?.gpsLat ?? null;
  const gpsLng = company.address?.gpsLng ?? null;
  const gpsString =
    gpsLat != null && gpsLng != null
      ? `${gpsLat.toFixed(8)}, ${gpsLng.toFixed(8)}`
      : null;
  const gpsMapsLink =
    gpsLat != null && gpsLng != null
      ? `https://www.google.com/maps/search/?api=1&query=${gpsLat},${gpsLng}`
      : null;
  const gpsDirLink =
    gpsLat != null && gpsLng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${gpsLat},${gpsLng}`
      : null;

  const hasAnyContact =
    company.primaryPhone ||
    company.secondaryPhone ||
    company.email ||
    company.email2 ||
    company.website;

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Klient
        </p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          {company.name ?? `#${company.raynetCompanyId}`}
        </h1>
        {company.code && (
          <p className="mt-0.5 text-xs text-gray-500">{company.code}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {company.raynetStatus && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
              {company.raynetStatus}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              company.isCompany
                ? 'bg-blue-100 text-blue-900'
                : 'bg-emerald-100 text-emerald-900'
            }`}
          >
            {company.isCompany ? 'Firma' : 'Fyzická osoba'}
          </span>
          {company.rating && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-800">
              Rating {company.rating}
            </span>
          )}
        </div>
        <a
          href={company.raynetDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-md border border-[#1565C0] px-3 py-1 text-xs font-semibold text-[#1565C0] hover:bg-[#E3F2FD]"
        >
          Otevřít v Raynetu ↗
        </a>
      </div>

      {/* SÍDLO FIRMY — mirrors Raynet's grouping (address + GPS + territory +
          contact info all in one card). Each row is read-only; phones/emails
          are clickable, GPS opens Google Maps. */}
      {(addressLines.length > 0 ||
        gpsString ||
        company.territory ||
        hasAnyContact) && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1565C0]">
              Sídlo firmy
            </p>
            <div className="flex items-center gap-1.5 text-gray-400">
              {gpsMapsLink && (
                <a
                  href={gpsMapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Otevřít v Google Maps"
                  className="hover:text-[#1565C0]"
                >
                  <MapIcon className="h-4 w-4" />
                </a>
              )}
              {gpsDirLink && (
                <a
                  href={gpsDirLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Navigovat"
                  className="hover:text-[#1565C0]"
                >
                  <RouteIcon className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {addressLines.length > 0 && (
            <p className="mt-2 text-sm text-gray-800">
              {addressLines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </p>
          )}

          {gpsString && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="font-mono text-xs text-gray-700">{gpsString}</p>
              <GpsIcon className="h-4 w-4 text-gray-400" />
            </div>
          )}

          {company.territory && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Obchodní teritorium
              </p>
              <p className="text-sm text-gray-800">{company.territory}</p>
            </div>
          )}

          {hasAnyContact && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {company.primaryPhone && (
                <ContactLine
                  Icon={PhoneIcon}
                  href={`tel:${company.primaryPhone}`}
                  label={company.primaryPhone}
                />
              )}
              {company.secondaryPhone && (
                <ContactLine
                  Icon={PhoneIcon}
                  href={`tel:${company.secondaryPhone}`}
                  label={company.secondaryPhone}
                />
              )}
              {company.email && (
                <ContactLine
                  Icon={MailIcon}
                  href={`mailto:${company.email}`}
                  label={company.email}
                />
              )}
              {company.email2 && (
                <ContactLine
                  Icon={MailIcon}
                  href={`mailto:${company.email2}`}
                  label={company.email2}
                />
              )}
              {company.website && (
                <ContactLine
                  Icon={GlobeIcon}
                  href={
                    company.website.startsWith('http')
                      ? company.website
                      : `https://${company.website}`
                  }
                  label={company.website}
                  external
                />
              )}
            </div>
          )}
        </div>
      )}

      {(company.owner || company.regNumber || company.taxNumber) && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Základní údaje
          </p>
          <dl className="mt-2 space-y-2 text-sm">
            {company.owner && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs uppercase tracking-wide text-gray-500">
                  Vlastník
                </dt>
                <dd className="flex items-center gap-1.5">
                  <Avatar name={company.owner.fullName} size="xs" />
                  <span>{company.owner.fullName ?? '—'}</span>
                </dd>
              </div>
            )}
            {company.regNumber && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs uppercase tracking-wide text-gray-500">
                  IČO
                </dt>
                <dd className="font-mono text-xs">{company.regNumber}</dd>
              </div>
            )}
            {company.taxNumber && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs uppercase tracking-wide text-gray-500">
                  DIČ
                </dt>
                <dd className="font-mono text-xs">{company.taxNumber}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </aside>
  );
}

function ContactLine({
  Icon,
  href,
  label,
  external,
}: {
  Icon: React.FC<{ className?: string }>;
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-2 text-sm text-[#1565C0] hover:underline"
    >
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="truncate">{label}</span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Right sidebar — KPI stats
// ---------------------------------------------------------------------------

function StatsSidebar({ stats }: { stats: KlientCardStats }) {
  return (
    <aside className="space-y-3 text-sm">
      <Kpi
        label="Prodáno za"
        value={stats.prodanoZa > 0 ? formatKcShort(stats.prodanoZa) : '0 Kč'}
        emphasis={stats.prodanoZa > 0 ? 'green' : 'muted'}
      />
      <Kpi
        label="Poslední výhra"
        value={
          stats.posledniVyhraAt ? formatCzechDate(stats.posledniVyhraAt) : '—'
        }
      />
      <Kpi
        label="Rozjednáno"
        value={
          stats.rozjednano > 0 ? formatKcShort(stats.rozjednano) : '0 Kč'
        }
        emphasis={stats.rozjednano > 0 ? 'blue' : 'muted'}
      />
      <Kpi
        label="Otevřených OP"
        value={String(stats.otevrenychOp)}
        emphasis={stats.otevrenychOp > 0 ? 'blue' : 'muted'}
      />
      <Kpi
        label="Následující aktivita"
        value={
          stats.nasledujiciAktivitaAt
            ? formatRelativeDays(stats.nasledujiciAktivitaAt)
            : '—'
        }
        helper={
          stats.nasledujiciAktivitaAt
            ? formatCzechDate(stats.nasledujiciAktivitaAt)
            : null
        }
      />
      <Kpi
        label="Poslední aktivita"
        value={
          stats.posledniAktivitaAt
            ? formatRelativeDays(stats.posledniAktivitaAt)
            : '—'
        }
        helper={
          stats.posledniAktivitaAt
            ? formatCzechDate(stats.posledniAktivitaAt)
            : null
        }
      />
    </aside>
  );
}

function Kpi({
  label,
  value,
  helper,
  emphasis,
}: {
  label: string;
  value: string;
  helper?: string | null;
  emphasis?: 'green' | 'blue' | 'muted';
}) {
  const valueClass =
    emphasis === 'green'
      ? 'text-[#1E8449]'
      : emphasis === 'blue'
        ? 'text-[#1565C0]'
        : emphasis === 'muted'
          ? 'text-gray-400'
          : 'text-gray-900';
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
      {helper && <p className="mt-0.5 text-[11px] text-gray-500">{helper}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline sections + items
// ---------------------------------------------------------------------------

function Section({
  title,
  items,
}: {
  title: string;
  items: KlientTimelineItem[];
}) {
  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <ul className="mt-2 space-y-3">
        {items.map((item) => (
          <TimelineRow key={`${item.kind}-${item.id}`} item={item} />
        ))}
      </ul>
    </div>
  );
}

function TimelineRow({ item }: { item: KlientTimelineItem }) {
  const meta = kindMeta(item.kind);
  const relative = formatRelativeDays(item.when);
  const date = formatCzechDate(item.when);
  const status = statusLabelCs(item.kind, item.statusLabel);
  const isFuture = new Date(item.when).getTime() > Date.now();

  return (
    <li className="flex gap-3">
      {/* Date column */}
      <div className="w-24 shrink-0 pt-1.5 text-right text-xs">
        <p className="font-semibold text-gray-900">{date}</p>
        <p className={isFuture ? 'text-[#1E8449]' : 'text-gray-500'}>
          {relative}
        </p>
      </div>

      {/* Icon column */}
      <div className="relative flex shrink-0 flex-col items-center">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white"
          style={{ borderColor: meta.ringColor, color: meta.ringColor }}
        >
          <meta.Icon className="h-4 w-4" />
        </span>
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1 rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            {meta.label}
          </span>
          {status && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-700 ring-1 ring-gray-200">
              {status}
            </span>
          )}
          {item.phase && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: item.phase.color ? `#${item.phase.color}` : '#e5e7eb',
                color: pickReadableTextColor(item.phase.color),
              }}
            >
              {item.phase.label}
            </span>
          )}
          {item.category && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: item.category.color
                  ? `#${item.category.color}`
                  : '#e5e7eb',
                color: pickReadableTextColor(item.category.color),
              }}
            >
              {item.category.label}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-gray-900">
          {item.title}
          {item.kind === 'businessCase' && item.totalAmount != null && (
            <span className="ml-2 text-xs font-normal text-gray-600">
              {formatKc(item.totalAmount)}
            </span>
          )}
        </p>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-600">
            {item.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            {item.owner && (
              <>
                <Avatar name={item.owner.fullName} size="xs" />
                <span>{item.owner.fullName ?? '—'}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {item.businessCase?.mirroredOrderId != null && (
              <Link
                href={`/retencni-portal/op/${item.businessCase.mirroredOrderId}`}
                className="rounded-md border border-[#1E8449] px-2 py-0.5 text-[10px] font-semibold text-[#1E8449] hover:bg-[#F1F8F4]"
              >
                Otevřít v retenci
              </Link>
            )}
            <a
              href={item.raynetDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
            >
              Raynet ↗
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Avatar — initials in a colored circle (we don't have user photos).
// ---------------------------------------------------------------------------

function Avatar({
  name,
  size = 'sm',
}: {
  name: string | null;
  size?: 'xs' | 'sm';
}) {
  const initials = initialsFromName(name);
  // Stable hashed color from initials so the same person gets the same color
  // across renders (cheap pseudo-random).
  const hash = initials.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const palette = [
    '#1565C0',
    '#1E8449',
    '#7C3AED',
    '#0EA5E9',
    '#D97706',
    '#BE185D',
  ];
  const color = palette[hash % palette.length];
  const sizeCls = size === 'xs' ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]';
  return (
    <span
      className={`${sizeCls} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: color }}
      title={name ?? undefined}
    >
      {initials}
    </span>
  );
}

/** Pick black or white text for a given hex bg so labels stay readable.
 *  Same heuristic the phase badge uses elsewhere in the app. */
function pickReadableTextColor(hex: string | null | undefined): string {
  if (!hex || hex.length < 6) return '#111827';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#111827' : '#ffffff';
}
