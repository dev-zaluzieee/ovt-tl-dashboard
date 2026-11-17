/**
 * Hotovost (cash) of the team leader dashboard: types of the finance backend's `/api/tl/cash/*` answers (F14 section 2),
 * strict parsers, and the pure helpers of the two screens (filter, sort, totals, labels). No Next imports: the contract
 * check runs this file on the finance fixtures.
 *
 * The key lists below are what the screens read. The contract check compares them with the finance fixtures in both
 * directions, so a field the backend adds or drops shows up as a failing check, not as a blank cell.
 */

import { TlShapeError } from './tl-parse';

export type CashRole = 'ovt' | 'mvt';
export type RoleFilter = 'all' | CashRole;

/** One row of `GET /persons`. Amounts are decimal strings (`"3200.00"`), `"0"` is possible. */
export interface CashPerson {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  active: boolean;
  balance_czk: string;
  entry_count: number;
  last_entry_at: string | null;
  overdue_czk: string;
  held_since: string | null;
  inventura_at: string | null;
  raynet_user_id: number | null;
  erp_user_id: number | null;
  erp_user_ids: number[];
  missing_proof_count: number;
}

/** `person` of `GET /persons/:id`: the same row without the ERP mapping and the missing-proof count. */
export type CashPersonHead = Omit<CashPerson, 'raynet_user_id' | 'erp_user_id' | 'erp_user_ids' | 'missing_proof_count'>;

export interface CashAttachment {
  id: number;
  filename: string;
}

export type ReconStatus = 'pending' | 'reconciled' | 'discrepancy';

export interface CashEntry {
  id: number;
  person_id: number;
  entry_type: string;
  amount_czk: string;
  happened_at: string;
  note: string | null;
  source: string;
  source_order_id: number | null;
  raynet_event_id: number | null;
  erp_order_id: number | null;
  order_ref: number | null;
  raynet_export_status: string | null;
  erp_export_status: string | null;
  customer_name: string | null;
  created_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  recon_status: ReconStatus | null;
  expense_category: string | null;
  deposit_channel: 'bank_card' | 'post' | null;
  declared_variable_symbol: string | null;
  declared_gross_czk: string | null;
  fee_czk: string | null;
  fee_deducted: boolean | null;
  related_entry_id: number | null;
  accounting_note: string | null;
  accounting_note_by: string | null;
  accounting_note_at: string | null;
  attachments: CashAttachment[];
}

export interface ErpSync {
  refreshed: boolean;
  stale: boolean;
  dataAgeMinutes: number | null;
  lastSyncAt: string | null;
  reason: string | null;
  message: string | null;
}

export interface CashSummary {
  activated: boolean;
  balanceCzk: number | null;
  inventuraAt: string | null;
  pendingDepositsCzk: number;
  discrepancyDepositsCzk: number;
  overdueCzk: number | null;
  heldSince: string | null;
  defaultSpecificSymbol: string | null;
  ovtCode: string | null;
  depositVsPrefix: string | null;
}

export interface MissingProofRow {
  id: number;
  person_id: number;
  happened_at: string;
  amount_czk: string;
  deposit_channel: 'bank_card' | 'post' | null;
  declared_specific_symbol: string | null;
  note: string | null;
  source: string;
}

export interface CashPersonDetail {
  person: CashPersonHead;
  entries: CashEntry[];
  erpSync: ErpSync;
  summary: CashSummary;
  missingProof: { count: number; entries: MissingProofRow[] };
}

export const CASH_PERSON_HEAD_KEYS = ['id', 'email', 'display_name', 'role', 'active', 'balance_czk', 'entry_count', 'last_entry_at', 'overdue_czk', 'held_since', 'inventura_at'] as const;
export const CASH_PERSON_KEYS = [...CASH_PERSON_HEAD_KEYS, 'raynet_user_id', 'erp_user_id', 'erp_user_ids', 'missing_proof_count'] as const;
export const CASH_ENTRY_KEYS = [
  'id', 'person_id', 'entry_type', 'amount_czk', 'happened_at', 'note', 'source', 'source_order_id', 'raynet_event_id', 'erp_order_id', 'order_ref',
  'raynet_export_status', 'erp_export_status', 'customer_name', 'created_by', 'voided_at', 'voided_by', 'void_reason', 'recon_status', 'expense_category',
  'deposit_channel', 'declared_variable_symbol', 'declared_gross_czk', 'fee_czk', 'fee_deducted', 'related_entry_id', 'accounting_note', 'accounting_note_by',
  'accounting_note_at', 'attachments',
] as const;
export const CASH_SUMMARY_KEYS = ['activated', 'balanceCzk', 'inventuraAt', 'pendingDepositsCzk', 'discrepancyDepositsCzk', 'overdueCzk', 'heldSince', 'defaultSpecificSymbol', 'ovtCode', 'depositVsPrefix'] as const;
export const CASH_MISSING_PROOF_KEYS = ['id', 'person_id', 'happened_at', 'amount_czk', 'deposit_channel', 'declared_specific_symbol', 'note', 'source'] as const;

