"use client";

import { useMemo, useState } from "react";
import { TargetSelect } from "./TargetSelect";
import {
  AUDIENCES,
  btnGhost,
  input,
  regionSlotId,
  resolveTarget,
  targetName,
  type Audience,
  type CalendarSource,
  type Region,
  type RegionOvt,
  type Resolution,
  type Settings,
  type Target,
  type UnmatchedOvt,
} from "./types";

interface Props {
  source: CalendarSource;
  activeDays: number;
  regions: Region[];
  withoutRegion: RegionOvt[];
  notInCalendar: UnmatchedOvt[];
  settings: Settings | null;
  targets: Target[];
  targetById: Map<number, Target>;
  isAdmin: boolean;
  busy: string | null;
  onSetRegion: (regionKey: string, audience: Audience, targetId: number | null) => Promise<void>;
}

type Warning = { level: "red" | "amber"; text: string };

function resolutionText(res: Resolution): { text: string; tone: string } {
  if (res.kind === "region") return { text: targetName(res.target), tone: "text-gray-700" };
  if (res.kind === "default") return { text: `výchozí: ${targetName(res.target)}`, tone: "text-gray-500" };
  return { text: "bez QR", tone: "text-rose-700 font-semibold" };
}

function regionWarnings(r: Region, settings: Settings | null, targetById: Map<number, Target>): Warning[] {
  const out: Warning[] = [];
  const active = r.ovts.filter((o) => o.admf_count > 0).length;
  for (const { audience, label, hint } of AUDIENCES) {
    const res = resolveTarget(r.config, audience, settings, targetById);
    if (active > 0 && res.kind === "none") {
      out.push({ level: "red", text: `${label} (${hint}): OVT z tohoto kraje QR neuvidí. Nastavte QR kraje nebo výchozí QR.` });
    }
    if (res.kind !== "region" && res.regionTargetInactive) {
      out.push({
        level: "amber",
        text: `${label}: nastavený QR kraje je neaktivní, ${res.kind === "default" ? "použije se výchozí" : "neukáže se nic"}.`,
      });
    }
  }
  if (!r.known && r.in_calendar) {
    out.push({
      level: "amber",
      text: "Neznámý název kraje v marketingovém kalendáři. Opravte ho tam na jeden ze 14 krajů; do té doby lze QR nastavit i pro tento název.",
    });
  }
  if (!r.known && !r.in_calendar && r.config) {
    out.push({ level: "amber", text: "Tento název kraje už v kalendáři nikdo nemá. Nastavení je zbytečné a lze ho smazat." });
  }
  return out;
}

