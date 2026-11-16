/**
 * Czech texts for the backend's error codes (L7 section 3). The backend already sends a Czech `message`; for the codes
 * the app can explain better (what to do next) the text is ours, for ERP refusals the ERP's own message is appended.
 * Pure: no imports, used by the client and the contract check.
 */

export class TlApiError extends Error {
  status: number;
  code: string | null;
  body: Record<string, unknown>;
  constructor(status: number, message: string, code: string | null, body: Record<string, unknown>) {
    super(message);
    this.name = 'TlApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** The step explanations an ERP write failure carries (`data.steps`), as short Czech lines. */
export function stepLines(body: Record<string, unknown>): string[] {
  const data = body.data as { steps?: unknown } | undefined;
  if (!data || !Array.isArray(data.steps)) return [];
  const out: string[] = [];
  for (const s of data.steps as Array<Record<string, unknown>>) {
    if (s && s.status === 'failed') out.push(`${typeof s.label === 'string' ? s.label : String(s.name)}: ${typeof s.detail === 'string' && s.detail ? s.detail : 'selhalo'}`);
  }
  return out;
}

const ERP_REFUSALS = new Set(['ERP_WRITE_FAILED', 'ERP_VALIDATION', 'ERP_CONFLICT', 'ERP_ERROR']);

export function errorText(e: unknown, fallback = 'Něco se nepovedlo, zkuste to prosím znovu.'): string {
  if (!(e instanceof TlApiError)) {
    if (e instanceof Error && e.name === 'TlShapeError') return e.message;
    return e instanceof Error && e.message ? e.message : fallback;
  }
  const own = e.message && e.message.trim() ? e.message.trim() : null;
  const missing = Array.isArray(e.body.missing) ? (e.body.missing as unknown[]).filter((x) => typeof x === 'string').join(', ') : '';
  switch (e.code) {
    case 'UNAUTHORIZED':
      return 'Přihlášení vypršelo, přihlaste se prosím znovu.';
    case 'TOKEN_RENEW':
      return 'ERP odmítlo vaše přihlášení, zápis se neprovedl. Odhlaste se a přihlaste znovu; pokud to nepomůže, obraťte se na správce (aplikace nemusí být v ERP povolená).';
    case 'NOT_CONFIGURED':
      return `Dashboard na serveru ještě není nastavený${missing ? ` (chybí: ${missing})` : ''}. Obraťte se na správce.`;
    case 'MIGRATION_PENDING':
      return 'Tato část potřebuje databázovou migraci, která ještě není nasazená (tl2 nebo aplikace montérů). Obraťte se na správce.';
    case 'NO_ERP_USER':
      return 'Váš účet nemá uživatele v ERP, proto vám dashboard nic nezobrazí. Kontaktujte prosím kancelář, aby účet založila.';
    case 'ERP_ACCOUNT_DISABLED':
      return 'Váš uživatel v ERP je deaktivovaný. Kontaktujte prosím kancelář.';
    case 'FORBIDDEN_ROLE':
      return 'SSO vás do dashboardu nepouští. Pokud si myslíte, že ano, kontaktujte kancelář.';
    case 'ERP_DB_TIMEOUT':
    case 'ERP_DB_BUSY':
    case 'ERP_DB_UNAVAILABLE':
    case 'AUTH_UNAVAILABLE':
    case 'BACKEND_UNREACHABLE':
      return 'Server nebo ERP je dočasně nedostupné. Zkuste to prosím za chvíli.';
    case 'DRY_RUN':
      return 'Zápis do ERP je vypnutý (zkušební běh), nic se nezapsalo.';
    case 'NOT_LISTED':
      return 'Řádek už na seznamu není (mezitím se změnil). Obnovte seznam.';
    case 'ALREADY_CLOSED':
      return 'Tento řádek už někdo uzavřel. Obnovte seznam.';
    case 'ALREADY_UNDONE':
      return 'Uzavření už bylo vzato zpět. Obnovte seznam.';
    case 'ALREADY_HAS_RESULT':
      return 'Návštěva už má výsledek, označit ji jako nedopadlo nejde. Obnovte seznam.';
    case 'ALREADY_NEDOPADLO':
      return 'Zakázka už je ve stavu nedopadlo. Obnovte seznam.';
    case 'ORDER_NOT_IN_SURVEY':
      return 'Zakázka už není ve stavu zaměření (kancelář ji mezitím posunula), označit ji jako nedopadlo z dashboardu nejde. Obnovte seznam.';
    case 'NOT_IN_SCOPE':
      return 'Tento zákazník ani zakázka nespadá do dashboardu (žádná návštěva od začátku provozu), hovory se nezobrazí.';
    case 'RATE_LIMITED':
      return 'Příliš mnoho dotazů za minutu (nejvýše 60). Chvíli počkejte a zkuste to znovu.';
    case 'INVALID_REGION':
      return 'Neplatný kraj: QR lze nastavit jen pro jeden ze 14 krajů.';
    case 'EVENT_CANCELLED':
      return 'Událost je zrušená.';
    case 'NO_ORDER':
      return 'Událost nemá zakázku, v ERP se nedá nic zapsat.';
    case 'NOT_CLOSED':
      return 'Návštěva není uzavřená, otevírat k opravě není co. Obnovte seznam.';
    case 'ALREADY_OPEN':
      return 'Návštěva už je otevřená k opravě. Obnovte seznam.';
    case 'INVOICE_CHECK_OFF':
      return 'Kontrola faktur není zapnutá, fakturu nejde uzavřít jako „v pořádku“. Zvolte jiný důvod.';
    case 'INVOICE_NOT_PAID':
      return 'Fakturační služba hlásí fakturu jako neuhrazenou, jako „v pořádku“ ji uzavřít nejde.';
    case 'INVOICE_CHECK_UNAVAILABLE':
      return 'Fakturační služba neodpovídá, fakturu teď nejde ověřit. Zkuste to později.';
    case 'ORDER_LOCKED':
      return `Zakázku právě upravuje někdo jiný (je zamčená).${own ? ` ${own}` : ''}`;
    case 'EVENT_NOT_FOUND':
    case 'ORDER_NOT_FOUND':
    case 'RESOLUTION_NOT_FOUND':
    case 'SUBMISSION_NOT_FOUND':
    case 'TARGET_NOT_FOUND':
      return own ?? 'Záznam nebyl nalezen (nebo už neexistuje).';
    case 'ERP_UNAVAILABLE':
      return `ERP je dočasně nedostupné, nic se nezapsalo.${own ? ` ${own}` : ''}`;
    default:
      break;
  }
  if (e.code && ERP_REFUSALS.has(e.code)) {
    const steps = stepLines(e.body);
    return `${own && /^ERP/.test(own) ? '' : 'ERP zápis odmítlo'}${own ? (/^ERP/.test(own) ? own : `: ${own}`) : '.'}${steps.length ? ` (${steps.join('; ')})` : ''}${typeof e.body.ref === 'string' ? ` [${e.body.ref}]` : ''}`;
  }
  return own ?? fallback;
}

/** True for failures that mean "sign in again" (the client wrapper already tried one silent renewal). */
export function isAuthError(e: unknown): boolean {
  return e instanceof TlApiError && (e.code === 'UNAUTHORIZED' || (e.status === 401 && e.code !== 'TOKEN_RENEW'));
}
