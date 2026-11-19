/** Shapes of the backend (`/api/tl2`, see ceniky-2 readonly-docs L7). Labels come from the backend; the app holds none. */

export type Side = 'ovt' | 'mvt';

export interface PersonRef {
  id: number;
  name: string;
}

export interface Person extends PersonRef {
  active: boolean;
}

export interface EventPerson extends PersonRef {
  source: 'owner' | 'assignment';
}

export interface VisitState {
  code: string;
  label: string;
  closed: boolean;
  open: boolean;
}

export interface EventResult {
  outcome: string | null;
  outcomeLabel: string | null;
  reason: string | null;
  reasonLabel: string | null;
  collectedAmount: number | null;
  paymentMethod: string | null;
  paymentMethodLabel: string | null;
  discountAmount: number | null;
  discountNote: string | null;
  rescueNote: string | null;
  note: string | null;
  closedByName: string | null;
  completedAt: string | null;
  current: boolean;
  /** `legacy` = a result taken over from the old systems (printed as "přenesený výsledek"); `native` = written by the new system. */
  source: 'native' | 'legacy';
}

export interface EventView {
  id: number;
  type: string;
  typeLabel: string;
  title: string | null;
  status: string;
  origin: string | null;
  startsAt: string;
  endsAt: string | null;
  day: string;
  orderId: number | null;
  complaintId: number | null;
  customer: { name: string | null; phone: string | null; city: string | null } | null;
  orderStatus: string | null;
  orderStatusLabel: string | null;
  people: EventPerson[];
  b2b: boolean | null;
  state: VisitState;
  result: EventResult | null;
  reopen: { reason: string | null; actorName: string | null; at: string | null } | null;
  tabletDraft: boolean;
  app: { status: string; statusLabel: string | null; outcome: string | null; outcomeLabel: string | null } | null;
  claim: { id: number; status: string | null; statusLabel: string | null; druh: string | null } | null;
  amountDue: number | null;
  /** A visit taken over from the old systems: read-only here for mark nedopadlo and close-problem (the server answers 409 LEGACY_VISIT); "Otevřít k opravě" works on it like on any visit. */
  legacy: boolean;
  link: { code: 'bez_zakazky' | 'bez_reklamace' | 'servis_ze_zakazky'; label: string } | null;
  /** Day view only: the fitter's pending request to reopen this closed visit. Absent from an older backend (the parser makes it null). */
  reopenRequest: { id: number; reason: string; requestedByName: string | null; requestedAt: string } | null;
}

export interface Meta {
  user: { name: string | null; email: string; erpUserId: number };
  now: string;
  today: string;
  startAt: string | null;
  /** Start of the history scope (day views, Výsledky, Nedopadlo, Záchrany, Reklamace z montáží, search); null = same visits as the work lists. */
  historyFrom: string | null;
  testMode: boolean;
  erpWebBaseUrl: string | null;
  invoicingCheck: boolean;
  limits: { maxRangeDays: number; hardMaxRows: number; maxLookupKeys: number };
  vocabulary: {
    eventTypes: Record<string, string>;
    states: Record<string, string>;
    quietStates: string[];
    outcomes: Record<string, string>;
    montazOutcomes: Record<string, string>;
    nedopadloReasons: Record<string, string>;
    visitReasons: Record<string, string>;
    paymentMethods: Record<string, string>;
    ovtProblemKinds: Record<string, string>;
    ovtCloseReasons: Record<string, string>;
    mvtMissingCloseReasons: Record<string, string>;
    doplatekReasons: Record<string, string>;
    doplatekSeverities: Record<string, string>;
    montazClaimStates: Record<string, string>;
    submissionStatuses: Record<string, string>;
    stepStatuses: Record<string, string>;
    stepNames: Record<string, string>;
  };
}

export interface DayGroup {
  person: PersonRef | null;
  events: EventView[];
}

