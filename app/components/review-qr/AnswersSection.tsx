"use client";

import { useMemo } from "react";
import { fmtDateTime, input, OUTCOME_LABEL, targetName, type PromptRow, type PromptStats } from "./types";

interface Props {
  days: number;
  onDaysChange: (days: number) => void;
  prompts: PromptRow[];
  stats: PromptStats[];
  regionStats: PromptStats[];
}

function StatsTable({ title, rows, emptyKey }: { title: string; rows: PromptStats[]; emptyKey: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">{title}</th>
            <th className="px-3 py-2 text-right">Zobrazeno</th>
            <th className="px-3 py-2 text-right">Napsal</th>
            <th className="px-3 py-2 text-right">Odmítl</th>
            <th className="px-3 py-2 text-right">Neukázáno</th>
            <th className="px-3 py-2 text-right">Bez odpovědi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((s) => (
            <tr key={s.key ?? "__none"}>
              <td className="px-3 py-2 whitespace-nowrap text-gray-800">{s.key ?? <span className="text-gray-400">{emptyKey}</span>}</td>
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
  );
}

/** What the OVTs did with the prompt: totals, per region, per OVT, and the log. */
export function AnswersSection({ days, onDaysChange, prompts, stats, regionStats }: Props) {
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

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Co OVT odpověděli</h2>
        <label className="text-xs text-gray-600">
          Období
          <select className={`${input} ml-2`} value={days} onChange={(e) => onDaysChange(Number(e.target.value))}>
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
      <StatsTable title="Kraj" rows={regionStats} emptyKey="bez kraje" />
      <StatsTable title="OVT" rows={stats} emptyKey="—" />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Kdy</th>
              <th className="px-3 py-2">OVT</th>
              <th className="px-3 py-2">Kraj</th>
              <th className="px-3 py-2">Zákazník</th>
              <th className="px-3 py-2">Typ</th>
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
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{p.region ?? <span className="text-gray-400">bez kraje</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                  {p.customer_name ?? "—"}
                  {p.order_id != null && <span className="ml-1 text-xs text-gray-400">#{p.order_id}</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">{p.audience === "b2b" ? "B2B firma" : "B2C soukromá"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                  {p.target_label
                    ? p.target_platform
                      ? targetName({ label: p.target_label, platform: p.target_platform })
                      : p.target_label
                    : "—"}
                  {p.target_source === "default" && <span className="ml-1 text-xs text-gray-400">(výchozí)</span>}
                </td>
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
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  Za zvolené období tablet žádný QR neukázal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