function OvtChip({ o, activeDays }: { o: RegionOvt; activeDays: number }) {
  const inactive = o.admf_count === 0;
  const title = [
    o.position,
    o.city,
    o.email ?? `Raynet ${o.raynet_user_id}: bez účtu v tabletu`,
    inactive ? `bez ADMF za posledních ${activeDays} dní` : `${o.admf_count} ADMF za ${activeDays} dní`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        inactive ? "border-gray-200 bg-gray-50 text-gray-400" : "border-gray-300 bg-white text-gray-800"
      }`}
    >
      {o.name}
      {o.city && <span className="text-gray-400">· {o.city}</span>}
      {!o.email && <span className="text-amber-600">?</span>}
    </span>
  );
}

export function RegionsSection({
  source,
  activeDays,
  regions,
  withoutRegion,
  notInCalendar,
  settings,
  targets,
  targetById,
  isAdmin,
  busy,
  onSetRegion,
}: Props) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return regions
      .map((r) => ({ r, warnings: regionWarnings(r, settings, targetById) }))
      .filter(({ warnings }) => !onlyProblems || warnings.length > 0)
      .filter(
        ({ r }) =>
          !q ||
          r.key.toLowerCase().includes(q) ||
          r.ovts.some((o) => o.name.toLowerCase().includes(q) || (o.email ?? "").toLowerCase().includes(q))
      );
  }, [regions, settings, targetById, onlyProblems, query]);

  const activeWithoutRegion = withoutRegion.filter((o) => o.admf_count > 0);
  const idleWithoutRegion = withoutRegion.length - activeWithoutRegion.length;
  const fallback = AUDIENCES.map(({ audience, label }) => ({
    label,
    ...resolutionText(resolveTarget(null, audience, settings, targetById)),
  }));

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
        Kraj OVT se bere z marketingového kalendáře (tady se nenastavuje). Každý kraj má jeden QR pro soukromé zákazníky (B2C)
        a jeden pro firmy (B2B). Nevyplněný QR kraje = výchozí QR. Šedě jsou OVT bez ADMF za posledních {activeDays} dní,
        otazník = OVT nemá účet v tabletu.
      </p>

      {!source.ok ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-800">
          Marketingový kalendář se nepodařilo načíst{source.error ? `: ${source.error}` : ""}. Kraje OVT teď nejsou vidět a tablety
          QR pravděpodobně neukazují (bez kraje tablet QR raději neukáže vůbec).
        </div>
      ) : (
        <p className="text-xs text-gray-400">Marketingový kalendář: {source.ovt_count} OVT.</p>
      )}

      <div className="space-y-2">
        {rows.map(({ r, warnings }) => {
          const active = r.ovts.filter((o) => o.admf_count > 0).length;
          const spellings = r.raw_names.filter((n) => n !== r.key);
          return (
            <div
              key={r.key}
              className={`rounded-lg border bg-white p-3 ${
                warnings.some((w) => w.level === "red") ? "border-rose-300" : warnings.length ? "border-amber-300" : "border-gray-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">
                    {r.key}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      {r.ovts.length === 0 ? "žádný OVT v kalendáři" : `${r.ovts.length} OVT, ${active} aktivních`}
                    </span>
                  </h3>
                  {spellings.length > 0 && (
                    <p className="text-xs text-gray-400">V kalendáři zapsáno jako: {r.raw_names.join(", ")}</p>
                  )}
                  {warnings.map((w, i) => (
                    <p key={i} className={`mt-1 text-xs ${w.level === "red" ? "text-rose-700" : "text-amber-700"}`}>
                      {w.text}
                    </p>
                  ))}
                  {isAdmin && !r.known && !r.in_calendar && r.config && (
                    <button
                      type="button"
                      className={`${btnGhost} mt-2`}
                      disabled={busy === `reg-${r.key}-b2c` || busy === `reg-${r.key}-b2b`}
                      onClick={async () => {
                        await onSetRegion(r.key, "b2c", null);
                        await onSetRegion(r.key, "b2b", null);
                      }}
                    >
                      Smazat nastavení
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AUDIENCES.map(({ audience, label, hint, platformOrder }) => {
                    const slot = regionSlotId(r.config, audience);
                    const res = resolveTarget(r.config, audience, settings, targetById);
                    const fallbackRes = resolveTarget(null, audience, settings, targetById);
                    const emptyLabel = fallbackRes.kind === "none" ? "— bez QR —" : `— výchozí (${targetName(fallbackRes.target)}) —`;
                    const shown = resolutionText(res);
                    return (
                      <div key={audience} className="min-w-[14rem]">
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold text-gray-700">{label}</span> {hint}
                        </p>
                        {isAdmin ? (
                          <TargetSelect
                            className="mt-1 w-full"
                            targets={targets}
                            platformOrder={platformOrder}
                            value={slot}
                            emptyLabel={emptyLabel}
                            disabled={busy === `reg-${r.key}-${audience}`}
                            onChange={(id) => void onSetRegion(r.key, audience, id)}
                          />
                        ) : (
                          <p className={`mt-1 text-sm ${shown.tone}`}>{shown.text}</p>
                        )}
                        {isAdmin && res.kind !== "region" && (
                          <p className={`mt-0.5 text-xs ${shown.tone}`}>tablet ukáže: {shown.text}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {r.ovts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.ovts.map((o) => (
                    <OvtChip key={o.raynet_user_id} o={o} activeDays={activeDays} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-gray-500">Žádný kraj neodpovídá filtru.</p>}
      </div>

      {source.ok && (notInCalendar.length > 0 || withoutRegion.length > 0) && (
        <div className="rounded-lg border border-amber-300 bg-white p-3">
          <h3 className="font-semibold text-gray-900">OVT mimo kraje</h3>
          <p className="mt-1 text-sm text-gray-500">
            Tito OVT nemají v marketingovém kalendáři kraj, takže tablet ukáže výchozí QR (B2C: {" "}
            <span className={fallback[0].tone}>{fallback[0].text}</span>, B2B:{" "}
            <span className={fallback[1].tone}>{fallback[1].text}</span>). Opravte to v marketingovém kalendáři, tady se kraj
            nenastavuje.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">OVT</th>
                  <th className="px-3 py-2 text-right">ADMF {activeDays} dní</th>
                  <th className="px-3 py-2">Proč</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {notInCalendar.map((o) => (
                  <tr key={o.email}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                      {o.name ?? o.email.split("@")[0]} <span className="text-xs text-gray-400">{o.email}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.admf_count}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {o.reason === "no_raynet_id"
                        ? "účet v tabletu nemá Raynet ID, nelze ho spárovat s kalendářem"
                        : `není v marketingovém kalendáři (Raynet ID ${o.raynet_user_id})`}
                    </td>
                  </tr>
                ))}
                {activeWithoutRegion.map((o) => (
                  <tr key={o.raynet_user_id}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                      {o.name} {o.email && <span className="text-xs text-gray-400">{o.email}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.admf_count}</td>
                    <td className="px-3 py-2 text-gray-600">v kalendáři nemá vyplněný kraj</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {idleWithoutRegion > 0 && (
            <p className="mt-2 text-xs text-gray-400">
              Dalších {idleWithoutRegion} záznamů v kalendáři bez kraje nemá žádné ADMF za {activeDays} dní:{" "}
              {withoutRegion
                .filter((o) => o.admf_count === 0)
                .map((o) => o.name)
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}
    </section>
  );
}
