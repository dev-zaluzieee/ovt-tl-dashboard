/**
 * Parsers of the backend's answers. Strict on what the screens dereference (a wrong shape throws `TlShapeError` naming
 * the field, so a changed backend shows as one clear message instead of a blank page), tolerant of extra fields.
 * No imports besides types, so the contract check can run them on recorded fixtures.
 */

import type {
  ActionResult,
  CallsOrder,
  CustomerPhones,
  EventView,
  Meta,
  MissingRow,
  MontazClaimRow,
  MvtDay,
  MvtDoplatek,
  MvtMissing,
  MvtMontazClaims,
  MvtOverview,
  MvtReopens,
  MvtRescues,
  OvtDay,
  OvtProblems,
  OvtResults,
  Person,
  Resolution,
  SubmissionDetail,
  SubmissionList,
} from './types';
import type { ReviewQrData, PromptsData } from '@/app/components/review-qr/types';

export class TlShapeError extends Error {
  where: string;
  constructor(where: string, what: string) {
    super(`Neočekávaný tvar odpovědi serveru (${where}: ${what}).`);
    this.name = 'TlShapeError';
    this.where = where;
  }
}

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TlShapeError(where, 'očekáván objekt');
  return v as Obj;
}
function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new TlShapeError(where, 'očekáváno pole');
  return v;
}
function str(o: Obj, k: string, where: string): string {
  if (typeof o[k] !== 'string') throw new TlShapeError(`${where}.${k}`, 'očekáván text');
  return o[k] as string;
}
function num(o: Obj, k: string, where: string): number {
  if (typeof o[k] !== 'number' || !Number.isFinite(o[k] as number)) throw new TlShapeError(`${where}.${k}`, 'očekáváno číslo');
  return o[k] as number;
}
function bool(o: Obj, k: string, where: string): boolean {
  if (typeof o[k] !== 'boolean') throw new TlShapeError(`${where}.${k}`, 'očekáváno ano/ne');
  return o[k] as boolean;
}
function record(v: unknown, where: string): Record<string, string> {
  const o = obj(v, where);
  for (const [k, x] of Object.entries(o)) if (typeof x !== 'string') throw new TlShapeError(`${where}.${k}`, 'očekáván text');
  return o as Record<string, string>;
}
function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Obj)) if (typeof x === 'number') out[k] = x;
  return out;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function list<T>(v: unknown, where: string, each: (x: unknown, w: string) => T): T[] {
  return arr(v, where).map((x, i) => each(x, `${where}[${i}]`));
}

export function parseEventView(v: unknown, where = 'event'): EventView {
  const o = obj(v, where);
  str(o, 'type', where);
  str(o, 'startsAt', where);
  str(o, 'day', where);
  num(o, 'id', where);
  const state = obj(o.state, `${where}.state`);
  str(state, 'code', `${where}.state`);
  str(state, 'label', `${where}.state`);
  bool(state, 'closed', `${where}.state`);
  bool(state, 'open', `${where}.state`);
  arr(o.people, `${where}.people`).forEach((p, i) => {
    const po = obj(p, `${where}.people[${i}]`);
    num(po, 'id', `${where}.people[${i}]`);
    str(po, 'name', `${where}.people[${i}]`);
  });
  if (o.claim !== null && o.claim !== undefined) { const c = obj(o.claim, `${where}.claim`); num(c, 'id', `${where}.claim`); }
  if (o.link !== null && o.link !== undefined) { const l = obj(o.link, `${where}.link`); str(l, 'code', `${where}.link`); str(l, 'label', `${where}.link`); }
  return {
    typeLabel: typeof o.typeLabel === 'string' ? o.typeLabel : String(o.type),
    title: null,
    endsAt: null,
    origin: null,
    status: 'scheduled',
    orderId: null,
    complaintId: null,
    customer: null,
    orderStatus: null,
    orderStatusLabel: null,
    b2b: null,
    result: null,
    reopen: null,
    tabletDraft: false,
    app: null,
    claim: null,
    amountDue: null,
    link: null,
    ...o,
  } as unknown as EventView;
}

