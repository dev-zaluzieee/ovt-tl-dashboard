'use client';

/**
 * Customer call history — Daktela recordings for a Raynet company, filtered
 * by phone numbers pulled from local orders. Native <audio> playback via a
 * short-lived S3 presigned URL.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';

interface PhoneRow {
  normalized: string;
  raw: string;
}

interface CallRow {
  id: string;
  externalCallId: string | null;
  customerName: string | null;
  phone: string | null;
  agent: string | null;
  queue: string | null;
  callTime: string;
  hasRecording: boolean;
  hasS3Recording: boolean;
  recordingStatus: 'available' | 'missing' | 'error';
  canPlay: boolean;
}

interface ApiResponse {
  success?: boolean;
  message?: string;
  data?: {
    phones: PhoneRow[];
    calls: CallRow[];
  };
}

function formatDateTimeCs(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t));
}

function formatPhoneDisplay(raw: string | null): string {
  if (!raw) return '—';
  return raw;
}

function isPlayable(c: CallRow): boolean {
  return c.hasS3Recording && c.canPlay;
}

export function CustomerCallsClient({
  raynetCompanyId,
}: {
  raynetCompanyId: number;
}) {
  const [phones, setPhones] = useState<PhoneRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [queueFilter, setQueueFilter] = useState<string>('');
  const [density, setDensity] = useListDensity();
  const isCompact = density === 'compact';
  const cellPad = isCompact ? 'px-2 py-1' : 'px-3 py-2.5';

  const [playing, setPlaying] = useState<{
    id: string;
    url: string;
    label: string;
  } | null>(null);
  const [loadingPlayId, setLoadingPlayId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(
        `/api/customer-calls/${raynetCompanyId}${qs.size > 0 ? `?${qs}` : ''}`,
        { headers: { Accept: 'application/json' } }
      );
      const body = (await res.json()) as ApiResponse;
      if (!res.ok || !body.success || !body.data) {
        setError(body.message || `Chyba při načítání (${res.status})`);
        setPhones([]);
        setCalls([]);
        return;
      }
      setPhones(body.data.phones);
      setCalls(body.data.calls);
    } catch {
      setError('Nepodařilo se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  }, [raynetCompanyId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const agents = useMemo(() => {
    const s = new Set<string>();
    for (const c of calls) {
      if (c.agent && c.agent.trim().length > 0) s.add(c.agent.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'cs'));
  }, [calls]);

  const queues = useMemo(() => {
    const s = new Set<string>();
    for (const c of calls) {
      if (c.queue && c.queue.trim().length > 0) s.add(c.queue.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'cs'));
  }, [calls]);

  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      if (agentFilter && c.agent !== agentFilter) return false;
      if (queueFilter && c.queue !== queueFilter) return false;
      return true;
    });
  }, [calls, agentFilter, queueFilter]);

  const handlePlay = useCallback(async (c: CallRow) => {
    if (!isPlayable(c)) return;
    setLoadingPlayId(c.id);
    setPlayError(null);
    try {
      const res = await fetch(`/api/customer-calls/play/${encodeURIComponent(c.id)}`);
      const body = (await res.json()) as {
        success?: boolean;
        message?: string;
        data?: { url?: string };
      };
      if (!res.ok || !body.success || !body.data?.url) {
        setPlayError(body.message || `Nepodařilo se získat URL (${res.status}).`);
        return;
      }
      const label = `${formatDateTimeCs(c.callTime)} · ${c.agent ?? 'agent?'}${
        c.customerName ? ` · ${c.customerName}` : ''
      }`;
      setPlaying({ id: c.id, url: body.data.url, label });
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : 'Chyba spojení.');
    } finally {
      setLoadingPlayId(null);
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1E8449]">
            Hovory zákazníka
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Napárováno podle telefonních čísel z místních objednávek.
          </p>
        </div>
        <Link
          href={`/klient/${raynetCompanyId}`}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Zpět na kartu klienta
        </Link>
      </div>

      {/* ── Phones list ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Telefonní čísla z objednávek
        </p>
        {phones.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            V tomto klientovi nejsou v lokální DB žádná telefonní čísla.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {phones.map((p) => (
              <span
                key={p.normalized}
                className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs font-mono text-gray-800"
                title={`normalizované: ${p.normalized}`}
              >
                {p.raw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700" htmlFor="from">
            Od:
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          <label className="text-sm font-medium text-gray-700" htmlFor="to">
            Do:
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Vymazat
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">Agent: všichni</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={queueFilter}
            onChange={(e) => setQueueFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">Fronta: všechny</option>
            {queues.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
          <DensityToggle density={density} onChange={setDensity} />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Načítání…' : 'Obnovit'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      )}

      {playError && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          {playError}
        </div>
      )}

      {loading && calls.length === 0 && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {!loading && filteredCalls.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600 shadow-sm">
          <p className="font-medium text-gray-900">Žádné hovory</p>
          <p className="mt-2 text-sm">
            {phones.length === 0
              ? 'Klient nemá žádné telefonní číslo v lokálních objednávkách.'
              : 'Na tato čísla nemáme v Daktele žádné odpovídající hovory (v tomto rozsahu).'}
          </p>
        </div>
      )}

      {filteredCalls.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className={cellPad}>Datum</th>
                  <th className={cellPad}>Telefon</th>
                  <th className={cellPad}>Agent</th>
                  <th className={cellPad}>Fronta</th>
                  <th className={cellPad}>Nahrávka</th>
                  <th className={`${cellPad} text-right`}>Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCalls.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className={`${cellPad} whitespace-nowrap text-gray-800`}>
                      {formatDateTimeCs(c.callTime)}
                    </td>
                    <td
                      className={`${cellPad} whitespace-nowrap font-mono text-gray-800`}
                    >
                      {formatPhoneDisplay(c.phone)}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-gray-800`}>
                      {c.agent ?? '—'}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-gray-600`}>
                      {c.queue ?? '—'}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <RecordingStatus call={c} />
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-right`}>
                      <button
                        type="button"
                        onClick={() => void handlePlay(c)}
                        disabled={!isPlayable(c) || loadingPlayId === c.id}
                        className="rounded-md bg-[#1565C0] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0d4f9c] disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          !c.hasS3Recording
                            ? 'Nahrávka zatím není v S3 (běží sync).'
                            : !c.canPlay
                              ? 'Nemáte oprávnění přehrávat.'
                              : 'Přehrát'
                        }
                      >
                        {loadingPlayId === c.id ? 'Načítám…' : 'Přehrát'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {playing && (
        <PlaybackModal
          url={playing.url}
          label={playing.label}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
}

function RecordingStatus({ call }: { call: CallRow }) {
  if (!call.hasRecording) {
    return (
      <span className="rounded-md border border-gray-300 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
        Bez nahrávky
      </span>
    );
  }
  if (call.recordingStatus === 'error') {
    return (
      <span className="rounded-md border border-rose-400 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-900">
        Chyba
      </span>
    );
  }
  if (!call.hasS3Recording) {
    return (
      <span className="rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
        Čeká na sync
      </span>
    );
  }
  return (
    <span className="rounded-md border border-emerald-500 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
      Připraveno
    </span>
  );
}

function PlaybackModal({
  url,
  label,
  onClose,
}: {
  url: string;
  label: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">Přehrát hovor</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Zavřít
          </button>
        </div>
        <p className="mb-3 text-sm text-gray-700">{label}</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          key={url}
          controls
          autoPlay
          src={url}
          className="w-full"
        />
        <p className="mt-2 text-[10px] text-gray-400">
          Odkaz je krátkodobý (S3 presigned). Po zavření znovu klikni Přehrát.
        </p>
      </div>
    </div>
  );
}
