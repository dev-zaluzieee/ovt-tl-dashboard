"use client";

/**
 * Recenze QR admin. Four blocks:
 *   1. global switch (default OFF — nothing shows on any tablet until flipped)
 *   2. QR targets: label + platform + URL; the QR is rendered from the URL
 *      (no images stored), "Náhled" shows what the tablet will display
 *   3. assignment: which target each OVT shows; unassigned OVTs get the default
 *   4. answers: what OVTs did with the prompt (last N days), per OVT + log
 *
 * Writes are admin-only on the backend; TL users are role admin, marketing
 * needs that role too (Karel handles access).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Platform = "google" | "firmy" | "other";

interface Settings {
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}
interface Target {
  id: number;
  label: string;
  platform: Platform;
  url: string;
  active: boolean;
  is_default: boolean;
  assigned_count: number;
}
interface Assignment {
  ovt_email: string;
  target_id: number;
}
interface AppUser {
  user_id: string;
  email: string | null;
  role: string | null;
  raynet_name: string | null;
}
interface PromptRow {
  id: number;
  form_id: number;
  order_id: number | null;
  ovt_email: string;
  target_label: string | null;
  shown_at: string;
  outcome: "written" | "not_shown" | "refused" | null;
  reason: string | null;
  customer_name: string | null;
}
interface PromptStats {
  ovt_email: string;
  shown: number;
  written: number;
  not_shown: number;
  refused: number;
  unanswered: number;
}

const PLATFORM_LABEL: Record<Platform, string> = { google: "Google", firmy: "Firmy.cz", other: "Jiné" };
const OUTCOME_LABEL: Record<string, string> = {
  written: "napsal",
  not_shown: "neukázáno",
  refused: "odmítl",
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=").slice(1).join("=");
  try {
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return raw ?? null;
  }
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
}
function personLabel(u: AppUser): string {
  return u.raynet_name?.trim() || u.email?.split("@")[0] || u.user_id;
}

const btn = "rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
const btnPrimary = `${btn} bg-[#1E8449] text-white hover:bg-[#166e3b]`;
const btnGhost = `${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`;
const input = "rounded-md border border-gray-300 px-2 py-1 text-sm";

const EMPTY_FORM = { label: "", platform: "google" as Platform, url: "", active: true };

export function ReviewQrClient() {
  const isAdmin = useMemo(() => getCookie("user_role") === "admin", []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [stats, setStats] = useState<PromptStats[]>([]);
  const [days, setDays] = useState(30);
  /** Period for the answers block; a ref so `load` can stay dependency-free (see below). */
  const daysRef = useRef(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [ovtFilter, setOvtFilter] = useState("");

  const loadPrompts = useCallback(async (d: number) => {
    const pr = await fetch(`/api/review-qr/prompts?days=${d}&limit=300`, { credentials: "include" }).then((x) => x.json());
    if (pr.success) {
      setPrompts(pr.data.prompts);
      setStats(pr.data.stats);
    }
  }, []);

  // Dependency-free like the sibling AutomatZfClient loader, so the mount
  // effect runs once (react-hooks/set-state-in-effect); the period change is
  // handled by the select's onChange, not by re-running this effect.
  const load = useCallback(async () => {
    try {
      const [cfg, us, pr] = await Promise.all([
        fetch("/api/review-qr", { credentials: "include" }).then((x) => x.json()),
        fetch("/api/users", { credentials: "include" }).then((x) => x.json()),
        fetch(`/api/review-qr/prompts?days=${daysRef.current}&limit=300`, { credentials: "include" }).then((x) => x.json()),
      ]);
      setError(null);
      if (!cfg.success) throw new Error(cfg.message ?? cfg.error ?? "Načtení nastavení selhalo");
      setSettings(cfg.data.settings);
      setTargets(cfg.data.targets);
      setAssignments(cfg.data.assignments);
      if (us.success) setUsers((us.data as AppUser[]).filter((u) => u.email));
      if (pr.success) {
        setPrompts(pr.data.prompts);
        setStats(pr.data.stats);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Kick off the initial load asynchronously; state updates land in the
    // promise continuation, never synchronously inside the effect body.
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

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
    if (next && !targets.some((t) => t.active && (t.is_default || t.assigned_count > 0))) {
      setError("Před zapnutím přidejte alespoň jeden aktivní QR cíl a nastavte ho jako výchozí nebo ho přiřaďte OVT.");
      return;
    }
    if (await send("/api/review-qr/settings", "PUT", { enabled: next }, "toggle")) {
      setNotice(next ? "Zapnuto. Tablety začnou QR ukazovat při dalším exportu." : "Vypnuto. Tablety QR neukazují.");
      await load();
    }
  }

  async function saveTarget() {
    const ok = editingId
      ? await send(`/api/review-qr/targets/${editingId}`, "PUT", form, "save")
      : await send("/api/review-qr/targets", "POST", form, "save");
    if (ok) {
      setForm(EMPTY_FORM);
      setEditingId(null);
      setNotice(editingId ? "QR cíl upraven." : "QR cíl přidán.");
      await load();
    }
  }

  async function removeTarget(t: Target) {
    if (!confirm(`Smazat „${t.label}“? Přiřazení ${t.assigned_count} OVT se zruší.`)) return;
    if (await send(`/api/review-qr/targets/${t.id}`, "DELETE", undefined, `del-${t.id}`)) await load();
  }

  async function setDefault(t: Target) {
    if (await send(`/api/review-qr/targets/${t.id}/default`, "PUT", { isDefault: !t.is_default }, `def-${t.id}`)) {
      await load();
    }
  }

  async function assign(email: string, targetId: number | null) {
    if (await send("/api/review-qr/assignments", "PUT", { ovtEmail: email, targetId }, `as-${email}`)) {
      setAssignments((prev) => {
        const rest = prev.filter((a) => a.ovt_email !== email.toLowerCase());
        return targetId == null ? rest : [...rest, { ovt_email: email.toLowerCase(), target_id: targetId }];
      });
      setTargets((prev) => prev); // counts refresh on next load
    }
  }

  const assignmentByEmail = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assignments) m.set(a.ovt_email, a.target_id);
    return m;
  }, [assignments]);
  const targetById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const defaultTarget = targets.find((t) => t.is_default) ?? null;

  const ovts = useMemo(() => {
    const q = ovtFilter.trim().toLowerCase();
    return users
      .filter((u) => (u.role ?? "") !== "office" && (u.role ?? "") !== "admin")
      .filter((u) => !q || personLabel(u).toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))
      .sort((a, b) => personLabel(a).localeCompare(personLabel(b), "cs"));
  }, [users, ovtFilter]);

  const totals = useMemo(
    () =>
      stats.reduce(
        (acc, s) => ({
          shown: acc.shown + s.shown,
          written: acc.written + s.written,
          not_shown: acc.not_shown + s.not_shown,
          refused: acc.refused + s.refused,
          unanswered: acc.unanswered + s.unanswered,
        }),
        { shown: 0, written: 0, not_shown: 0, refused: 0, unanswered: 0 }
      ),
    [stats]
  );

  if (loading && !settings) return <p className="text-sm text-gray-500">Načítám…</p>;

  return (
    <div className="space-y-8">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {/* 1. Switch */}
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
      </section>

      {/* 2. Targets */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">QR cíle</h2>
        <p className="text-sm text-gray-500">
          Jeden cíl = jedna stránka s recenzemi (Google Praha, Firmy.cz Ostrava…). QR se generuje z URL, obrázky se neukládají.
          Výchozí cíl vidí každý OVT bez vlastního přiřazení.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Název</th>
                <th className="px-3 py-2">Platforma</th>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2 text-right">OVT</th>
                <th className="px-3 py-2">Stav</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {targets.map((t) => (
                <tr key={t.id} className={t.active ? "" : "text-gray-400"}>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {t.label}
                    {t.is_default && (
                      <span className="ml-2 rounded bg-[#E3F2FD] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#1565C0]">výchozí</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{PLATFORM_LABEL[t.platform]}</td>
                  <td className="max-w-[360px] truncate px-3 py-2 text-gray-600" title={t.url}>
                    <a href={t.url} target="_blank" rel="noreferrer" className="text-[#1E8449] hover:underline">
                      {t.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.assigned_count}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{t.active ? "aktivní" : "neaktivní"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" className={btnGhost} onClick={() => setPreviewId(previewId === t.id ? null : t.id)}>
                      Náhled
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          className={`${btnGhost} ml-1`}
                          disabled={busy === `def-${t.id}`}
                          onClick={() => void setDefault(t)}
                        >
                          {t.is_default ? "Zrušit výchozí" : "Jako výchozí"}
                        </button>
                        <button
                          type="button"
                          className={`${btnGhost} ml-1`}
                          onClick={() => {
                            setEditingId(t.id);
                            setForm({ label: t.label, platform: t.platform, url: t.url, active: t.active });
                          }}
                        >
                          Upravit
                        </button>
                        <button
                          type="button"
                          className={`${btn} ml-1 text-rose-700 hover:bg-rose-50`}
                          disabled={busy === `del-${t.id}`}
                          onClick={() => void removeTarget(t)}
                        >
                          Smazat
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {targets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    Zatím žádný QR cíl.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {previewId != null && targetById.get(previewId) && (
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-white p-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <QRCodeSVG value={targetById.get(previewId)!.url} size={200} level="M" />
            </div>
            <div className="text-sm text-gray-700">
              <p className="font-semibold">{targetById.get(previewId)!.label}</p>
              <p className="text-gray-500">{PLATFORM_LABEL[targetById.get(previewId)!.platform]}</p>
              <p className="mt-2 break-all text-xs text-gray-500">{targetById.get(previewId)!.url}</p>
              <p className="mt-2 text-xs text-gray-400">Takto QR uvidí zákazník na tabletu. Ověřte načtením telefonem.</p>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">{editingId ? "Upravit QR cíl" : "Nový QR cíl"}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-600">
                Název
                <br />
                <input
                  className={`${input} w-52`}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Google Praha"
                />
              </label>
              <label className="text-xs text-gray-600">
                Platforma
                <br />
                <select
                  className={input}
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })}
                >
                  <option value="google">Google</option>
                  <option value="firmy">Firmy.cz</option>
                  <option value="other">Jiné</option>
                </select>
              </label>
              <label className="grow text-xs text-gray-600">
                URL recenze
                <br />
                <input
                  className={`${input} w-full`}
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://g.page/r/.../review"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                aktivní
              </label>
              <button type="button" className={btnPrimary} disabled={busy === "save"} onClick={() => void saveTarget()}>
                {editingId ? "Uložit" : "Přidat"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                  }}
                >
                  Zrušit
                </button>
              )}
            </div>
            {form.url && /^https?:\/\/\S+$/i.test(form.url) && (
              <div className="mt-3 inline-block rounded-lg border border-gray-200 p-2">
                <QRCodeSVG value={form.url} size={120} level="M" />
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Assignments */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Který QR ukáže který OVT</h2>
          <input
            className={`${input} w-56`}
            placeholder="Hledat OVT…"
            value={ovtFilter}
            onChange={(e) => setOvtFilter(e.target.value)}
          />
        </div>
        <p className="text-sm text-gray-500">
          Bez vlastního přiřazení platí výchozí cíl{defaultTarget ? ` (${defaultTarget.label})` : ""}
          {!defaultTarget && <span className="text-amber-700"> — zatím žádný výchozí cíl, nepřiřazení OVT QR neuvidí</span>}.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">OVT</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">QR cíl</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ovts.map((u) => {
                const email = (u.email ?? "").toLowerCase();
                const current = assignmentByEmail.get(email) ?? null;
                return (
                  <tr key={u.user_id}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">{personLabel(u)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{u.email}</td>
                    <td className="px-3 py-2">
                      {isAdmin ? (
                        <select
                          className={input}
                          value={current ?? ""}
                          disabled={busy === `as-${email}`}
                          onChange={(e) => void assign(email, e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">{defaultTarget ? `výchozí (${defaultTarget.label})` : "— bez QR —"}</option>
                          {targets
                            .filter((t) => t.active || t.id === current)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {PLATFORM_LABEL[t.platform]} · {t.label}
                                {t.active ? "" : " (neaktivní)"}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="text-gray-700">
                          {current ? targetById.get(current)?.label ?? `#${current}` : defaultTarget ? `výchozí (${defaultTarget.label})` : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {ovts.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                    Žádný OVT neodpovídá filtru.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Answers */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Co OVT odpověděli</h2>
          <label className="text-xs text-gray-600">
            Období
            <select
              className={`${input} ml-2`}
              value={days}
              onChange={(e) => {
                const d = Number(e.target.value);
                daysRef.current = d;
                setDays(d);
                void loadPrompts(d).catch(() => setError("Načtení odpovědí selhalo"));
              }}
            >
              <option value={7}>7 dní</option>
              <option value={30}>30 dní</option>
              <option value={90}>90 dní</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Zobrazeno", totals.shown],
            ["Napsal", totals.written],
            ["Odmítl", totals.refused],
            ["Neukázáno", totals.not_shown],
            ["Bez odpovědi", totals.unanswered],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">{l}</div>
              <div className="text-xl font-semibold text-gray-900">{v}</div>
            </div>
          ))}
        </div>
        {stats.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">OVT</th>
                  <th className="px-3 py-2 text-right">Zobrazeno</th>
                  <th className="px-3 py-2 text-right">Napsal</th>
                  <th className="px-3 py-2 text-right">Odmítl</th>
                  <th className="px-3 py-2 text-right">Neukázáno</th>
                  <th className="px-3 py-2 text-right">Bez odpovědi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.map((s) => (
                  <tr key={s.ovt_email}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">{s.ovt_email}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.shown}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{s.written}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.refused}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.not_shown}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">{s.unanswered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Kdy</th>
                <th className="px-3 py-2">OVT</th>
                <th className="px-3 py-2">Zákazník</th>
                <th className="px-3 py-2">QR</th>
                <th className="px-3 py-2">Odpověď</th>
                <th className="px-3 py-2">Důvod</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prompts.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{fmtDateTime(p.shown_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{p.ovt_email.split("@")[0]}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                    {p.customer_name ?? "—"}
                    {p.order_id != null && <span className="ml-1 text-xs text-gray-400">#{p.order_id}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{p.target_label ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {p.outcome ? (
                      <span className={p.outcome === "written" ? "font-semibold text-emerald-700" : "text-gray-700"}>
                        {OUTCOME_LABEL[p.outcome]}
                      </span>
                    ) : (
                      <span className="text-amber-700">bez odpovědi</span>
                    )}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-gray-600" title={p.reason ?? undefined}>
                    {p.reason ?? ""}
                  </td>
                </tr>
              ))}
              {prompts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    Za zvolené období tablet žádný QR neukázal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