export function parseMeta(v: unknown): Meta {
  const o = obj(v, 'meta');
  const user = obj(o.user, 'meta.user');
  str(user, 'email', 'meta.user');
  str(o, 'today', 'meta');
  str(o, 'now', 'meta');
  const voc = obj(o.vocabulary, 'meta.vocabulary');
  for (const k of ['states', 'ovtProblemKinds', 'ovtCloseReasons', 'mvtMissingCloseReasons', 'doplatekReasons', 'nedopadloReasons', 'stepNames']) record(voc[k], `meta.vocabulary.${k}`);
  return {
    ...(o as unknown as Meta),
    erpWebBaseUrl: typeof o.erpWebBaseUrl === 'string' ? o.erpWebBaseUrl : null,
    vocabulary: { ...(voc as unknown as Meta['vocabulary']), quietStates: strArr(voc.quietStates) },
  };
}

export function parsePeople(v: unknown): Person[] {
  return list(obj(v, 'people').people, 'people', (x, w) => {
    const o = obj(x, w);
    return { id: num(o, 'id', w), name: str(o, 'name', w), active: o.active !== false };
  });
}

function parseGroups(v: unknown, where: string) {
  return list(v, where, (g, w) => {
    const o = obj(g, w);
    const person = o.person === null || o.person === undefined ? null : (() => {
      const p = obj(o.person, `${w}.person`);
      return { id: num(p, 'id', `${w}.person`), name: str(p, 'name', `${w}.person`) };
    })();
    return { person, events: list(o.events, `${w}.events`, parseEventView) };
  });
}

export function parseOvtDay(v: unknown): OvtDay {
  const o = obj(v, 'ovtDay');
  const tiles = obj(o.tiles, 'ovtDay.tiles');
  return {
    date: str(o, 'date', 'ovtDay'),
    now: str(o, 'now', 'ovtDay'),
    today: str(o, 'today', 'ovtDay'),
    events: list(o.events, 'ovtDay.events', parseEventView),
    groups: parseGroups(o.groups, 'ovtDay.groups'),
    tiles: { people: num(tiles, 'people', 'ovtDay.tiles'), events: num(tiles, 'events', 'ovtDay.tiles'), closed: num(tiles, 'closed', 'ovtDay.tiles') },
    truncated: o.truncated === true,
    qIgnored: o.qIgnored === true,
  };
}

export function parseMvtDay(v: unknown): MvtDay {
  const o = obj(v, 'mvtDay');
  const tiles = obj(o.tiles, 'mvtDay.tiles');
  return {
    date: str(o, 'date', 'mvtDay'),
    now: str(o, 'now', 'mvtDay'),
    today: str(o, 'today', 'mvtDay'),
    events: list(o.events, 'mvtDay.events', parseEventView),
    groups: parseGroups(o.groups, 'mvtDay.groups'),
    stateCounts: counts(o.stateCounts),
    quietStates: strArr(o.quietStates),
    tiles: { events: num(tiles, 'events', 'mvtDay.tiles'), closed: num(tiles, 'closed', 'mvtDay.tiles'), open: num(tiles, 'open', 'mvtDay.tiles') },
    warnings: strArr(o.warnings),
    truncated: o.truncated === true,
    qIgnored: o.qIgnored === true,
  };
}

export function parseResolution(v: unknown, where = 'resolution'): Resolution {
  const o = obj(v, where);
  num(o, 'id', where);
  str(o, 'kind', where);
  str(o, 'itemKey', where);
  str(o, 'reason', where);
  str(o, 'createdAt', where);
  return { note: null, actorEmail: '', actorName: null, undoneAt: null, undoneBy: null, erpWrittenAt: null, erpWriteNote: null, ...o } as unknown as Resolution;
}

function parseProblemRow(v: unknown, where: string) {
  const o = obj(v, where);
  str(o, 'key', where);
  str(o, 'kind', where);
  str(o, 'kindLabel', where);
  return {
    at: null, eventId: null, orderId: null, eventType: null, customer: null, owner: null, endsAt: null, reason: null, reasonLabel: null, note: null, subState: null,
    ageWorkingDays: null, valueSDph: null, b2b: null, orderStatus: null, orderStatusLabel: null, severity: 0,
    ...o,
    resolution: o.resolution ? parseResolution(o.resolution, `${where}.resolution`) : null,
  } as unknown as OvtProblems['rows'][number];
}

