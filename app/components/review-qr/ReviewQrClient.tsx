"use client";

/**
 * Recenze QR admin, built around REGION x AUDIENCE. The tablet takes the
 * OVT's region (kraj) from the marketing calendar and, per ADMF, whether the
 * customer is a private person (B2C) or a firm (B2B: právnická osoba / IČO),
 * and shows that region's QR; without one it falls back to the audience's
 * global default. Any target (Google, Firmy.cz, Jiné) fits either slot.
 *
 *   1. global switch (default OFF) + how many active OVTs would see a QR
 *   2. global default QR per audience (the fallback)
 *   3. QR per region, OVTs grouped under their region, mismatches with the
 *      calendar (unknown region names, OVTs without a region / not in it)
 *   4. QR targets catalogue
 *   5. answers: what OVTs did with the prompt, per region / per OVT + log
 *
 * Regions are never edited here — the calendar is the source of truth.
 * Writes are admin-only on the backend; TL users are role admin, marketing
 * needs that role too (Karel handles access).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AnswersSection } from "./AnswersSection";
import { RegionsSection } from "./RegionsSection";
import { TargetSelect } from "./TargetSelect";
import { TargetsSection, usageByTarget, type TargetForm } from "./TargetsSection";
import {
  AUDIENCES,
  btn,
  btnPrimary,
  defaultIdOf,
  fmtDateTime,
  resolveTarget,
  targetName,
  type Audience,
  type PromptRow,
  type PromptStats,
  type ReviewQrData,
  type Target,
} from "./types";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=").slice(1).join("=");
  try {
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return raw ?? null;
  }
}

export function ReviewQrClient() {
  const isAdmin = useMemo(() => getCookie("user_role") === "admin", []);
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

  const applyPrompts = useCallback((pr: { success?: boolean; data?: { prompts: PromptRow[]; stats: PromptStats[]; regionStats: PromptStats[] } }) => {
    if (pr.success && pr.data) {
      setPrompts(pr.data.prompts);
      setStats(pr.data.stats);
      setRegionStats(pr.data.regionStats ?? []);
    }
  }, []);

  const loadPrompts = useCallback(
    async (d: number) => {
      const pr = await fetch(`/api/review-qr/prompts?days=${d}&limit=300`, { credentials: "include" }).then((x) => x.json());
      applyPrompts(pr);
    },
    [applyPrompts]
  );

  // Dependency-free like the sibling AutomatZfClient loader, so the mount
  // effect runs once (react-hooks/set-state-in-effect); the period change is
  // handled by the select's onChange, not by re-running this effect.
  const load = useCallback(async () => {
    try {
      const [cfg, pr] = await Promise.all([
        fetch("/api/review-qr", { credentials: "include" }).then((x) => x.json()),
        fetch(`/api/review-qr/prompts?days=${daysRef.current}&limit=300`, { credentials: "include" }).then((x) => x.json()),
      ]);
      setError(null);
      if (!cfg.success) throw new Error(cfg.message ?? cfg.error ?? "Načtení nastavení selhalo");
      setData(cfg.data as ReviewQrData);
      applyPrompts(pr);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
   * Per audience: how many ACTIVE OVTs (ADMF in the window) would see a QR,
   * split into region QR vs global default, using the tablet's own rule.
   */
  const coverage = useMemo(() => {
    if (!data) return [];
    const configs = [
      ...data.regions.flatMap((r) => r.ovts.filter((o) => o.admf_count > 0).map(() => r.config)),
      ...data.without_region.filter((o) => o.admf_count > 0).map(() => null),
      ...data.not_in_calendar.map(() => null),
    ];
    return AUDIENCES.map(({ audience, label, hint }) => {
      let region = 0;
      let fallback = 0;
      for (const c of configs) {
        const res = resolveTarget(c, audience, settings, targetById);
        if (res.kind === "region") region++;
        else if (res.kind === "default") fallback++;
      }
      return { audience, label, hint, total: configs.length, region, fallback, none: configs.length - region - fallback };
    });
  }, [data, settings, targetById]);

  async function send(path: string, method: string, body?: unknown, key?: string) {
    setBusy(key ?? path);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        setError(json.message ?? json.error ?? `Chyba (HTTP ${res.status})`);
        return false;
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    if (await send("/api/review-qr/settings", "PUT", { enabled: next }, "toggle")) {
      setNotice(next ? "Zapnuto. Tablety začnou QR ukazovat při dalším exportu." : "Vypnuto. Tablety QR neukazují.");
      await load();
    }
  }

  async function setDefault(audience: Audience, targetId: number | null) {
    if (await send("/api/review-qr/defaults", "PUT", { audience, targetId }, `def-${audience}`)) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              settings: {
                ...prev.settings,
                [audience === "b2b" ? "default_b2b_target_id" : "default_b2c_target_id"]: targetId,
              },
            }
          : prev
      );
    }
  }

  async function setRegion(regionKey: string, audience: Audience, targetId: number | null) {
    if (!(await send("/api/review-qr/regions", "PUT", { regionKey, audience, targetId }, `reg-${regionKey}-${audience}`))) return;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: prev.regions.map((r) => {
          if (r.key !== regionKey) return r;
          const base = r.config ?? { b2c_target_id: null, b2b_target_id: null, updated_at: new Date().toISOString(), updated_by: null };
          const next = { ...base, [audience === "b2b" ? "b2b_target_id" : "b2c_target_id"]: targetId };
          return { ...r, config: next.b2c_target_id == null && next.b2b_target_id == null ? null : next };
        }),
      };
    });
  }

  async function saveTarget(id: number | null, form: TargetForm): Promise<boolean> {
    const ok = id
      ? await send(`/api/review-qr/targets/${id}`, "PUT", form, "save")
      : await send("/api/review-qr/targets", "POST", form, "save");
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
    if (await send(`/api/review-qr/targets/${t.id}`, "DELETE", undefined, `del-${t.id}`)) await load();
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
          {isAdmin ? (
            <button
              type="button"
              disabled={busy === "toggle"}
              onClick={() => void toggleEnabled()}
              className={settings?.enabled ? `${btn} bg-rose-600 text-white hover:bg-rose-700` : btnPrimary}
            >
              {settings?.enabled ? "Vypnout" : "Zapnout"}
            </button>
          ) : (
            <span className="text-xs text-gray-400">Zapnout a vypnout může jen admin.</span>
          )}
        </div>
        {data && (
          <ul className="mt-3 space-y-1 text-sm text-gray-600">
            {coverage.map((c) => (
              <li key={c.audience}>
                <span className="font-semibold text-gray-800">{c.label}</span> <span className="text-gray-400">({c.hint})</span>:{" "}
                QR uvidí {c.region + c.fallback} z {c.total} aktivních OVT
                <span className="text-gray-400">
                  {" "}
                  ({c.region} QR kraje, {c.fallback} výchozí)
                </span>
                {c.none > 0 && <span className="ml-1 text-rose-700">, {c.none} bez QR</span>}
              </li>
            ))}
            <li className="text-xs text-gray-400">Aktivní = OVT s ADMF za posledních {data.active_days} dní.</li>
          </ul>
        )}
      </section>

      {/* 2. Global defaults (fallback) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Výchozí QR</h2>
        <p className="text-sm text-gray-500">
          Použije se, když OVT nemá v marketingovém kalendáři kraj, nebo jeho kraj nemá QR pro daný typ zákazníka. Bez výchozího
          QR tablet v takovém případě QR neukáže.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {AUDIENCES.map(({ audience, label, hint, platformOrder }) => {
            const currentId = defaultIdOf(settings, audience);
            const current = currentId != null ? targetById.get(currentId) ?? null : null;
            return (
              <div key={audience} className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
                <div className="min-w-0 grow">
                  <p className="text-sm font-semibold text-gray-900">
                    {label} <span className="font-normal text-gray-500">{hint}</span>
                  </p>
                  {isAdmin ? (
                    <TargetSelect
                      className="mt-2 w-full"
                      targets={targets}
                      platformOrder={platformOrder}
                      value={currentId}
                      emptyLabel="— bez výchozího —"
                      disabled={busy === `def-${audience}`}
                      onChange={(id) => void setDefault(audience, id)}
                    />
                  ) : (
                    <p className="mt-2 text-sm text-gray-700">{current ? targetName(current) : "— bez výchozího —"}</p>
                  )}
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
          source={data.source}
          activeDays={data.active_days}
          regions={regions}
          withoutRegion={data.without_region}
          notInCalendar={data.not_in_calendar}
          settings={settings}
          targets={targets}
          targetById={targetById}
          isAdmin={isAdmin}
          busy={busy}
          onSetRegion={setRegion}
        />
      )}

      {/* 4. Targets */}
      <TargetsSection targets={targets} usage={usage} isAdmin={isAdmin} busy={busy} onSave={saveTarget} onDelete={removeTarget} />

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
