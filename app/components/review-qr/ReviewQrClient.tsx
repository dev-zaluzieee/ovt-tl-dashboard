"use client";

/**
 * Recenze QR: settings and monitoring, built around REGION x SLOT (primární / sekundární). The tablet takes the OVT's
 * region (kraj) from the ERP (home row of the surveyor's user) and shows that region's PRIMARY QR; the OVT can switch to
 * the SECONDARY. An empty slot falls back to the global default. Everyone signed in can change settings (no admin split);
 * target create / edit / delete store who and when.
 *
 *   1. global switch + how many active OVTs would see a QR
 *   2. global default QR per slot (the fallback)
 *   3. QR per region, OVTs grouped under their region, "OVT mimo kraje"
 *   4. QR targets catalogue
 *   5. answers: what OVTs did with the prompt, per region / per OVT + log
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tlGet, tlSend } from "@/lib/tl-api";
import { parsePrompts, parseReviewQr } from "@/lib/tl-parse";
import { errorText } from "@/lib/tl-errors";
import { QRCodeSVG } from "qrcode.react";
import { AnswersSection } from "./AnswersSection";
import { RegionsSection } from "./RegionsSection";
import { TargetSelect } from "./TargetSelect";
import { TargetsSection, usageByTarget, type TargetForm } from "./TargetsSection";
import {
  SLOTS,
  btn,
  btnPrimary,
  defaultIdOf,
  fmtDateTime,
  resolveTarget,
  targetName,
  type Slot,
  type PromptStats,
  type PromptRow,
  type PromptsData,
  type ReviewQrData,
  type Target,
} from "./types";

export function ReviewQrClient() {
  const [data, setData] = useState<ReviewQrData | null>(null);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [stats, setStats] = useState<PromptStats[]>([]);
  const [regionStats, setRegionStats] = useState<PromptStats[]>([]);
  const [days, setDays] = useState(30);
  /** Period for the answers block; a ref so `load` can stay dependency-free (see below). */
  const daysRef = useRef(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const applyPrompts = useCallback((pr: PromptsData) => {
    setPrompts(pr.prompts);
    setStats(pr.statsByOvt);
    setRegionStats(pr.statsByRegion);
  }, []);

  const loadPrompts = useCallback(
    async (d: number) => {
      applyPrompts(parsePrompts(await tlGet("review-qr/prompts", { days: d, limit: 300 })));
    },
    [applyPrompts]
  );

  // Dependency-free loader, so the mount effect runs once; the period change is handled by the select's onChange.
  const load = useCallback(async () => {
    try {
      const [cfg, pr] = await Promise.all([
        tlGet("review-qr").then(parseReviewQr),
        tlGet("review-qr/prompts", { days: daysRef.current, limit: 300 }).then(parsePrompts),
      ]);
      setError(null);
      setData(cfg);
      applyPrompts(pr);
    } catch (e) {
      setError(errorText(e, "Načtení nastavení selhalo"));
    } finally {
      setLoading(false);
    }
  }, [applyPrompts]);

  useEffect(() => {
    // Kick off the initial load asynchronously; state updates land in the
    // promise continuation, never synchronously inside the effect body.
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const settings = data?.settings ?? null;
  const targets = useMemo(() => data?.targets ?? [], [data]);
  const regions = useMemo(() => data?.regions ?? [], [data]);
  const targetById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const usage = useMemo(() => usageByTarget(settings, regions), [settings, regions]);

  /**
   * Per slot: how many ACTIVE OVTs (ADMF in the window) would see a QR,
   * split into region QR vs global default, using the tablet's own rule.
   */
  const coverage = useMemo(() => {
    if (!data) return [];
    const configs = [...data.regions.flatMap((r) => r.ovts.map(() => r.config)), ...data.outsideRegions.map(() => null)];
    return SLOTS.map(({ slot, label, hint }) => {
      let region = 0;
      let fallback = 0;
      for (const c of configs) {
        const res = resolveTarget(c, slot, settings, targetById);
        if (res.kind === "region") region++;
        else if (res.kind === "default") fallback++;
      }
      return { slot, label, hint, total: configs.length, region, fallback, none: configs.length - region - fallback };
    });
  }, [data, settings, targetById]);

  async function send(path: string, method: "PUT" | "POST" | "DELETE", body?: unknown, key?: string) {
    setBusy(key ?? path);
    setNotice(null);
    setError(null);
    try {
      await tlSend(method, path.replace(/^\/api\/tl\//, ""), body);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function toggleEnabled() {
    if (!settings) return;
    const next = !settings.enabled;
    const missing = coverage.filter((c) => c.region + c.fallback === 0);
    if (next && missing.length > 0) {
      setError(
        `Před zapnutím nastavte QR aspoň jednomu kraji nebo výchozí QR pro: ${missing
          .map((m) => `${m.label} (${m.hint})`)
          .join(", ")}. Jinak by tito zákazníci QR neviděli nikde.`
      );
      return;
    }
    if (await send("review-qr/settings", "PUT", { enabled: next }, "toggle")) {
      setNotice(next ? "Zapnuto. Tablety začnou QR ukazovat při dalším exportu." : "Vypnuto. Tablety QR neukazují.");
      await load();
    }
  }

  async function setDefault(slot: Slot, targetId: number | null) {
    if (await send("review-qr/defaults", "PUT", { slot, targetId }, `def-${slot}`)) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              settings: {
                ...prev.settings,
                [slot === "secondary" ? "default_secondary_target_id" : "default_primary_target_id"]: targetId,
              },
            }
          : prev
      );
    }
  }

  async function setRegion(regionKey: string, slot: Slot, targetId: number | null) {
    if (!(await send("review-qr/regions", "PUT", { regionKey, slot, targetId }, `reg-${regionKey}-${slot}`))) return;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: prev.regions.map((r) => {
          if (r.key !== regionKey) return r;
          const base = r.config ?? { primary_target_id: null, secondary_target_id: null, updated_at: new Date().toISOString(), updated_by: null };
          const next = { ...base, [slot === "secondary" ? "secondary_target_id" : "primary_target_id"]: targetId };
          return { ...r, config: next.primary_target_id == null && next.secondary_target_id == null ? null : next };
        }),
      };
    });
  }

  async function saveTarget(id: number | null, form: TargetForm): Promise<boolean> {
    const ok = id
      ? await send(`review-qr/targets/${id}`, "PUT", form, "save")
      : await send("review-qr/targets", "POST", form, "save");
    if (ok) {
      setNotice(id ? "QR cíl upraven." : "QR cíl přidán.");
      await load();
    }
    return ok;
  }

  async function removeTarget(t: Target) {
    const u = usage.get(t.id);
    const parts = [
      u && u.defaults.length > 0 ? `přestane být výchozí pro ${u.defaults.join(" a ")}` : null,
      u && u.regions.length > 0 ? `zmizí z ${u.regions.length} krajských slotů` : null,
    ].filter(Boolean);
    if (!confirm(`Smazat „${targetName(t)}“?${parts.length ? ` Tím ${parts.join(" a ")}.` : ""}`)) return;
    if (await send(`review-qr/targets/${t.id}`, "DELETE", undefined, `del-${t.id}`)) await load();
  }

  if (loading && !data) return <p className="text-sm text-gray-500">Načítám…</p>;

  return (
    <div className="space-y-8">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {/* 1. Switch + coverage */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Zobrazování QR v tabletech</h2>
            <p className="text-sm text-gray-500">
              {settings?.enabled ? (
                <span className="font-semibold text-emerald-700">Zapnuto</span>
              ) : (
                <span className="font-semibold text-gray-700">Vypnuto</span>
              )}
              {settings?.updated_by && (
                <span className="ml-2 text-xs text-gray-400">
                  {settings.updated_by} · {fmtDateTime(settings.updated_at)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            disabled={busy === "toggle"}
            onClick={() => void toggleEnabled()}
            className={settings?.enabled ? `${btn} bg-rose-600 text-white hover:bg-rose-700` : btnPrimary}
          >
            {settings?.enabled ? "Vypnout" : "Zapnout"}
          </button>
        </div>
        {data && (
          <ul className="mt-3 space-y-1 text-sm text-gray-600">
            {coverage.map((c) => (
              <li key={c.slot}>
                <span className="font-semibold text-gray-800">{c.label}</span> <span className="text-gray-400">({c.hint})</span>:{" "}
                QR uvidí {c.region + c.fallback} z {c.total} aktivních OVT
                <span className="text-gray-400">
                  {" "}
                  ({c.region} QR kraje, {c.fallback} výchozí)
                </span>
                {c.none > 0 && <span className="ml-1 text-rose-700">, {c.none} bez QR</span>}
              </li>
            ))}
            <li className="text-xs text-gray-400">Aktivní = OVT se zaměřením za posledních {data.activeDays} dní.</li>
          </ul>
        )}
      </section>

      {/* 2. Global defaults (fallback) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Výchozí QR</h2>
        <p className="text-sm text-gray-500">
          Použije se, když OVT nemá v ERP domovský kraj, nebo jeho kraj nemá v daném slotu QR. Bez výchozího QR
          tablet v takovém případě QR neukáže.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {SLOTS.map(({ slot, label, hint, platformOrder }) => {
            const currentId = defaultIdOf(settings, slot);
            const current = currentId != null ? targetById.get(currentId) ?? null : null;
            return (
              <div key={slot} className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
                <div className="min-w-0 grow">
                  <p className="text-sm font-semibold text-gray-900">
                    {label} <span className="font-normal text-gray-500">{hint}</span>
                  </p>
                  <TargetSelect
                    className="mt-2 w-full"
                    targets={targets}
                    platformOrder={platformOrder}
                    value={currentId}
                    emptyLabel="— bez výchozího —"
                    disabled={busy === `def-${slot}`}
                    onChange={(id) => void setDefault(slot, id)}
                  />
                  {current && !current.active && (
                    <p className="mt-1 text-xs text-rose-700">Tento cíl je neaktivní, výchozí QR se neukáže.</p>
                  )}
                </div>
                {current && (
                  <div className="shrink-0 rounded-md border border-gray-200 bg-white p-1.5">
                    <QRCodeSVG value={current.url} size={72} level="M" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Regions */}
      {data && (
        <RegionsSection
          krajSource={data.krajSource}
          activeDays={data.activeDays}
          regions={regions}
          outside={data.outsideRegions}
          settings={settings}
          targets={targets}
          targetById={targetById}
          busy={busy}
          onSetRegion={setRegion}
        />
      )}

      {/* 4. Targets */}
      <TargetsSection targets={targets} usage={usage} busy={busy} onSave={saveTarget} onDelete={removeTarget} />

      {/* 5. Answers */}
      <AnswersSection
        days={days}
        onDaysChange={(d) => {
          daysRef.current = d;
          setDays(d);
          void loadPrompts(d).catch(() => setError("Načtení odpovědí selhalo"));
        }}
        prompts={prompts}
        stats={stats}
        regionStats={regionStats}
      />
    </div>
  );
}
