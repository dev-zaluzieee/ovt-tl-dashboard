"use client";

import { useMemo, useState } from "react";
import { TargetSelect } from "./TargetSelect";
import {
  SLOTS,
  input,
  regionSlotId,
  resolveTarget,
  targetName,
  type OutsideOvt,
  type Region,
  type RegionOvt,
  type Resolution,
  type Settings,
  type Slot,
  type Target,
} from "./types";

interface Props {
  activeDays: number;
  krajSource: string | null;
  regions: Region[];
  outside: OutsideOvt[];
  settings: Settings | null;
  targets: Target[];
  targetById: Map<number, Target>;
  busy: string | null;
  onSetRegion: (regionKey: string, slot: Slot, targetId: number | null) => Promise<void>;
}

type Warning = { level: "red" | "amber"; text: string };

function resolutionText(res: Resolution): { text: string; tone: string } {
  if (res.kind === "region") return { text: targetName(res.target), tone: "text-gray-700" };
  if (res.kind === "default") return { text: `výchozí: ${targetName(res.target)}`, tone: "text-gray-500" };
  return { text: "bez QR", tone: "text-rose-700 font-semibold" };
}

function regionWarnings(r: Region, settings: Settings | null, targetById: Map<number, Target>): Warning[] {
  const out: Warning[] = [];
  const active = r.ovts.length;
  for (const { slot, label, hint } of SLOTS) {
    const res = resolveTarget(r.config, slot, settings, targetById);
    if (active > 0 && res.kind === "none") {
      out.push({ level: "red", text: `${label} (${hint}): OVT z tohoto kraje QR neuvidí. Nastavte QR kraje nebo výchozí QR.` });
    }
    if (res.kind !== "region" && res.regionTargetInactive) {
      out.push({ level: "amber", text: `${label}: nastavený QR kraje je neaktivní, ${res.kind === "default" ? "použije se výchozí" : "neukáže se nic"}.` });
    }
  }
  if (!r.known) {
    out.push({ level: "amber", text: "Název kraje není jedním ze 14 krajů. Nastavení je zbytečné a lze ho smazat." });
  }
  return out;
}

function OvtChip({ o, activeDays }: { o: RegionOvt; activeDays: number }) {
  return (
    <span
      title={[o.email, `${o.surveys} zaměření za ${activeDays} dní`].filter(Boolean).join(" · ")}
      className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-800"
    >
      {o.name}
      <span className="text-gray-400">· {o.surveys}</span>
    </span>
  );
}

export function RegionsSection({ activeDays, krajSource, regions, outside, settings, targets, targetById, busy, onSetRegion }: Props) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return regions
      .map((r) => ({ r, warnings: regionWarnings(r, settings, targetById) }))
      .filter(({ warnings }) => !onlyProblems || warnings.length > 0)
      .filter(({ r }) => !q || r.key.toLowerCase().includes(q) || r.ovts.some((o) => o.name.toLowerCase().includes(q) || (o.email ?? "").toLowerCase().includes(q)));
  }, [regions, settings, targetById, onlyProblems, query]);

  const fallback = SLOTS.map(({ slot, label }) => ({ label, ...resolutionText(resolveTarget(null, slot, settings, targetById)) }));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">QR podle krajů</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
            jen kraje s upozorněním
          </label>
          <input className={`${input} w-56`} placeholder="Hledat kraj nebo OVT…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <p className="text-sm text-gray-500">
        Kraj OVT je domovský kraj jeho uživatele v ERP (tady se nenastavuje). Prázdný slot = výchozí QR (šedě v nabídce). V kraji jsou OVT, kteří měli zaměření za posledních {activeDays} dní (číslo = počet zaměření).
        {krajSource ? ` Zdroj: ${krajSource}.` : ""}
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Kraj</th>
              {SLOTS.map(({ slot, label, hint }) => (
                <th key={slot} className="px-3 py-2 font-semibold normal-case tracking-normal">
                  <span className="uppercase tracking-wide">{label}</span>
                  <span className="ml-2 font-normal text-gray-400">{hint}</span>
                </th>
              ))}
              <th className="px-3 py-2">OVT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ r, warnings }) => {
              const red = warnings.some((w) => w.level === "red");
              return (
                <tr key={r.key} className={red ? "bg-rose-50/40" : warnings.length ? "bg-amber-50/40" : ""}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-gray-900">{r.key}</div>
                    <div className="text-xs text-gray-400">{r.ovts.length === 0 ? "žádný aktivní OVT" : `${r.ovts.length} aktivních OVT`}</div>
                    {warnings.map((w, i) => (
                      <div key={i} className={`mt-1 text-xs ${w.level === "red" ? "text-rose-700" : "text-amber-700"}`}>
                        {w.text}
                      </div>
                    ))}
                  </td>
                  {SLOTS.map(({ slot, platformOrder }) => {
                    const slotTargetId = regionSlotId(r.config, slot);
                    const res = resolveTarget(r.config, slot, settings, targetById);
                    const fallbackRes = resolveTarget(null, slot, settings, targetById);
                    const emptyLabel = fallbackRes.kind === "none" ? "— bez QR —" : `výchozí · ${targetName(fallbackRes.target)}`;
                    const shown = resolutionText(res);
                    return (
                      <td key={slot} className="px-3 py-2 align-top">
                        <TargetSelect
                          className={`w-full min-w-[13rem] ${slotTargetId == null ? "text-gray-400" : ""}`}
                          targets={targets}
                          platformOrder={platformOrder}
                          value={slotTargetId}
                          emptyLabel={emptyLabel}
                          disabled={busy === `reg-${r.key}-${slot}`}
                          onChange={(id) => void onSetRegion(r.key, slot, id)}
                        />
                        {res.kind !== "region" && res.regionTargetInactive && <div className={`mt-0.5 text-xs ${shown.tone}`}>tablet ukáže: {shown.text}</div>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 align-top">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {r.ovts.map((o) => (
                        <OvtChip key={o.userId} o={o} activeDays={activeDays} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-500">
                  Žádný kraj neodpovídá filtru.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {outside.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-white p-3">
          <h3 className="font-semibold text-gray-900">OVT mimo kraje</h3>
          <p className="mt-1 text-sm text-gray-500">
            Tito aktivní OVT nemají v ERP domovský kraj, takže tablet ukáže výchozí QR (primární: <span className={fallback[0].tone}>{fallback[0].text}</span>, sekundární:{" "}
            <span className={fallback[1].tone}>{fallback[1].text}</span>). Kraj se doplňuje v ERP, tady se nenastavuje.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">OVT</th>
                  <th className="px-3 py-2 text-right">Zaměření {activeDays} dní</th>
                  <th className="px-3 py-2">Proč</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outside.map((o) => (
                  <tr key={o.userId}>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-800">
                      {o.name} {o.email && <span className="text-xs text-gray-400">{o.email}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.surveys}</td>
                    <td className="px-3 py-2 text-gray-600">{o.reason === "no_home_kraj" ? "v ERP nemá domovský kraj" : o.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
