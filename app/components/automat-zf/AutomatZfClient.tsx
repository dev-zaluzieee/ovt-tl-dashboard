"use client";

/**
 * Automat ZF — monitoring of the automatic "unpaid záloha převodem / fakturou
 * -> retention queue N days after ZF issue" batch (ceniky-2 backend, weekdays
 * 06:00 Europe/Prague). Same data on the office retention module and the TL
 * dashboard: next run + what it will send, everything watched but not sent
 * (with the reason), history of runs, and the human overrides "Poslat hned"
 * and "Odložit". Preview and live run share one code path on the backend, so
 * what this page shows IS what the batch will do.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { raynetEventDeepLink } from "@/lib/raynetUrls";
import { erpOrderDeepLink } from "@/lib/erpUrls";
import { officePortalOrderDeepLink } from "@/lib/officePortalUrls";

const SOURCE: "office" | "tl" = "tl";

type Bucket = "due" | "not_due" | "paid" | "cannot_judge" | "no_zf_date" | "already_queued" | "deferred";

interface WatchItem {
  raynetEventId: number;
  orderId: number | null;
  ovtUserId: string | null;
  erpOrderId: number | null;
  customerName: string | null;
  phone: string | null;
  scheduledFrom: string | null;
  method: string | null;
  zfIssuedOn: string | null;
  eligibleOn: string | null;
  paymentStatus: string | null;
  paymentText: string | null;
  dueDate: string | null;
  bucket: Bucket;
  bucketDetail: string | null;
  deferral: { id: number; until: string; reason: string; actor: string } | null;
  queuedBy: { userId: string; tlUserId: string | null; origin: string | null; at: string } | null;
}

interface RunRow {
  id: number;
  mode: "live" | "dry_run";
  trigger: "scheduled" | "manual";
  scheduled_for: string | null;
  actor: string | null;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  candidates_total: number;
  sent_count: number;
  skipped_count: number;
  error: string | null;
  results: Array<{
    raynetEventId: number;
    orderId: number | null;
    customerName: string | null;
    method: string | null;
    zfIssuedOn: string | null;
    eligibleOn: string | null;
    paymentStatus: string | null;
    bucket: Bucket;
    action: "sent" | "would_send" | "skipped" | "failed";
    detail: string | null;
    logId: number | null;
  }>;
}

interface Status {
  enabled: boolean;
  rule: { daysAfterIssue: number; runHourPrague: number; weekdaysOnly: true };
  nextRunAt: string;
  lastLiveRun: RunRow | null;
  snapshot: { builtAt: string; today: string; paymentSystemDegraded: boolean; items: WatchItem[] };
  deferrals: Array<{ id: number; raynet_event_id: string; order_id: number | null; deferred_until: string; reason: string; actor: string; source: string; created_at: string }>;
}

/** Bucket chips; `days` = the backend's rule (3, from /status). */
const bucketMeta = (days: number): Record<Bucket, { label: string; cls: string; help: string }> => ({
  due: { label: "V příští dávce", cls: "border-rose-300 bg-rose-50 text-rose-800", help: `Splňuje pravidlo: ZF vystavena před ${days}+ dny, záloha neuhrazená.` },
  not_due: { label: `Čeká na ${days}. den`, cls: "border-amber-300 bg-amber-50 text-amber-800", help: `Neuhrazená, ale od vystavení ZF ještě neuplynulo ${days} dní.` },
  paid: { label: "Uhrazeno", cls: "border-emerald-300 bg-emerald-50 text-emerald-800", help: "Fakturace eviduje platbu — office ještě nepotvrdil v TRIÁŽI (tag ZF čekáme zůstává)." },
  cannot_judge: { label: "Nelze posoudit", cls: "border-gray-300 bg-gray-100 text-gray-700", help: "Bez ERP párování nebo fakturace o ZF nic neví. Automat NIKDY neposílá." },
  no_zf_date: { label: "Bez data ZF", cls: "border-gray-300 bg-gray-100 text-gray-700", help: "Raynet nemá datum vystavení ZF — fakturace ji zatím nezapsala." },
  already_queued: { label: "Ve frontě", cls: "border-purple-300 bg-purple-50 text-purple-800", help: "Už čeká ve frontě retencí (poslal OVT, TL, office nebo dřívější běh)." },
  deferred: { label: "Odloženo", cls: "border-sky-300 bg-sky-50 text-sky-800", help: "Člověk odložil; po datu se vrátí mezi kandidáty." },
});
const DEFAULT_DAYS = 3;

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague" });
  } catch {
    return iso;
  }
}
function fmtDate(ymd: string | null): string {
  if (!ymd) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : ymd;
}
function daysAgo(ymd: string | null, today: string): number | null {
  if (!ymd) return null;
  const a = new Date(`${ymd}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=").slice(1).join("=");
  try {
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return raw ?? null;
  }
}

const btn = "rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

export function AutomatZfClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const isAdmin = useMemo(() => getCookie("user_role") === "admin", []);
  const days = status?.rule.daysAfterIssue ?? DEFAULT_DAYS;
  const BUCKET_META = useMemo(() => bucketMeta(days), [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        fetch("/api/retention-auto-zf/status", { credentials: "include" }).then((x) => x.json()),
        fetch("/api/retention-auto-zf/runs?limit=40", { credentials: "include" }).then((x) => x.json()),
      ]);
      if (!s.success) throw new Error(s.message || "Načtení stavu selhalo");
      setStatus(s.data as Status);
      setRuns(r.success ? (r.data.runs as RunRow[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba spojení");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(path: string, body?: unknown): Promise<{ ok: boolean; message?: string; data?: unknown }> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json.success !== false, message: json.message ?? json.error, data: json.data };
  }

  async function sendNow(item: WatchItem) {
    const reason = window.prompt(
      `Poslat ${item.customerName ?? `událost ${item.raynetEventId}`} do fronty retencí hned.\nDůvod (povinný):`
    );
    if (reason == null || reason.trim().length < 3) return;
    setBusy(`send-${item.raynetEventId}`);
    const r = await post("/api/retention-auto-zf/send-now", { raynetEventId: item.raynetEventId, reason: reason.trim(), source: SOURCE });
    setBusy(null);
    setNotice(r.ok ? `Zařazeno do fronty retencí (${item.customerName ?? item.raynetEventId}).` : `Nepodařilo se: ${r.message ?? "chyba"}`);
    void load();
  }

  async function defer(item: WatchItem) {
    const daysRaw = window.prompt(`Odložit automatické odeslání ${item.customerName ?? item.raynetEventId}.\nO kolik dní (1–60)?`, "7");
    if (daysRaw == null) return;
    const days = parseInt(daysRaw, 10);
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      setNotice("Zadejte počet dní 1–60.");
      return;
    }
    const reason = window.prompt("Důvod odložení (povinný):");
    if (reason == null || reason.trim().length < 3) return;
    setBusy(`defer-${item.raynetEventId}`);
    const r = await post("/api/retention-auto-zf/defer", { raynetEventId: item.raynetEventId, days, reason: reason.trim(), source: SOURCE });
    setBusy(null);
    setNotice(r.ok ? `Odloženo do ${fmtDate((r.data as { until: string }).until)}.` : `Nepodařilo se: ${r.message ?? "chyba"}`);
    void load();
  }

  async function cancelDeferral(id: number) {
    if (!window.confirm("Zrušit odložení? Zakázka se vrátí mezi kandidáty automatu.")) return;
    setBusy(`undefer-${id}`);
    const res = await fetch(`/api/retention-auto-zf/defer/${id}`, { method: "DELETE", credentials: "include" });
    setBusy(null);
    setNotice(res.ok ? "Odložení zrušeno." : "Zrušení odložení selhalo.");
    void load();
  }

  async function dryRun() {
    setBusy("dry");
    const r = await post("/api/retention-auto-zf/dry-run");
    setBusy(null);
    setNotice(r.ok ? "Zkušební běh zapsán do historie (nic se neodeslalo)." : `Zkušební běh selhal: ${r.message ?? "chyba"}`);
    void load();
  }

  async function runNow() {
    const due = status?.snapshot.items.filter((i) => i.bucket === "due").length ?? 0;
    if (!window.confirm(`Spustit ostrý běh teď? Do fronty retencí půjde ${due} zakázek.`)) return;
    setBusy("run");
    const r = await post("/api/retention-auto-zf/run-now");
    setBusy(null);
    const d = r.data as { sent: number; skipped: number; failed: number } | undefined;
    setNotice(r.ok && d ? `Hotovo: odesláno ${d.sent}, přeskočeno ${d.skipped}, chyb ${d.failed}.` : `Běh selhal: ${r.message ?? "chyba"}`);
    void load();
  }

  const items = useMemo(() => status?.snapshot.items ?? [], [status]);
  const due = useMemo(() => items.filter((i) => i.bucket === "due"), [items]);
  const rest = useMemo(() => items.filter((i) => i.bucket !== "due"), [items]);
  const counts = useMemo(() => {
    const c: Partial<Record<Bucket, number>> = {};
    for (const i of items) c[i.bucket] = (c[i.bucket] ?? 0) + 1;
    return c;
  }, [items]);

  const orderLink = (id: number | null) => (id == null ? null : officePortalOrderDeepLink(id));

  const renderRow = (item: WatchItem, withActions: boolean) => {
    const meta = BUCKET_META[item.bucket];
    const age = daysAgo(item.zfIssuedOn, status?.snapshot.today ?? "");
    const oLink = orderLink(item.orderId);
    return (
      <tr key={item.raynetEventId} className="hover:bg-gray-50">
        <td className="px-3 py-2">
          <div className="font-medium text-gray-900">{item.customerName ?? "—"}</div>
          <div className="text-xs text-gray-500">
            {item.phone ?? ""}
            {item.ovtUserId ? `${item.phone ? " · " : ""}OVT ${item.ovtUserId}` : ""}
          </div>
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-xs">
          {oLink ? (
            <a href={oLink} className="rounded-md border border-[#1565C0]/35 bg-[#E3F2FD]/70 px-2 py-0.5 font-semibold text-[#1565C0] hover:underline">
              #{item.orderId}
            </a>
          ) : (
            <span className="rounded-md border border-gray-300 bg-gray-100 px-2 py-0.5 text-gray-600">Raynet-only</span>
          )}
          <a href={raynetEventDeepLink(item.raynetEventId)} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#1E8449] hover:underline">
            Raynet
          </a>
          {item.erpOrderId != null && (
            <a href={erpOrderDeepLink(item.erpOrderId)} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#1565C0] hover:underline">
              ERP
            </a>
          )}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
          {fmtDate(item.zfIssuedOn)}
          {age != null && <span className="ml-1 text-xs text-gray-400">({age} d)</span>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-gray-700">{item.method ?? "—"}</td>
        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
          {item.paymentText ?? (item.paymentStatus ?? "—")}
          {item.dueDate && <span className="ml-1 text-xs text-gray-400">spl. {fmtDate(item.dueDate)}</span>}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${meta.cls}`} title={meta.help}>
            {meta.label}
          </span>
          {item.bucketDetail && <div className="mt-0.5 text-xs text-gray-500">{item.bucketDetail}</div>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-right">
          {withActions && item.bucket !== "already_queued" && (
            <>
              <button type="button" onClick={() => void sendNow(item)} disabled={busy != null} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`}>
                {busy === `send-${item.raynetEventId}` ? "Posílám…" : "Poslat hned"}
              </button>
              {item.bucket === "deferred" && item.deferral ? (
                <button type="button" onClick={() => void cancelDeferral(item.deferral!.id)} disabled={busy != null} className={`${btn} ml-1 border border-sky-400 text-sky-800 hover:bg-sky-50`}>
                  Zrušit odložení
                </button>
              ) : (
                <button type="button" onClick={() => void defer(item)} disabled={busy != null} className={`${btn} ml-1 border border-gray-300 text-gray-700 hover:bg-gray-100`}>
                  Odložit
                </button>
              )}
            </>
          )}
        </td>
      </tr>
    );
  };

  const table = (rows: WatchItem[], withActions: boolean) => (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Zákazník</th>
            <th className="px-3 py-2">Zakázka</th>
            <th className="px-3 py-2">ZF vystavena</th>
            <th className="px-3 py-2">Způsob</th>
            <th className="px-3 py-2">Platba (fakturace)</th>
            <th className="px-3 py-2">Stav</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{rows.map((r) => renderRow(r, withActions))}</tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">Příští automatický běh</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{status ? fmtDateTime(status.nextRunAt) : "…"}</div>
          <div className="text-xs text-gray-500">každý všední den 6:00</div>
          {status && !status.enabled && (
            <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Automat je na serveru vypnutý (RETENTION_AUTO_ZF_ENABLED). Náhled i ruční odeslání fungují.</div>
          )}
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
          <div className="text-xs uppercase tracking-wide text-rose-700">V příští dávce</div>
          <div className="mt-1 text-2xl font-bold text-rose-800">{status ? due.length : "…"}</div>
          <div className="text-xs text-rose-700">zakázek půjde do fronty retencí</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">Poslední ostrý běh</div>
          {status?.lastLiveRun ? (
            <>
              <div className="mt-1 text-sm font-semibold text-gray-900">{fmtDateTime(status.lastLiveRun.started_at)}</div>
              <div className="text-xs text-gray-500">
                odesláno {status.lastLiveRun.sent_count}, přeskočeno {status.lastLiveRun.skipped_count}
                {status.lastLiveRun.status === "failed" ? " · selhal" : ""}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-gray-500">zatím žádný</div>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">Sledováno (tag ZF čekáme)</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{status ? items.length : "…"}</div>
          <div className="text-xs text-gray-500">náhled z {status ? fmtDateTime(status.snapshot.builtAt) : "…"}</div>
        </div>
      </div>

      {status?.snapshot.paymentSystemDegraded && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Fakturace (stav plateb) je teď nedostupná. Automat v tomto stavu nic neodesílá — dotčené zakázky jsou v „Nelze posoudit“.
        </div>
      )}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      {notice && (
        <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs text-gray-500 hover:underline">zavřít</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void load()} disabled={loading || busy != null} className={`${btn} border border-[#1E8449] bg-white text-[#1E8449] hover:bg-[#F1F8F4]`}>
          {loading ? "Načítám…" : "Obnovit náhled"}
        </button>
        <button type="button" onClick={() => void dryRun()} disabled={loading || busy != null} className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>
          {busy === "dry" ? "Běží…" : "Zkušební běh (nic neodešle)"}
        </button>
        {isAdmin && (
          <button type="button" onClick={() => void runNow()} disabled={loading || busy != null || due.length === 0} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`}>
            {busy === "run" ? "Běží…" : `Spustit ostrý běh teď (${due.length})`}
          </button>
        )}
        <span className="text-xs text-gray-500">
          Pravidlo: záloha převodem / fakturou, ZF vystavena před {days}+ dny, fakturace neeviduje úhradu → fronta retencí (jen zařazení, retence rozhoduje).
        </span>
      </div>

      {/* Next batch */}
      <section>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Příští dávka ({due.length})</h2>
        {status && due.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Žádná zakázka teď pravidlo nesplňuje.</div>
        ) : (
          status && table(due, true)
        )}
      </section>

      {/* Watched but not sent */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Sledované, ale zatím neodesílané ({rest.length})</h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(Object.keys(BUCKET_META) as Bucket[]).filter((b) => b !== "due").map((b) => (
              <span key={b} className={`rounded-md border px-1.5 py-0.5 font-semibold ${BUCKET_META[b].cls}`} title={BUCKET_META[b].help}>
                {BUCKET_META[b].label}: {counts[b] ?? 0}
              </span>
            ))}
            <button type="button" onClick={() => setShowAll((v) => !v)} className="ml-2 text-[#1E8449] hover:underline">
              {showAll ? "Skrýt" : "Zobrazit"}
            </button>
          </div>
        </div>
        {showAll && status && (rest.length === 0 ? <p className="text-sm text-gray-500">Nic dalšího se nesleduje.</p> : table(rest, true))}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Historie běhů</h2>
        {runs && runs.length === 0 && <p className="text-sm text-gray-500">Zatím žádný běh.</p>}
        {runs && runs.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Kdy</th>
                  <th className="px-3 py-2">Typ</th>
                  <th className="px-3 py-2">Výsledek</th>
                  <th className="px-3 py-2">Odesláno</th>
                  <th className="px-3 py-2">Přeskočeno</th>
                  <th className="px-3 py-2">Kdo</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-800">{fmtDateTime(r.started_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${r.mode === "live" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-gray-300 bg-gray-100 text-gray-700"}`}>
                          {r.mode === "live" ? "ostrý" : "zkušební"}
                        </span>
                        <span className="ml-1 text-xs text-gray-500">{r.trigger === "scheduled" ? "automaticky 6:00" : "ručně"}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={r.status === "failed" ? "font-semibold text-red-700" : r.status === "running" ? "text-amber-700" : "text-emerald-700"}>
                          {r.status === "failed" ? "selhal" : r.status === "running" ? "běží" : "OK"}
                        </span>
                        {r.error && <div className="text-xs text-red-700">{r.error}</div>}
                      </td>
                      <td className="px-3 py-2 text-gray-800">{r.mode === "live" ? r.sent_count : r.results.filter((x) => x.action === "would_send").length}</td>
                      <td className="px-3 py-2 text-gray-800">{r.skipped_count}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{r.actor ?? "systém"}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => setOpenRun(openRun === r.id ? null : r.id)} className="text-xs text-[#1E8449] hover:underline">
                          {openRun === r.id ? "Skrýt" : `Detail (${r.results.length})`}
                        </button>
                      </td>
                    </tr>
                    {openRun === r.id && (
                      <tr>
                        <td colSpan={7} className="bg-gray-50 px-3 py-2">
                          {r.results.length === 0 ? (
                            <p className="text-xs text-gray-500">Žádné sledované zakázky.</p>
                          ) : (
                            <table className="min-w-full text-xs">
                              <thead className="text-left text-gray-500">
                                <tr>
                                  <th className="px-2 py-1">Zákazník</th>
                                  <th className="px-2 py-1">Zakázka</th>
                                  <th className="px-2 py-1">ZF vystavena</th>
                                  <th className="px-2 py-1">Akce</th>
                                  <th className="px-2 py-1">Detail</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...r.results].sort((a, b) => (a.action === "sent" || a.action === "would_send" || a.action === "failed" ? 0 : 1) - (b.action === "sent" || b.action === "would_send" || b.action === "failed" ? 0 : 1)).map((x) => (
                                  <tr key={x.raynetEventId} className="border-t border-gray-200">
                                    <td className="px-2 py-1 text-gray-800">{x.customerName ?? "—"}</td>
                                    <td className="px-2 py-1 whitespace-nowrap">
                                      {x.orderId != null && orderLink(x.orderId) ? <a href={orderLink(x.orderId)!} className="text-[#1565C0] hover:underline">#{x.orderId}</a> : "Raynet-only"}
                                      <a href={raynetEventDeepLink(x.raynetEventId)} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#1E8449] hover:underline">Raynet</a>
                                    </td>
                                    <td className="px-2 py-1 whitespace-nowrap">{fmtDate(x.zfIssuedOn)}</td>
                                    <td className="px-2 py-1 whitespace-nowrap">
                                      <span className={`rounded px-1.5 py-0.5 font-semibold ${x.action === "sent" ? "bg-rose-100 text-rose-800" : x.action === "would_send" ? "bg-amber-100 text-amber-800" : x.action === "failed" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}`}>
                                        {x.action === "sent" ? "odesláno" : x.action === "would_send" ? "odeslalo by se" : x.action === "failed" ? "chyba" : `přeskočeno · ${BUCKET_META[x.bucket]?.label ?? x.bucket}`}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 text-gray-600">{x.detail ?? ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