export interface OvtDay {
  date: string;
  now: string;
  today: string;
  events: EventView[];
  groups: DayGroup[];
  tiles: { people: number; events: number; closed: number };
  truncated: boolean;
  /** The search text was present but not applied (shorter than 3 characters). */
  qIgnored: boolean;
}

export interface MvtDay {
  date: string;
  now: string;
  today: string;
  events: EventView[];
  groups: DayGroup[];
  stateCounts: Record<string, number>;
  quietStates: string[];
  tiles: { events: number; closed: number; open: number };
  warnings: string[];
  truncated: boolean;
  qIgnored: boolean;
}

export interface Resolution {
  id: number;
  kind: string;
  itemKey: string;
  reason: string;
  note: string | null;
  actorEmail: string;
  actorName: string | null;
  createdAt: string;
  undoneAt: string | null;
  undoneBy: string | null;
  erpWrittenAt: string | null;
  erpWriteNote: string | null;
}

export interface ProblemRow {
  key: string;
  kind: string;
  kindLabel: string;
  severity: number;
  eventId: number | null;
  orderId: number | null;
  eventType: string | null;
  customer: { name: string | null; phone: string | null; city: string | null } | null;
  owner: PersonRef | null;
  /** The visit's start / the order's last change (null when the ERP has none). */
  at: string | null;
  endsAt: string | null;
  reason: string | null;
  reasonLabel: string | null;
  note: string | null;
  subState: { code: string; label: string } | null;
  ageWorkingDays: number | null;
  valueSDph: number | null;
  b2b: boolean | null;
  orderStatus: string | null;
  orderStatusLabel: string | null;
  resolution: Resolution | null;
  /** A visit taken over from the old systems: no close / mark buttons. */
  legacy: boolean;
}

export interface OvtProblems {
  rows: ProblemRow[];
  counts: Record<string, number>;
  closedCount: number;
  truncated: boolean;
  warnings: string[];
  qIgnored: boolean;
  maxRangeDays: number;
  today: string;
  now: string;
}

export interface ResultsRow {
  person: PersonRef | null;
  total: number;
  buckets: Record<string, number>;
  nedopadloReasons: Array<{ reason: string; label: string; count: number }>;
}

export interface OvtResults {
  from: string;
  to: string;
  total: number;
  rows: ResultsRow[];
  totals: Record<string, number>;
  bucketLabels: Record<string, string>;
  note: string | null;
}

export type StepStatus = 'ok' | 'failed' | 'dry' | 'pending';

export interface Step {
  name: string;
  label: string;
  status: StepStatus;
  detail: string | null;
  code: string | null;
}

export type ActionOutcome = 'done' | 'partial' | 'failed' | 'dry';

export interface ActionResult {
  outcome: ActionOutcome;
  steps: Step[];
  ref: string | null;
}

export interface MissingRow {
  event: EventView;
  ageDays: number;
  resolution: Resolution | null;
}

export interface MvtMissing {
  from: string;
  to: string;
  owing: Array<{ person: PersonRef | null; count: number }>;
  recent: MissingRow[];
  backlog: MissingRow[];
  /** Visits closed in the ERP without a result of the app: each row = the visit, its age in days and the team leader's decision (if any). */
  closedOutside: { count: number; rows: MissingRow[] };
  handledCount: number;
  thresholds: { graceHours: number; recentDays: number };
  closeReasons: Record<string, string>;
  warnings: string[];
  truncated: boolean;
}

export interface ResultSnapshot {
  outcome: string | null;
  outcomeLabel: string | null;
  reasonLabel?: string | null;
  collectedAmount: number | null;
  paymentMethod: string | null;
  paymentMethodLabel: string | null;
  discountAmount: number | null;
  closedByName: string | null;
  completedAt: string | null;
}

