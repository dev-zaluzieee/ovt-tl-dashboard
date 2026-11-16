/**
 * Error text from an API response.
 *
 * Our backends disagree on the field: ceniky-2 returns `{ success: false, message }`
 * (utils/errorHandler), finance-dashboard returns `{ error }`. The app used to read
 * only `error`, so every ceniky-2 message was swallowed and the montér saw the
 * generic "zkuste to znovu" — including "Událost právě uzavřel váš parťák. Obnovte
 * stránku." (montéři testing 2026-09-22). Always go through this helper.
 */
export function apiErrorText(json: unknown, fallback: string): string {
  const j = (json ?? {}) as { message?: unknown; error?: unknown };
  const msg = typeof j.message === 'string' && j.message.trim() ? j.message.trim() : null;
  const err = typeof j.error === 'string' && j.error.trim() ? j.error.trim() : null;
  return msg ?? err ?? fallback;
}
