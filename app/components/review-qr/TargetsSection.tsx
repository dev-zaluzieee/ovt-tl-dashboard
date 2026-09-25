"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AUDIENCES,
  btn,
  btnGhost,
  btnPrimary,
  defaultIdOf,
  input,
  PLATFORM_LABEL,
  regionSlotId,
  targetName,
  type Platform,
  type Region,
  type Settings,
  type Target,
} from "./types";

const EMPTY_FORM = { label: "", platform: "google" as Platform, url: "", active: true };

export interface TargetUsage {
  /** Audience labels this target is the global default for. */
  defaults: string[];
  /** "B2C: Hlavní město Praha" style entries. */
  regions: string[];
}

/** Where each target is used: global defaults + region slots. */
export function usageByTarget(settings: Settings | null, regions: Region[]): Map<number, TargetUsage> {
  const m = new Map<number, TargetUsage>();
  const get = (id: number) => {
    let u = m.get(id);
    if (!u) {
      u = { defaults: [], regions: [] };
      m.set(id, u);
    }
    return u;
  };
  for (const { audience, label } of AUDIENCES) {
    const d = defaultIdOf(settings, audience);
    if (d != null) get(d).defaults.push(label);
    for (const r of regions) {
      const id = regionSlotId(r.config, audience);
      if (id != null) get(id).regions.push(`${label}: ${r.key}`);
    }
  }
  return m;
}

interface Props {
  targets: Target[];
  usage: Map<number, TargetUsage>;
  isAdmin: boolean;
  busy: string | null;
  onSave: (id: number | null, form: typeof EMPTY_FORM) => Promise<boolean>;
  onDelete: (t: Target) => Promise<void>;
}

/** Catalogue of review pages; the QR is rendered from the URL, nothing is stored as an image. */
export function TargetsSection({ targets, usage, isAdmin, busy, onSave, onDelete }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const preview = previewId != null ? targets.find((t) => t.id === previewId) ?? null : null;

  async function save() {
    if (await onSave(editingId, form)) {
      setForm(EMPTY_FORM);
      setEditingId(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">QR cíle</h2>
      <p className="text-sm text-gray-500">
        Jeden cíl = jedna stránka s recenzemi (Google Praha, Firmy.cz Ostrava…). QR se generuje z URL, obrázky se neukládají.
        Platforma je jen popisek, cíl jde použít pro B2C i B2B.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">Platforma</th>
              <th className="px-3 py-2">URL</th>
              <th className="px-3 py-2">Použití</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {targets.map((t) => {
              const u = usage.get(t.id);
              const used = !!u && (u.defaults.length > 0 || u.regions.length > 0);
              return (
                <tr key={t.id} className={t.active ? "" : "text-gray-400"}>
                  <td className="px-3 py-2 font-medium text-gray-800">{t.label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{PLATFORM_LABEL[t.platform]}</td>
                  <td className="max-w-[320px] truncate px-3 py-2 text-gray-600" title={t.url}>
                    <a href={t.url} target="_blank" rel="noreferrer" className="text-[#1E8449] hover:underline">
                      {t.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {u?.defaults.map((label) => (
                      <span key={label} className="mr-1 rounded bg-[#E3F2FD] px-1.5 py-0.5 font-semibold uppercase text-[#1565C0]">
                        výchozí {label}
                      </span>
                    ))}
                    {u && u.regions.length > 0 && (
                      <span className="text-gray-600" title={u.regions.join("\n")}>
                        {u.regions.length === 1 ? u.regions[0] : `${u.regions.length} krajů`}
                      </span>
                    )}
                    {!used && <span className="text-gray-400">—</span>}
                    {used && !t.active && <span className="ml-1 text-rose-700">neaktivní, neukáže se</span>}
                  </td>
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
                          onClick={() => void onDelete(t)}
                        >
                          Smazat
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
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

      {preview && (
        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <QRCodeSVG value={preview.url} size={200} level="M" />
          </div>
          <div className="text-sm text-gray-700">
            <p className="font-semibold">{targetName(preview)}</p>
            <p className="mt-2 break-all text-xs text-gray-500">{preview.url}</p>
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
                placeholder="Praha"
              />
            </label>
            <label className="text-xs text-gray-600">
              Platforma
              <br />
              <select className={input} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })}>
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
            <button type="button" className={btnPrimary} disabled={busy === "save"} onClick={() => void save()}>
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
  );
}

export type TargetForm = typeof EMPTY_FORM;