/** The fitter's request to reopen a closed visit, as the dashboard sees it. */
export interface ReopenRequest {
  id: number;
  eventId: number;
  /** requested (pending) | opened | declined | withdrawn | obsolete */
  status: string;
  statusLabel: string;
  reason: string;
  requestedAt: string;
  requestedByName: string | null;
  requestedByEmail: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  /** dashboard | erp | fitter | system */
  /** The admin who acted on behalf of the fitter (e.g. withdrew for him); null when absent. */
  decidedActorEmail: string | null;
  decidedVia: string | null;
  decidedViaLabel: string | null;
  erpReopenId: number | null;
}

export interface ReopenRequestRow {
  request: ReopenRequest;
  /** null when the visit is outside the history scope or gone. */
  event: EventView | null;
}

export interface MvtReopenRequests {
  rows: ReopenRequestRow[];
  openCount: number;
  /** The database part is not applied yet: no rows, not an error. */
  pending: boolean;
}

/** Deadline of a reopened visit (null on every row until the backend sets one). */
export interface ReopenExpiry {
  expiresAt: string | null;
  state: 'running' | 'due' | 'blocked' | 'auto_closed';
  blockCode: string | null;
}

export interface ReopenRow {
  id: number;
  /** Set when the visit was opened on a fitter's request. */
  requestId: number | null;
  expiry: ReopenExpiry | null;
  event: EventView;
  reason: string | null;
  reopenedBy: string | null;
  at: string;
  stillOpen: boolean;
  before: ResultSnapshot | null;
  after: ResultSnapshot | null;
  changes: ResultChange[];
}

export interface ResultChange {
  field: string;
  label: string;
  before: string | number | null;
  after: string | number | null;
}

export interface MvtReopens {
  rows: ReopenRow[];
  openCount: number;
  truncated: boolean;
}

export interface DoplatekRow {
  event: EventView;
  expected: number | null;
  collected: number | null;
  method: string | null;
  methodLabel: string | null;
  discount: number | null;
  difference: number | null;
  invoice: boolean;
  invoiceCheck: string | null;
  severity: string;
  severityLabel: string;
  sediDoplatek: string | null;
  resolution: Resolution | null;
  source: string;
  orderCreatedAt: string | null;
}

export interface MvtDoplatek {
  rows: DoplatekRow[];
  counts: Record<string, number>;
  openCount: number;
  severityLabels: Record<string, string>;
  reasons: Record<string, string>;
  invoiceCheckEnabled: boolean;
  warnings: string[];
  truncated: boolean;
}

export interface RescueRow {
  event: EventView;
  rescueNote: string | null;
  discount: number | null;
  discountNote: string | null;
  collected: number | null;
  closedAt: string | null;
  laterClaim: { id: number; status: string | null; createdAt: string | null } | null;
  heldDays: number | null;
  held: boolean;
}

export interface MvtRescues {
  rows: RescueRow[];
  summary: { count: number; claimed: number; totalDiscount: number; medianDaysToClaim: number | null };
  truncated: boolean;
  qIgnored: boolean;
}

export interface MontazClaimRow {
  event: EventView;
  state: string;
  stateLabel: string;
  reason: string | null;
  reasonLabel: string | null;
  note: string | null;
  ageDays: number | null;
  claim: { id: number; status: string | null; statusLabel: string | null; druh: string | null; uznano: string | null; resolvedOn: string | null; blocker: string | null; createdAt: string | null } | null;
  followUp: { id: number; type: string; status: string; startsAt: string } | null;
}

export interface MvtMontazClaims {
  rows: MontazClaimRow[];
  counts: Record<string, number>;
  stateLabels: Record<string, string>;
  truncated: boolean;
}

export interface SubmissionRow {
  id: number;
  eventId: number;
  erpOrderId: number | null;
  fitterName: string | null;
  outcome: string | null;
  status: string;
  statusLabel: string;
  createdAt: string;
  completedAt: string | null;
  stepCount: number;
  failedSteps: number;
  warningCount: number;
  collected: number | null;
  method: string | null;
  methodLabel: string | null;
  outcomeLabel: string | null;
}

export interface SubmissionList {
  rows: SubmissionRow[];
  total: number;
  page: number;
  perPage: number;
  statusLabels: Record<string, string>;
}