// ---- parsers ------------------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TlShapeError(where, 'očekáván objekt');
  return v as Obj;
}
function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new TlShapeError(where, 'očekáváno pole');
  return v;
}
function reqStr(o: Obj, k: string, where: string): string {
  if (typeof o[k] !== 'string') throw new TlShapeError(`${where}.${k}`, 'očekáván text');
  return o[k] as string;
}
function reqInt(o: Obj, k: string, where: string): number {
  if (typeof o[k] !== 'number' || !Number.isFinite(o[k] as number)) throw new TlShapeError(`${where}.${k}`, 'očekáváno číslo');
  return o[k] as number;
}
function reqBool(o: Obj, k: string, where: string): boolean {
  if (typeof o[k] !== 'boolean') throw new TlShapeError(`${where}.${k}`, 'očekáváno ano/ne');
  return o[k] as boolean;
}
/** Decimal string of an amount (`"3200.00"`, `"0"`); a plain number is tolerated and turned into text. */
function reqMoney(o: Obj, k: string, where: string): string {
  const v = o[k];
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return v;
  throw new TlShapeError(`${where}.${k}`, 'očekávána částka');
}
function optStr(o: Obj, k: string, where: string): string | null {
  const v = o[k];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new TlShapeError(`${where}.${k}`, 'očekáván text nebo null');
  return v;
}
function optInt(o: Obj, k: string, where: string): number | null {
  const v = o[k];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TlShapeError(`${where}.${k}`, 'očekáváno číslo nebo null');
  return v;
}
function optMoney(o: Obj, k: string, where: string): string | null {
  return o[k] === null || o[k] === undefined ? null : reqMoney(o, k, where);
}
function optNum(o: Obj, k: string, where: string): number | null {
  const v = o[k];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TlShapeError(`${where}.${k}`, 'očekáváno číslo nebo null');
  return v;
}
function channel(o: Obj, k: string, where: string): 'bank_card' | 'post' | null {
  const v = o[k];
  if (v === null || v === undefined) return null;
  if (v === 'bank_card' || v === 'post') return v;
  throw new TlShapeError(`${where}.${k}`, 'neznámý kanál vkladu');
}

function parseHead(o: Obj, where: string): CashPersonHead {
  return {
    id: reqInt(o, 'id', where),
    email: reqStr(o, 'email', where),
    display_name: optStr(o, 'display_name', where),
    role: reqStr(o, 'role', where),
    active: reqBool(o, 'active', where),
    balance_czk: reqMoney(o, 'balance_czk', where),
    entry_count: reqInt(o, 'entry_count', where),
    last_entry_at: optStr(o, 'last_entry_at', where),
    overdue_czk: reqMoney(o, 'overdue_czk', where),
    held_since: optStr(o, 'held_since', where),
    inventura_at: optStr(o, 'inventura_at', where),
  };
}

export function parseCashPersons(v: unknown): CashPerson[] {
  const o = obj(v, 'hotovost');
  return arr(o.persons, 'hotovost.persons').map((p, i) => {
    const where = `hotovost.persons[${i}]`;
    const po = obj(p, where);
    return {
      ...parseHead(po, where),
      raynet_user_id: optInt(po, 'raynet_user_id', where),
      erp_user_id: optInt(po, 'erp_user_id', where),
      erp_user_ids: arr(po.erp_user_ids ?? [], `${where}.erp_user_ids`).filter((x): x is number => typeof x === 'number'),
      missing_proof_count: typeof po.missing_proof_count === 'number' ? po.missing_proof_count : 0,
    };
  });
}

