/**
 * Recenze QR: API shapes (backend /api/tl2/review-qr) and the small helpers every section shares.
 */

export type Platform = "google" | "firmy" | "other";
/** Which QR the tablet shows first, and which one the OVT can switch to. */
export type Slot = "primary" | "secondary";

export interface Settings {
  enabled: boolean;
  default_primary_target_id: number | null;
  default_secondary_target_id: number | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Target {
  id: number;
  label: string;
  platform: Platform;
  url: string;
  active: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface RegionOvt {
  userId: number;
  name: string;
  email: string | null;
  /** Surveys (zaměření / znovuzaměření) owned in the last `activeDays` days. */
  surveys: number;
  lastSurveyAt: string | null;
  kraj: string | null;
}

export interface RegionConfig {
  primary_target_id: number | null;
  secondary_target_id: number | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Region {
  key: string;
  known: boolean;
  config: RegionConfig | null;
  ovts: RegionOvt[];
}

export interface OutsideOvt extends RegionOvt {
  reason: string;
}

export interface ReviewQrData {
  settings: Settings;
  targets: Target[];
  regions: Region[];
  outsideRegions: OutsideOvt[];
  activeDays: number;
  krajSource: string | null;
}

export interface PromptRow {
  id: number;
  erpOrderId: number | null;
  ovtEmail: string | null;
  ovtName: string | null;
  customerName: string | null;
  targetId: number | null;
  targetLabel: string | null;
  targetPlatform: Platform | null;
  slot: Slot | null;
  region: string | null;
  targetSource: "region" | "default" | null;
  shownAt: string;
  outcome: "written" | "not_shown" | "refused" | null;
  reason: string | null;
  closedAt: string | null;
}

export interface PromptStats {
  key: string | null;
  ovtName?: string | null;
  shown: number;
  written: number;
  not_shown: number;
  refused: number;
  unanswered: number;
}

export interface PromptsData {
  days: number;
  prompts: PromptRow[];
  statsByOvt: PromptStats[];
  statsByRegion: PromptStats[];
}

export const PLATFORM_LABEL: Record<Platform, string> = { google: "Google", firmy: "Firmy.cz", other: "Jiné" };

export const SLOTS: Array<{ slot: Slot; label: string; hint: string; platformOrder: Platform[] }> = [
  { slot: "primary", label: "Primární", hint: "ukáže se zákazníkovi jako první — sem chceme recenze", platformOrder: ["firmy", "google", "other"] },
  { slot: "secondary", label: "Sekundární", hint: "OVT přepne, když zákazník tu platformu nemá; prázdné = globální výchozí", platformOrder: ["google", "firmy", "other"] },
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

export { fmtDateTime } from "@/lib/format";

/** Labels repeat across platforms (Brno on Google and on Firmy.cz), so always show both. */
export function targetName(t: Pick<Target, "label" | "platform">): string {
  return `${PLATFORM_LABEL[t.platform]} · ${t.label}`;
}

export function defaultIdOf(settings: Settings | null, slot: Slot): number | null {
  if (!settings) return null;
  return slot === "secondary" ? settings.default_secondary_target_id : settings.default_primary_target_id;
}

export function regionSlotId(config: RegionConfig | null, slot: Slot): number | null {
  if (!config) return null;
  return slot === "secondary" ? config.secondary_target_id : config.primary_target_id;
}

export type Resolution =
  | { kind: "region"; target: Target }
  | { kind: "default"; target: Target; regionTargetInactive: boolean }
  | { kind: "none"; regionTargetInactive: boolean };

/**
 * What the tablet shows for this slot — the same rule as ceniky-3
 * review-qr.routes.ts: active region target, else active global default,
 * else nothing. `config` null = the OVT has no region.
 */
export function resolveTarget(
  config: RegionConfig | null,
  slot: Slot,
  settings: Settings | null,
  targetById: Map<number, Target>
): Resolution {
  const slotId = regionSlotId(config, slot);
  const regionTarget = slotId != null ? targetById.get(slotId) ?? null : null;
  if (regionTarget?.active) return { kind: "region", target: regionTarget };
  const regionTargetInactive = regionTarget != null && !regionTarget.active;
  const defId = defaultIdOf(settings, slot);
  const def = defId != null ? targetById.get(defId) ?? null : null;
  if (def?.active) return { kind: "default", target: def, regionTargetInactive };
  return { kind: "none", regionTargetInactive };
}