export function parseProblems(v: unknown): OvtProblems {
  const o = obj(v, 'problems');
  return {
    rows: list(o.rows, 'problems.rows', parseProblemRow),
    counts: counts(o.counts),
    closedCount: typeof o.closedCount === 'number' ? o.closedCount : 0,
    truncated: o.truncated === true,
    warnings: strArr(o.warnings),
    qIgnored: o.qIgnored === true,
    maxRangeDays: typeof o.maxRangeDays === 'number' ? o.maxRangeDays : 92,
    today: str(o, 'today', 'problems'),
    now: str(o, 'now', 'problems'),
  };
}

export function parseResults(v: unknown): OvtResults {
  const o = obj(v, 'results');
  return {
    from: str(o, 'from', 'results'),
    to: str(o, 'to', 'results'),
    total: num(o, 'total', 'results'),
    rows: list(o.rows, 'results.rows', (x, w) => {
      const r = obj(x, w);
      const person = r.person === null || r.person === undefined ? null : { id: num(obj(r.person, `${w}.person`), 'id', `${w}.person`), name: str(obj(r.person, `${w}.person`), 'name', `${w}.person`) };
      num(r, 'total', w);
      return { person, total: r.total as number, buckets: counts(r.buckets), nedopadloReasons: Array.isArray(r.nedopadloReasons) ? (r.nedopadloReasons as OvtResults['rows'][number]['nedopadloReasons']) : [] };
    }),
    totals: counts(o.totals),
    bucketLabels: record(o.bucketLabels, 'results.bucketLabels'),
    note: typeof o.note === 'string' ? o.note : null,
  };
}

export function parseVisits(v: unknown): { visits: EventView[]; truncated: boolean; bucketLabel: string | null } {
  const o = obj(v, 'visits');
  return { visits: list(o.visits, 'visits.visits', parseEventView), truncated: o.truncated === true, bucketLabel: typeof o.bucketLabel === 'string' ? o.bucketLabel : null };
}

function parseMissingRow(v: unknown, where: string): MissingRow {
  const o = obj(v, where);
  return { event: parseEventView(o.event, `${where}.event`), ageDays: typeof o.ageDays === 'number' ? o.ageDays : 0, resolution: o.resolution ? parseResolution(o.resolution) : null };
}

function owing(v: unknown, where: string) {
  return list(v, where, (x, w) => {
    const o = obj(x, w);
    const person = o.person === null || o.person === undefined ? null : { id: num(obj(o.person, `${w}.person`), 'id', `${w}.person`), name: str(obj(o.person, `${w}.person`), 'name', `${w}.person`) };
    return { person, count: num(o, 'count', w) };
  });
}

export function parseMissing(v: unknown): MvtMissing {
  const o = obj(v, 'missing');
  const outside = obj(o.closedOutside, 'missing.closedOutside');
  return {
    from: str(o, 'from', 'missing'),
    to: str(o, 'to', 'missing'),
    owing: owing(o.owing, 'missing.owing'),
    recent: list(o.recent, 'missing.recent', parseMissingRow),
    backlog: list(o.backlog, 'missing.backlog', parseMissingRow),
    closedOutside: { count: num(outside, 'count', 'missing.closedOutside'), rows: list(outside.rows, 'missing.closedOutside.rows', parseMissingRow) },
    handledCount: typeof o.handledCount === 'number' ? o.handledCount : 0,
    thresholds: { graceHours: 2, recentDays: 7, ...((o.thresholds as object) ?? {}) },
    closeReasons: record(o.closeReasons, 'missing.closeReasons'),
    warnings: strArr(o.warnings),
    truncated: o.truncated === true,
  };
}

function parseChange(v: unknown, where: string) {
  const o = obj(v, where);
  const val = (x: unknown) => (typeof x === 'string' || typeof x === 'number' ? x : null);
  return { field: str(o, 'field', where), label: str(o, 'label', where), before: val(o.before), after: val(o.after) };
}