export function parseCashEntry(v: unknown, where = 'entry'): CashEntry {
  const o = obj(v, where);
  const recon = o.recon_status;
  if (recon !== null && recon !== undefined && recon !== 'pending' && recon !== 'reconciled' && recon !== 'discrepancy') throw new TlShapeError(`${where}.recon_status`, 'neznámý stav párování');
  return {
    id: reqInt(o, 'id', where),
    person_id: reqInt(o, 'person_id', where),
    entry_type: reqStr(o, 'entry_type', where),
    amount_czk: reqMoney(o, 'amount_czk', where),
    happened_at: reqStr(o, 'happened_at', where),
    note: optStr(o, 'note', where),
    source: reqStr(o, 'source', where),
    source_order_id: optInt(o, 'source_order_id', where),
    raynet_event_id: optInt(o, 'raynet_event_id', where),
    erp_order_id: optInt(o, 'erp_order_id', where),
    order_ref: optInt(o, 'order_ref', where),
    raynet_export_status: optStr(o, 'raynet_export_status', where),
    erp_export_status: optStr(o, 'erp_export_status', where),
    customer_name: optStr(o, 'customer_name', where),
    created_by: optStr(o, 'created_by', where),
    voided_at: optStr(o, 'voided_at', where),
    voided_by: optStr(o, 'voided_by', where),
    void_reason: optStr(o, 'void_reason', where),
    recon_status: (recon ?? null) as ReconStatus | null,
    expense_category: optStr(o, 'expense_category', where),
    deposit_channel: channel(o, 'deposit_channel', where),
    declared_variable_symbol: optStr(o, 'declared_variable_symbol', where),
    declared_gross_czk: optMoney(o, 'declared_gross_czk', where),
    fee_czk: optMoney(o, 'fee_czk', where),
    fee_deducted: o.fee_deducted === null || o.fee_deducted === undefined ? null : reqBool(o, 'fee_deducted', where),
    related_entry_id: optInt(o, 'related_entry_id', where),
    accounting_note: optStr(o, 'accounting_note', where),
    accounting_note_by: optStr(o, 'accounting_note_by', where),
    accounting_note_at: optStr(o, 'accounting_note_at', where),
    attachments: arr(o.attachments, `${where}.attachments`).map((a, i) => {
      const ao = obj(a, `${where}.attachments[${i}]`);
      return { id: reqInt(ao, 'id', `${where}.attachments[${i}]`), filename: reqStr(ao, 'filename', `${where}.attachments[${i}]`) };
    }),
  };
}

function parseErpSync(v: unknown): ErpSync {
  const o = obj(v, 'hotovost.erpSync');
  return {
    refreshed: reqBool(o, 'refreshed', 'hotovost.erpSync'),
    stale: reqBool(o, 'stale', 'hotovost.erpSync'),
    dataAgeMinutes: optNum(o, 'dataAgeMinutes', 'hotovost.erpSync'),
    lastSyncAt: optStr(o, 'lastSyncAt', 'hotovost.erpSync'),
    reason: optStr(o, 'reason', 'hotovost.erpSync'),
    message: optStr(o, 'message', 'hotovost.erpSync'),
  };
}

function parseSummary(v: unknown): CashSummary {
  const w = 'hotovost.summary';
  const o = obj(v, w);
  return {
    activated: reqBool(o, 'activated', w),
    balanceCzk: optNum(o, 'balanceCzk', w),
    inventuraAt: optStr(o, 'inventuraAt', w),
    pendingDepositsCzk: reqInt(o, 'pendingDepositsCzk', w),
    discrepancyDepositsCzk: reqInt(o, 'discrepancyDepositsCzk', w),
    overdueCzk: optNum(o, 'overdueCzk', w),
    heldSince: optStr(o, 'heldSince', w),
    defaultSpecificSymbol: optStr(o, 'defaultSpecificSymbol', w),
    ovtCode: optStr(o, 'ovtCode', w),
    depositVsPrefix: optStr(o, 'depositVsPrefix', w),
  };
}

export function parseCashDetail(v: unknown): CashPersonDetail {
  const o = obj(v, 'hotovost');
  const mp = obj(o.missingProof, 'hotovost.missingProof');
  return {
    person: parseHead(obj(o.person, 'hotovost.person'), 'hotovost.person'),
    entries: arr(o.entries, 'hotovost.entries').map((e, i) => parseCashEntry(e, `hotovost.entries[${i}]`)),
    erpSync: parseErpSync(o.erpSync),
    summary: parseSummary(o.summary),
    missingProof: {
      count: reqInt(mp, 'count', 'hotovost.missingProof'),
      entries: arr(mp.entries, 'hotovost.missingProof.entries').map((r, i) => {
        const w = `hotovost.missingProof.entries[${i}]`;
        const ro = obj(r, w);
        return {
          id: reqInt(ro, 'id', w),
          person_id: reqInt(ro, 'person_id', w),
          happened_at: reqStr(ro, 'happened_at', w),
          amount_czk: reqMoney(ro, 'amount_czk', w),
          deposit_channel: channel(ro, 'deposit_channel', w),
          declared_specific_symbol: optStr(ro, 'declared_specific_symbol', w),
          note: optStr(ro, 'note', w),
          source: reqStr(ro, 'source', w),
        };
      }),
    },
  };
}