export interface SubmissionStep {
  name: string;
  label: string;
  status: string;
  statusLabel: string;
  detail: string | null;
  code: string | null;
}

export interface SubmissionDetail extends SubmissionRow {
  steps: SubmissionStep[];
  warnings: string[];
  input: Record<string, unknown> | null;
  /** What the fitter entered, with Czech labels. */
  inputFields: Array<{ key: string; label: string; value: unknown }>;
  uploads: Array<Record<string, unknown>>;
}

export interface MvtOverview {
  missing: { count: number; recent: number; backlog: number; owing: Array<{ person: PersonRef | null; count: number }>; top: MissingRow[] };
  /** Visits open for correction: plain events (the reason, who and when are in `event.reopen`). */
  reopened: { count: number; top: EventView[]; overdue: number };
  /** Pending requests of fitters; null from an older backend. */
  reopenRequests: { count: number; top: ReopenRequestRow[]; pending: boolean } | null;
  doplatek: { count: number; counts: Record<string, number>; top: DoplatekRow[] };
  claims: { count: number; counts: Record<string, number>; top: MontazClaimRow[] };
  /** `pending` = the fitters' app table is not in the database yet (so the count is not known). */
  submissionProblems: { count: number; pending: boolean };
  today: string;
}

export interface CallsOrder {
  orderId: number;
  customerId: number | null;
  customerName: string | null;
  statusLabel: string | null;
  owner: PersonRef | null;
  lastVisitAt: string | null;
  phones: Array<{ phone: string; key: string; source: 'order' | 'customer' }>;
}

export interface CustomerPhones {
  customerId: number | null;
  customerName: string | null;
  phones: Array<{ phone: string; key: string; source: 'order' | 'customer' }>;
  orders: Array<{ orderId: number; statusLabel: string | null }>;
}

export interface SearchHit extends EventView {
  side: Side;
}

// ---- Připravenost montáží (GET mvt/readiness) ----
export type ReadinessLevel = 'chyba' | 'overit' | 'info';

export interface ReadinessFinding {
  code: string;
  level: ReadinessLevel;
  label: string;
  fix: string;
}

export interface ReadinessRow {
  event: {
    id: number;
    type: string;
    typeLabel: string;
    title: string;
    startsAt: string;
    endsAt: string;
    day: string;
    orderId: number | null;
    complaintId: number | null;
    customer: { name: string | null; city: string | null };
    people: Array<{ id: number; name: string | null; source: string }>;
    orderStatusLabel: string | null;
    /** Taken over from the old system. */
    migrated: boolean;
    /** First 120 characters of the visit note, plain text. */
    note: string | null;
  };
  level: ReadinessLevel;
  findings: ReadinessFinding[];
  hint: { otherOrderIds: number[]; otherOrders: number; parentFirst: boolean } | null;
}

export interface ReadinessDay {
  day: string;
  checked: number;
  chyba: number;
  overit: number;
  info: number;
}

/** `available: false` = the read failed or the breaker is open (rows empty, counts null): the page shows an amber line, the badge hides. */
export interface MvtReadiness {
  available: boolean;
  testMode: boolean;
  from: string;
  to: string;
  today: string;
  windowDays: number;
  /** Visits read, with or without a finding. 0 = nothing to check: a neutral state, never "all fine". */
  checked: number;
  capped: boolean;
  counts: Record<ReadinessLevel, number> | null;
  tomorrow: { day: string; checked: number; chyba: number } | null;
  /** Today + tomorrow: `red` = visits with a red finding on those two days (nav mark, no gate). Null when unavailable. */
  urgent: { today: { day: string; checked: number; chyba: number }; tomorrow: { day: string; checked: number; chyba: number }; red: number } | null;
  byDay: ReadinessDay[];
  /** Release gate (default window only): `show` = badge and tile may be shown. */
  badge: { red: number; limit: number; show: boolean } | null;
  levels: Record<ReadinessLevel, string>;
  rows: ReadinessRow[];
}