function parseReopenRow(v: unknown, where: string) {
  const o = obj(v, where);
  num(o, 'id', where);
  str(o, 'at', where);
  return { reason: null, reopenedBy: null, stillOpen: false, before: null, after: null, ...o, changes: list(o.changes ?? [], `${where}.changes`, parseChange), event: parseEventView(o.event, `${where}.event`) } as unknown as MvtReopens['rows'][number];
}

export function parseReopens(v: unknown): MvtReopens {
  const o = obj(v, 'reopens');
  return { rows: list(o.rows, 'reopens.rows', parseReopenRow), openCount: typeof o.openCount === 'number' ? o.openCount : 0, truncated: o.truncated === true };
}

function parseDoplatekRow(v: unknown, where: string) {
  const o = obj(v, where);
  str(o, 'severity', where);
  str(o, 'severityLabel', where);
  return {
    expected: null, collected: null, method: null, methodLabel: null, discount: null, difference: null, invoice: false, invoiceCheck: null, sediDoplatek: null, source: '', orderCreatedAt: null,
    ...o,
    event: parseEventView(o.event, `${where}.event`),
    resolution: o.resolution ? parseResolution(o.resolution) : null,
  } as unknown as MvtDoplatek['rows'][number];
}

export function parseDoplatek(v: unknown): MvtDoplatek {
  const o = obj(v, 'doplatek');
  return {
    rows: list(o.rows, 'doplatek.rows', parseDoplatekRow),
    counts: counts(o.counts),
    openCount: typeof o.openCount === 'number' ? o.openCount : 0,
    severityLabels: record(o.severityLabels, 'doplatek.severityLabels'),
    reasons: record(o.reasons, 'doplatek.reasons'),
    invoiceCheckEnabled: o.invoiceCheckEnabled === true,
    warnings: strArr(o.warnings),
    truncated: o.truncated === true,
  };
}

export function parseRescues(v: unknown): MvtRescues {
  const o = obj(v, 'rescues');
  const s = obj(o.summary, 'rescues.summary');
  return {
    rows: list(o.rows, 'rescues.rows', (x, w) => {
      const r = obj(x, w);
      return { rescueNote: null, discount: null, discountNote: null, collected: null, closedAt: null, laterClaim: null, heldDays: null, held: false, ...r, event: parseEventView(r.event, `${w}.event`) } as unknown as MvtRescues['rows'][number];
    }),
    qIgnored: o.qIgnored === true,
    summary: { count: num(s, 'count', 'rescues.summary'), claimed: num(s, 'claimed', 'rescues.summary'), totalDiscount: typeof s.totalDiscount === 'number' ? s.totalDiscount : 0, medianDaysToClaim: typeof s.medianDaysToClaim === 'number' ? s.medianDaysToClaim : null },
    truncated: o.truncated === true,
  };
}

export function parseMontazClaims(v: unknown): MvtMontazClaims {
  const o = obj(v, 'montazClaims');
  return {
    rows: list(o.rows, 'montazClaims.rows', (x, w): MontazClaimRow => {
      const r = obj(x, w);
      str(r, 'state', w);
      str(r, 'stateLabel', w);
      return { reason: null, reasonLabel: null, note: null, ageDays: null, claim: null, followUp: null, ...r, event: parseEventView(r.event, `${w}.event`) } as unknown as MontazClaimRow;
    }),
    counts: counts(o.counts),
    stateLabels: record(o.stateLabels, 'montazClaims.stateLabels'),
    truncated: o.truncated === true,
  };
}

function parseSubmissionRow(v: unknown, where: string) {
  const o = obj(v, where);
  num(o, 'id', where);
  num(o, 'eventId', where);
  str(o, 'status', where);
  str(o, 'createdAt', where);
  return { erpOrderId: null, fitterName: null, outcome: null, statusLabel: String(o.status), completedAt: null, stepCount: 0, failedSteps: 0, warningCount: 0, collected: null, method: null, methodLabel: null, outcomeLabel: null, ...o } as unknown as SubmissionList['rows'][number];
}