// ---- labels -------------------------------------------------------------------------------------------------------

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  opening_balance: 'Počáteční stav',
  cash_received: 'Přijatá záloha',
  bank_deposit: 'Vklad do banky',
  expense: 'Nákup / výdaj',
  inventura: 'Inventura (fyzický stav)',
};

export const SOURCE_LABELS: Record<string, string> = {
  erp_sync: 'ERP (návštěva)',
  ovt_app: 'tablet',
  mvt_app: 'aplikace montérů',
  manual: 'ručně (finance)',
  bank_api: 'banka',
};

/** Inflows +, outflows -, inventura = anchor (same rule as finance). */
export const ENTRY_SIGN: Record<string, 1 | -1> = {
  opening_balance: 1,
  cash_received: 1,
  inventura: 1,
  bank_deposit: -1,
  expense: -1,
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function personName(p: { display_name: string | null; email: string }): string {
  return (p.display_name && p.display_name.trim()) || p.email.split('@')[0] || p.email;
}

/** `Kč` text of a decimal string or a number: `3 200 Kč`. */
export function fmtCzk(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return `${new Intl.NumberFormat('cs-CZ').format(Math.round(x))} Kč`.replace(/ /g, ' ');
}

/** The ERP order a ledger row belongs to: `erp_order_id`, else the order number of the note (`order_ref`). */
export function entryOrderId(e: Pick<CashEntry, 'erp_order_id' | 'order_ref'>): number | null {
  return e.erp_order_id ?? e.order_ref ?? null;
}

/** "Zákazník / poznámka" cell of a ledger row. */
export function entryNote(e: CashEntry): string {
  const post =
    e.entry_type === 'bank_deposit' && e.deposit_channel === 'post'
      ? `${e.declared_variable_symbol ? `VS ${e.declared_variable_symbol}` : 'bez VS'}${e.declared_gross_czk && Number(e.declared_gross_czk) > 0 ? ` · předáno ${fmtCzk(e.declared_gross_czk)}` : ''}${e.fee_czk && Number(e.fee_czk) > 0 ? ` · poplatek ${fmtCzk(e.fee_czk)}` : ''}`
      : null;
  return [e.customer_name, e.expense_category && e.expense_category !== 'Other' ? e.expense_category : null, post, e.note].filter(Boolean).join(' · ');
}

export function entryTypeLabel(e: Pick<CashEntry, 'entry_type' | 'deposit_channel'>): string {
  if (e.entry_type === 'bank_deposit' && e.deposit_channel === 'post') return 'Vklad na poště';
  return ENTRY_TYPE_LABELS[e.entry_type] ?? e.entry_type;
}

/** Balance anchor = the latest valid inventura (same rule as finance). */
export function anchorAt(entries: readonly CashEntry[]): string | null {
  let best: string | null = null;
  for (const e of entries) {
    if (e.entry_type !== 'inventura' || e.voided_at) continue;
    if (!best || e.happened_at > best) best = e.happened_at;
  }
  return best;
}

/** Expenses since the anchor (all valid expenses when there is no inventura). */
export function expenseSince(entries: readonly CashEntry[], anchor: string | null): number {
  return entries.filter((e) => e.entry_type === 'expense' && !e.voided_at && (!anchor || e.happened_at >= anchor)).reduce((s, e) => s + Number(e.amount_czk), 0);
}

// ---- overview: filter, sort, totals -------------------------------------------------------------------------------

export type SortKey = 'name' | 'role' | 'balance' | 'overdue' | 'held' | 'inventura' | 'last' | 'proof' | 'count';
export type SortDir = 'asc' | 'desc';

/** Lower case without diacritics, for the search box ("Nova" finds "Nová"). */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterPersons(persons: readonly CashPerson[], f: { role: RoleFilter; q: string; onlyActive: boolean }): CashPerson[] {
  const q = normalizeText(f.q.trim());
  return persons.filter((p) => {
    if (f.role !== 'all' && p.role !== f.role) return false;
    if (f.onlyActive && !p.active) return false;
    if (q && !normalizeText(`${personName(p)} ${p.email}`).includes(q)) return false;
    return true;
  });
}

/** Missing values (never held, no inventura, no movement) always sort last, whatever the direction. */
export function sortPersons(persons: readonly CashPerson[], key: SortKey, dir: SortDir): CashPerson[] {
  const sign = dir === 'asc' ? 1 : -1;
  const text = (a: string | null, b: string | null): number => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return sign * a.localeCompare(b);
  };
  return [...persons].sort((a, b) => {
    switch (key) {
      case 'name':
        return sign * personName(a).localeCompare(personName(b), 'cs');
      case 'role':
        return sign * a.role.localeCompare(b.role) || personName(a).localeCompare(personName(b), 'cs');
      case 'balance':
        return sign * (Number(a.balance_czk) - Number(b.balance_czk));
      case 'overdue':
        return sign * (Number(a.overdue_czk) - Number(b.overdue_czk));
      case 'held': {
        // "descending" = held the longest first (the oldest date on top)
        if (a.held_since === null || b.held_since === null) return a.held_since === b.held_since ? 0 : a.held_since === null ? 1 : -1;
        return -sign * a.held_since.localeCompare(b.held_since);
      }
      case 'inventura':
        return text(a.inventura_at, b.inventura_at);
      case 'last':
        return text(a.last_entry_at, b.last_entry_at);
      case 'proof':
        return sign * (a.missing_proof_count - b.missing_proof_count);
      case 'count':
        return sign * (a.entry_count - b.entry_count);
    }
  });
}

