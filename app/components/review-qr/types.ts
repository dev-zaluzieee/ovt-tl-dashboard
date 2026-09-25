/**
 * Recenze QR admin: API shapes (ceniky-2 /api/admin/review-qr) and the small
 * helpers every section shares.
 */

export type Platform = "google" | "firmy" | "other";
export type Audience = "b2c" | "b2b";

export interface Settings {
  enabled: boolean;
  default_b2c_target_id: number | null;
  default_b2b_target_id: number | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Target {
  id: number;
  label: string;
  platform: Platform;
  url: string;
  active: boolean;
}

export interface RegionOvt {
  raynet_user_id: number;
  name: string;
  position: string | null;
  city: string | null;
  region_raw: string | null;
  email: string | null;
  /** ADMFs in the last `active_days` days; 0 = not active. */
  admf_count: number;
}

export interface RegionConfig {
  b2c_target_id: number | null;
  b2b_target_id: number | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Region {
  key: string;
  known: boolean;
  in_calendar: boolean;
  raw_names: string[];
  config: RegionConfig | null;
  ovts: RegionOvt[];
}

export interface UnmatchedOvt {
  email: string;
  name: string | null;
  raynet_user_id: number | null;
  admf_count: number;
  reason: "no_raynet_id" | "not_in_calendar";
}

export interface CalendarSource {
  configured: boolean;
  ok: boolean;
  error: string | null;
  ovt_count: number;
}

export interface ReviewQrData {
  settings: Settings;
  targets: Target[];
  source: CalendarSource;
  active_days: number;
  regions: Region[];
  without_region: RegionOvt[];
  not_in_calendar: UnmatchedOvt[];
}

export interface PromptRow {
  id: number;
  form_id: number;
  order_id: number | null;
  ovt_email: string;
  target_label: string | null;
  target_platform: Platform | null;
  audience: Audience;
  region: string | null;
  target_source: "region" | "default" | null;
  shown_at: string;
  outcome: "written" | "not_shown" | "refused" | null;
  reason: string | null;
  customer_name: string | null;
}

export interface PromptStats {
  key: string | null;
  shown: number;
  written: number;
  not_shown: number;
  refused: number;
  unanswered: number;
}

export const PLATFORM_LABEL: Record<Platform, string> = { google: "Google", firmy: "Firmy.cz", other: "Jiné" };

export const AUDIENCES: Array<{ audience: Audience; label: string; hint: string; platformOrder: Platform[] }> = [
  { audience: "b2c", label: "B2C", hint: "soukromá osoba", platformOrder: ["google", "firmy", "other"] },
  { audience: "b2b", label: "B2B", hint: "firma (právnická osoba / IČO)", platformOrder: ["firmy", "google", "other"] },
];

export const OUTCOME_LABEL: Record<string, string> = {
  written: "napsal",
  not_shown: "neukázáno",
  refused: "odmítl",
};

export const btn = "rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
export const btnPrimary = `${btn} bg-[#1E8449] text-white hover:bg-[#166e3b]`;
export const btnGhost = `${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`;
export const input = "rounded-md border border-gray-300 px-2 py-1 text-sm";

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
}

/** Labels repeat across platforms (Brno on Google and on Firmy.cz), so always show both. */
export function targetName(t: Pick<Target, "label" | "platform">): string {
  return `${PLATFORM_LABEL[t.platform]} · ${t.label}`;
}

export function defaultIdOf(settings: Settings | null, audience: Audience): number | null {
  if (!settings) return null;
  return audience === "b2b" ? settings.default_b2b_target_id : settings.default_b2c_target_id;
}

export function regionSlotId(config: RegionConfig | null, audience: Audience): number | null {
  if (!config) return null;
  return audience === "b2b" ? config.b2b_target_id : config.b2c_target_id;
}

export type Resolution =
  | { kind: "region"; target: Target }
  | { kind: "default"; target: Target; regionTargetInactive: boolean }
  | { kind: "none"; regionTargetInactive: boolean };

/**
 * What the tablet shows for this audience — the same rule as ceniky-3
 * review-qr.routes.ts: active region target, else active global default,
 * else nothing. `config` null = the OVT has no region.
 */
export function resolveTarget(
  config: RegionConfig | null,
  audience: Audience,
  settings: Settings | null,
  targetById: Map<number, Target>
): Resolution {
  const slotId = regionSlotId(config, audience);
  const slot = slotId != null ? targetById.get(slotId) ?? null : null;
  if (slot?.active) return { kind: "region", target: slot };
  const regionTargetInactive = slot != null && !slot.active;
  const defId = defaultIdOf(settings, audience);
  const def = defId != null ? targetById.get(defId) ?? null : null;
  if (def?.active) return { kind: "default", target: def, regionTargetInactive };
  return { kind: "none", regionTargetInactive };
}