export function parseSubmissionList(v: unknown): SubmissionList {
  const o = obj(v, 'submissions');
  return { rows: list(o.rows, 'submissions.rows', parseSubmissionRow), total: num(o, 'total', 'submissions'), page: num(o, 'page', 'submissions'), perPage: num(o, 'perPage', 'submissions'), statusLabels: record(o.statusLabels, 'submissions.statusLabels') };
}

export function parseSubmissionDetail(v: unknown): SubmissionDetail {
  const o = obj(v, 'submission');
  const row = parseSubmissionRow(o, 'submission');
  return {
    ...row,
    steps: list(o.steps, 'submission.steps', (x, w) => {
      const s = obj(x, w);
      str(s, 'name', w);
      str(s, 'status', w);
      return { label: String(s.name), statusLabel: String(s.status), detail: null, code: null, ...s } as unknown as SubmissionDetail['steps'][number];
    }),
    warnings: strArr(o.warnings),
    input: o.input && typeof o.input === 'object' ? (o.input as Record<string, unknown>) : null,
    inputFields: list(o.inputFields ?? [], 'submission.inputFields', (x, w) => { const f = obj(x, w); return { key: str(f, 'key', w), label: str(f, 'label', w), value: f.value }; }),
    uploads: Array.isArray(o.uploads) ? (o.uploads as Array<Record<string, unknown>>) : [],
  };
}

export function parseOverview(v: unknown): MvtOverview {
  const o = obj(v, 'overview');
  const block = (k: string) => obj(o[k], `overview.${k}`);
  const missing = block('missing');
  const reopened = block('reopened');
  const doplatek = block('doplatek');
  const claims = block('claims');
  const sp = block('submissionProblems');
  return {
    missing: { count: num(missing, 'count', 'overview.missing'), recent: typeof missing.recent === 'number' ? missing.recent : 0, backlog: typeof missing.backlog === 'number' ? missing.backlog : 0, owing: owing(missing.owing, 'overview.missing.owing'), top: list(missing.top, 'overview.missing.top', parseMissingRow) },
    reopened: { count: num(reopened, 'count', 'overview.reopened'), top: list(reopened.top, 'overview.reopened.top', parseEventView) },
    doplatek: { count: num(doplatek, 'count', 'overview.doplatek'), counts: counts(doplatek.counts), top: list(doplatek.top, 'overview.doplatek.top', parseDoplatekRow) },
    claims: {
      count: num(claims, 'count', 'overview.claims'),
      counts: counts(claims.counts),
      top: list(claims.top, 'overview.claims.top', (x, w) => {
        const r = obj(x, w);
        return { reason: null, reasonLabel: null, note: null, ageDays: null, claim: null, followUp: null, state: '', stateLabel: '', ...r, event: parseEventView(r.event, `${w}.event`) } as unknown as MontazClaimRow;
      }),
    },
    submissionProblems: { count: num(sp, 'count', 'overview.submissionProblems'), pending: sp.pending === true },
    today: str(o, 'today', 'overview'),
  };
}

const OUTCOMES = ['done', 'partial', 'failed', 'dry'];
const STEP_STATUSES = ['ok', 'failed', 'dry', 'pending'];

/** Answer of every write that touches the ERP: `{ outcome, steps, ref, ... }`. A failure is in the body (HTTP 200). */
export function parseAction<T extends object = object>(v: unknown, where = 'action'): ActionResult & T {
  const o = obj(v, where);
  const outcome = str(o, 'outcome', where);
  if (!OUTCOMES.includes(outcome)) throw new TlShapeError(`${where}.outcome`, `neznámá hodnota ${outcome}`);
  const steps = list(o.steps, `${where}.steps`, (x, w) => {
    const s = obj(x, w);
    const st = str(s, 'status', w);
    if (!STEP_STATUSES.includes(st)) throw new TlShapeError(`${w}.status`, `neznámá hodnota ${st}`);
    return { label: String(s.name), detail: null, code: null, ...s } as unknown as ActionResult['steps'][number];
  });
  return { ...(o as object), outcome: outcome as ActionResult['outcome'], steps, ref: typeof o.ref === 'string' ? o.ref : null } as ActionResult & T;
}