export interface CashTotals {
  count: number;
  activated: number;
  waiting: number;
  balance: number;
  overdue: number;
  overdueCount: number;
  missingProof: number;
}

/** Stats of the overview: money counts only activated persons (those with an inventura). */
export function cashTotals(rows: readonly CashPerson[]): CashTotals {
  const activated = rows.filter((p) => p.inventura_at !== null);
  return {
    count: rows.length,
    activated: activated.length,
    waiting: rows.length - activated.length,
    balance: activated.reduce((s, p) => s + Number(p.balance_czk), 0),
    overdue: activated.reduce((s, p) => s + Number(p.overdue_czk), 0),
    overdueCount: activated.filter((p) => Number(p.overdue_czk) > 0).length,
    missingProof: rows.reduce((s, p) => s + p.missing_proof_count, 0),
  };
}

export function roleCounts(persons: readonly CashPerson[], onlyActive: boolean): Record<RoleFilter, number> {
  const base = onlyActive ? persons.filter((p) => p.active) : persons;
  return { all: base.length, ovt: base.filter((p) => p.role === 'ovt').length, mvt: base.filter((p) => p.role === 'mvt').length };
}

export function parseRoleFilter(v: string | null | undefined): RoleFilter {
  return v === 'ovt' || v === 'mvt' ? v : 'all';
}

// ---- errors of the finance door -----------------------------------------------------------------------------------

/** Codes whose Czech `message` comes from finance and is shown as it is (F14 section 3). */
export const CASH_MESSAGE_CODES: ReadonlySet<string> = new Set([
  'WRONG_CLIENT', 'FORBIDDEN_ROLE', 'SERVICE_TOKEN_NOT_ALLOWED', 'NOT_IN_ROSTER', 'AMBIGUOUS_ACCOUNT', 'AMBIGUOUS_PERSON', 'ROSTER_INACTIVE', 'PERSON_NOT_MAPPED',
  'INVALID_ID', 'PERSON_NOT_FOUND', 'ATTACHMENT_NOT_FOUND', 'STORAGE_NOT_CONFIGURED', 'NOT_CONFIGURED', 'AUTH_UNAVAILABLE', 'INTERNAL', 'WRONG_AUDIENCE', 'INVALID_TOKEN',
]);

/**
 * HTTP status the browser sees. Finance answers 401 for four reasons; only `UNAUTHORIZED` and `TOKEN_EXPIRED` mean "renew the
 * session and retry". A token that finance rejects for good (`INVALID_TOKEN`, `WRONG_AUDIENCE`) is a setup problem: passing
 * it on as 401 would send the user round the login in a loop, so it leaves as 403 with the same code and message.
 */
export function cashHttpStatus(status: number, code: string | null): number {
  if (status === 401 && code !== 'UNAUTHORIZED' && code !== 'TOKEN_EXPIRED') return 403;
  return status;
}

export const CASH_NOT_CONFIGURED_MESSAGE = 'Hotovost není nastavena.';
