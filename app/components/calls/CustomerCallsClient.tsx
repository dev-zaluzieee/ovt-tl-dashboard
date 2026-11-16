'use client';

/**
 * Customer call history: Daktela recordings for an ERP customer (or one order), filtered by the phones of the customer
 * and of all his orders (from the backend). Native <audio> playback via a short-lived presigned URL. Every call goes
 * through /api/calls/*, which checks the session first.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLoad } from '@/app/components/ui/useLoad';
import Link from 'next/link';
import { callsGet, callsSend, errorText } from '@/lib/tl-api';
import { parseCustomerPhones } from '@/lib/tl-parse';
import type { CustomerPhones } from '@/lib/types';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';


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

// PoC pro AI analýzu (přepis/summary/sentiment) zatím pokrývá jen fronty
// "Příjem zakázek" — viz backend CallsService.getCallForAnalysis.
function isAnalysisEligible(c: CallRow): boolean {
  return Boolean(c.queue?.trim().startsWith('Příjem zakázek')) && c.hasS3Recording;
}

interface CallAnalysis {
  status: 'pending' | 'processing' | 'done' | 'error';
  transcript: string | null;
  summary: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  sentimentReason: string | null;
  errorMessage: string | null;
  completedAt: string | null;
}

export function CustomerCallsClient({ kind, id }: { kind: 'customer' | 'order'; id: number }) {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const loaded = useLoad<{ info: CustomerPhones; calls: CallRow[] }>(`customer-calls-${kind}-${id}-${from}-${to}`, async (signal) => {
    const data = (await callsGet('customer', { [kind === 'customer' ? 'customerId' : 'orderId']: id, from, to }, signal)) as { calls?: CallRow[] };
    return { info: parseCustomerPhones(data), calls: Array.isArray(data.calls) ? data.calls : [] };
  });
  const info = loaded.data?.info ?? null;
  const phones = useMemo(() => info?.phones ?? [], [info]);
  const calls = useMemo(() => loaded.data?.calls ?? [], [loaded.data]);
  const loading = loaded.loading;
  const error = loaded.error ? errorText(loaded.error, 'Nepodařilo se načíst hovory.') : null;
  const load = loaded.reload;
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

  const [analysisCall, setAnalysisCall] = useState<{ id: string; label: string } | null>(
    null
  );

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
      const data = (await callsGet(`play/${encodeURIComponent(c.id)}`)) as { url?: string };
      if (!data.url) {
        setPlayError('Nepodařilo se získat odkaz na nahrávku.');
        return;
      }
      const label = `${formatDateTimeCs(c.callTime)} · ${c.agent ?? 'agent?'}${
        c.customerName ? ` · ${c.customerName}` : ''
      }`;
      setPlaying({ id: c.id, url: data.url, label });
    } catch (e) {
      setPlayError(errorText(e, 'Chyba spojení.'));
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
            {info?.customerName ? `${info.customerName}. ` : ''}Napárováno podle telefonních čísel zákazníka a jeho zakázek v ERP (posledních 9 číslic).
          </p>
        </div>
        <Link href="/objednavky-s-hovory" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          ← Zpět na objednávky s hovory
        </Link>
      </div>

      {/* ── Phones list ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Telefonní čísla zákazníka a zakázek
        </p>
        {phones.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            Zákazník ani jeho zakázky nemají v ERP žádné telefonní číslo.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {phones.map((p) => (
              <span
                key={p.key}
                className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs font-mono text-gray-800"
                title={`klíč: ${p.key} · ${p.source === 'customer' ? 'z karty zákazníka' : 'ze zakázky'}`}
              >
                {p.phone}
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
              ? 'Zákazník nemá žádné telefonní číslo.'
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
                      <div className="flex justify-end gap-2">
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
                        {isAnalysisEligible(c) && (
                          <button
                            type="button"
                            onClick={() =>
                              setAnalysisCall({
                                id: c.id,
                                label: `${formatDateTimeCs(c.callTime)} · ${c.agent ?? 'agent?'}${
                                  c.customerName ? ` · ${c.customerName}` : ''
                                }`,
                              })
                            }
                            className="rounded-md border border-[#1E8449] px-3 py-1 text-xs font-semibold text-[#1E8449] hover:bg-[#1E8449]/10"
                            title="Přepis, shrnutí a sentiment hovoru (AI, PoC)"
                          >
                            Analýza
                          </button>
                        )}
                      </div>
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

      {analysisCall && (
        <AnalysisModal
          callId={analysisCall.id}
          label={analysisCall.label}
          onClose={() => setAnalysisCall(null)}
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

const SENTIMENT_LABEL = {
  positive: 'Pozitivní',
  neutral: 'Neutrální',
  negative: 'Negativní',
} as const;

const SENTIMENT_CLASSES = {
  positive: 'border-emerald-500 bg-emerald-50 text-emerald-900',
  neutral: 'border-gray-300 bg-gray-50 text-gray-700',
  negative: 'border-rose-400 bg-rose-50 text-rose-900',
} as const;

function AnalysisModal({
  callId,
  label,
  onClose,
}: {
  callId: string;
  label: string;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const base = `analysis/${encodeURIComponent(callId)}`;

    async function poll() {
      try {
        const data = (await callsGet(base)) as CallAnalysis;
        if (cancelled) return;
        setAnalysis(data);
        if (data.status === 'processing' || data.status === 'pending') {
          timer = setTimeout(() => void poll(), 2000);
        }
      } catch (e) {
        if (!cancelled) setError(errorText(e, 'Chyba spojení.'));
      }
    }

    async function start() {
      setError(null);
      try {
        const data = (await callsSend('POST', base, attempt > 0 ? { force: 'true' } : undefined)) as CallAnalysis;
        if (cancelled) return;
        setAnalysis(data);
        if (data.status === 'processing' || data.status === 'pending') {
          timer = setTimeout(() => void poll(), 2000);
        }
      } catch (e) {
        if (!cancelled) setError(errorText(e, 'Chyba spojení.'));
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [callId, attempt]);

  const isBusy = !error && (!analysis || analysis.status === 'processing' || analysis.status === 'pending');

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">
            Analýza hovoru <span className="font-normal text-gray-500">(PoC)</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Zavřít
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-700">{label}</p>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="mb-2">{error}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {!error && analysis?.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="mb-2">{analysis.errorMessage || 'Zpracování selhalo.'}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {!error && isBusy && (
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-700">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#1E8449]" />
            Zpracovávám (přepis → shrnutí)… může trvat desítky sekund.
          </div>
        )}

        {!error && analysis?.status === 'done' && (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sentiment
              </p>
              {analysis.sentiment && (
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${SENTIMENT_CLASSES[analysis.sentiment]}`}
                >
                  {SENTIMENT_LABEL[analysis.sentiment]}
                </span>
              )}
              {analysis.sentimentReason && (
                <p className="mt-1 text-sm text-gray-600">{analysis.sentimentReason}</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Shrnutí
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{analysis.summary}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Přepis
              </p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-gray-700">{analysis.transcript}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="text-xs font-medium text-gray-500 underline hover:text-gray-700"
            >
              Přegenerovat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