export function parseCallsOrders(v: unknown): CallsOrder[] {
  return list(obj(v, 'callsLookup').orders, 'callsLookup.orders', (x, w) => {
    const o = obj(x, w);
    num(o, 'orderId', w);
    return {
      customerId: null, customerName: null, statusLabel: null, owner: null, lastVisitAt: null,
      ...o,
      phones: list(Array.isArray(o.phones) ? o.phones : [], `${w}.phones`, (p, pw) => {
        const po = obj(p, pw);
        return { phone: str(po, 'phone', pw), key: str(po, 'key', pw), source: po.source === 'customer' ? 'customer' : 'order' };
      }),
    } as unknown as CallsOrder;
  });
}

export function parseCustomerPhones(v: unknown): CustomerPhones {
  const o = obj(v, 'customerPhones');
  return {
    customerId: typeof o.customerId === 'number' ? o.customerId : null,
    customerName: typeof o.customerName === 'string' ? o.customerName : null,
    phones: list(o.phones, 'customerPhones.phones', (p, pw) => {
      const po = obj(p, pw);
      return { phone: str(po, 'phone', pw), key: str(po, 'key', pw), source: po.source === 'customer' ? 'customer' : 'order' };
    }),
    orders: list(o.orders, 'customerPhones.orders', (x, w) => {
      const r = obj(x, w);
      return { orderId: num(r, 'orderId', w), statusLabel: typeof r.statusLabel === 'string' ? r.statusLabel : null };
    }),
  };
}

export function parseReviewQr(v: unknown): ReviewQrData {
  const o = obj(v, 'reviewQr');
  const settings = obj(o.settings, 'reviewQr.settings');
  bool(settings, 'enabled', 'reviewQr.settings');
  return {
    settings: settings as unknown as ReviewQrData['settings'],
    targets: list(o.targets, 'reviewQr.targets', (t, w) => { const to = obj(t, w); num(to, 'id', w); str(to, 'label', w); str(to, 'url', w); bool(to, 'active', w); return to as unknown as ReviewQrData['targets'][number]; }),
    regions: list(o.regions, 'reviewQr.regions', (r, rw) => {
      const ro = obj(r, rw);
      str(ro, 'key', rw);
      return { known: ro.known !== false, config: ro.config ?? null, ...ro, ovts: list(ro.ovts, `${rw}.ovts`, (ov, ow) => { const oo = obj(ov, ow); num(oo, 'userId', ow); str(oo, 'name', ow); return { surveys: 0, lastSurveyAt: null, kraj: null, email: null, ...oo } as unknown as ReviewQrData['regions'][number]['ovts'][number]; }) } as unknown as ReviewQrData['regions'][number];
    }),
    outsideRegions: regionList2(o.outsideRegions),
    activeDays: typeof o.activeDays === 'number' ? o.activeDays : 60,
    krajSource: typeof o.krajSource === 'string' ? o.krajSource : null,
  };
}

function regionList2(x: unknown): ReviewQrData['outsideRegions'] {
  if (!Array.isArray(x)) return [];
  return x.map((ov, i) => { const oo = obj(ov, `reviewQr.outsideRegions[${i}]`); num(oo, 'userId', `reviewQr.outsideRegions[${i}]`); return { surveys: 0, lastSurveyAt: null, kraj: null, email: null, ...oo } as unknown as ReviewQrData['outsideRegions'][number]; });
}

export function parsePrompts(v: unknown): PromptsData {
  const o = obj(v, 'prompts');
  const stats = (x: unknown, w: string) => list(x ?? [], w, (s, sw) => { const so = obj(s, sw); return { shown: 0, written: 0, not_shown: 0, refused: 0, unanswered: 0, ...so } as unknown as PromptsData['statsByOvt'][number]; });
  return {
    days: typeof o.days === 'number' ? o.days : 30,
    prompts: list(o.prompts, 'prompts.prompts', (p, w) => { const po = obj(p, w); num(po, 'id', w); str(po, 'shownAt', w); return po as unknown as PromptsData['prompts'][number]; }),
    statsByOvt: stats(o.statsByOvt, 'prompts.statsByOvt'),
    statsByRegion: stats(o.statsByRegion, 'prompts.statsByRegion'),
  };
}
