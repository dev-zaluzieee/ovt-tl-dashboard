// Validates recorded backend answers (scripts/fixtures, shapes from ceniky-2 readonly-docs L7) against the app's parsers, and
// checks the app's own rules (BFF allow-list, access gate, callback paths, CSRF, error texts, Prague days).
// Hotovost: the finance backend's own cash fixtures (finance-dashboard/backend/docs/fixtures/cash, generated from its code) are read
// from the sibling repo (override: FINANCE_FIXTURES=<dir>); without that checkout the recorded copies in scripts/fixtures/cash
// are used (refresh: cp the same files there).
// Imports nothing from the backend. The parsers are TypeScript, so they are transpiled on the fly with the repo's own
// `typescript`. Run: node scripts/contract-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures', `${n}.json`), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-contract-'));

const load = async (rel) => {
  const name = path.basename(rel).replace(/\.tsx?$/, '');
  let code = ts.transpileModule(fs.readFileSync(path.join(root, rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace(/from ['"]\.\/([\w-]+)['"]/g, "from './$1.mjs'");
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), code);
  return name;
};
const names = ['tl-parse', 'tl-errors', 'tl-routes', 'safe-callback', 'portal-access', 'csrf', 'links', 'format', 'dayGrid', 'call-grant', 'escalations', 'cash', 'cash-routes', 'finance-url', 'reopen-request'];
for (const n of names) await load(`lib/${n}.ts`);
const imp = (n) => import(pathToFileURL(path.join(tmp, `${n}.mjs`)).href);
const P = await imp('tl-parse');
const E = await imp('tl-errors');
const R = await imp('tl-routes');
const { safeCallbackPath } = await imp('safe-callback');
const A = await imp('portal-access');
const { checkCsrf } = await imp('csrf');
const L = await imp('links');
const F = await imp('format');
const G = await imp('dayGrid');
const ES = await imp('escalations');
const C = await imp('cash');
const CR = await imp('cash-routes');
const FU = await imp('finance-url');
const RQ = await imp('reopen-request');
process.env.NEXTAUTH_SECRET = 'contract-check-secret';
const CG = await imp('call-grant');

let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
};
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`); };
const data = (n) => { const j = fx(n); if (j.success !== true) throw new Error('fixture is not a success envelope'); return j.data; };
const throws = (fn, what) => { let t = false; try { fn(); } catch { t = true; } if (!t) throw new Error(`${what}: accepted`); };

// ---- recorded answers -----------------------------------------------------------------------------------------------
check('meta', () => { const m = P.parseMeta(data('meta')); eq(m.today, '2026-11-16', 'today'); eq(m.erpWebBaseUrl, null, 'erp base (not configured in the fixture run)'); eq(m.vocabulary.ovtCloseReasons.jine.includes('Jiné'), true, 'reasons'); eq(m.vocabulary.quietStates.length, 4, 'quiet'); eq(m.vocabulary.quietStates.includes('legacy_no_result'), true, 'quiet state of migrated visits'); eq(m.historyFrom, '2025-01-01T00:00:00.000Z', 'history scope on in the recorded run'); });
check('history scope: taken-over result is marked, a native one is not, the flag defaults to false', () => {
  const base = { id: 1, type: 'zamereni', startsAt: '2025-06-01T08:00:00.000Z', day: '2025-06-01', people: [], state: { code: 'closed', label: 'Uzavřeno', closed: true, open: false } };
  const old = P.parseEventView({ ...base, legacy: true, result: { outcome: 'order', source: 'legacy', current: true } });
  eq(old.legacy, true, 'legacy'); eq(old.result.source, 'legacy', 'source legacy');
  const fresh = P.parseEventView({ ...base, result: { outcome: 'order', current: true } });
  eq(fresh.legacy, false, 'legacy default'); eq(fresh.result.source, 'native', 'source default native');
  eq(P.parseEventView({ ...base, state: { code: 'legacy_no_result', label: 'Přeneseno z Raynetu, bez výsledku', closed: false, open: false } }).result, null, 'no result');
  eq(P.parseMeta({ ...data('meta'), historyFrom: '2025-01-01T00:00:00.000Z' }).historyFrom, '2025-01-01T00:00:00.000Z', 'historyFrom');
  eq(P.parseProblems({ ...data('ovt-problems'), rows: [{ key: 'event:1', kind: 'nedopadlo', kindLabel: 'Nedopadlo', legacy: true }] }).rows[0].legacy, true, 'problem row legacy');
  eq(P.parseProblems(data('ovt-problems')).rows[0].legacy, false, 'problem row default');
});
// The parsers DEFAULT the history fields (an older backend must not break the app), so the check that the backend still SENDS them reads the RAW
// recorded answers (generated from the backend's own builders, see ceniky-2 fixtures.test.ts): it fails when a regenerated fixture lacks them.
check('history scope: the backend sends historyFrom, legacy and result.source (raw recorded answers, a legacy row among them)', () => {
  const rawMeta = data('meta');
  eq(typeof rawMeta.historyFrom, 'string', 'meta.historyFrom is sent (a string while the history scope is on)');
  eq(Array.isArray(rawMeta.vocabulary.quietStates) && rawMeta.vocabulary.quietStates.includes('legacy_no_result'), true, 'quiet state in the vocabulary');
  const raw = data('ovt-day-history');
  for (const e of raw.events) eq(typeof e.legacy, 'boolean', `event ${e.id}: legacy is sent`);
  for (const e of raw.events.filter((x) => x.result)) eq(['native', 'legacy'].includes(e.result.source), true, `event ${e.id}: result.source is sent`);
  const d = P.parseOvtDay(raw);
  eq(d.events.length, 2, 'two history events');
  eq(d.events[0].legacy, true, 'legacy row'); eq(d.events[0].result.source, 'legacy', 'taken-over result'); eq(d.events[0].state.code, 'closed', 'closed');
  eq(d.events[1].legacy, true, 'legacy without a result'); eq(d.events[1].result, null, 'no result'); eq(d.events[1].state.code, 'legacy_no_result', 'quiet state');
  for (const n of ['ovt-day', 'mvt-day', 'ovt-results-visits']) for (const e of data(n).events ?? data(n).visits) eq(typeof e.legacy, 'boolean', `${n}: legacy is sent`);
  const claims = data('mvt-montaz-claims');
  eq(claims.rows.every((r) => typeof r.event.legacy === 'boolean'), true, 'claims rows send legacy');
  eq(claims.rows.some((r) => r.state === 'preneseno' && r.event.legacy === true && r.claim === null), true, 'a taken-over montáž without a claim link is "preneseno"');
  eq(typeof claims.stateLabels.preneseno, 'string', 'label of the state');
});
check('people', () => { eq(P.parsePeople(data('people-ovt')).length, 2, 'people'); eq(P.parsePeople(data('people-ovt'))[1].active, false, 'inactive'); });
check('ovt day: events, groups (no owner last), tiles', () => { const d = P.parseOvtDay(data('ovt-day')); eq(d.events.length, 2, 'events'); eq(d.groups.at(-1).person, null, 'no owner last'); eq(d.tiles.closed, 1, 'closed'); eq(d.qIgnored, false, 'qIgnored default'); eq(d.events[0].b2b, true, 'b2b'); eq(d.events[1].tabletDraft, true, 'draft'); });
check('mvt day: state counts, claim id and label of a claim visit', () => { const d = P.parseMvtDay(data('mvt-day')); eq(d.stateCounts.past_end, 1, 'past_end'); const c = d.events.find((e) => e.id === 21).claim; eq(c.id, 4, 'claim id'); eq(c.statusLabel, 'Nová', 'claim label'); eq(d.events.find((e) => e.id === 22).claim, null, 'no claim'); });
check('problems: kinds, closed row carries resolution, a returned order may have no date', () => { const d = P.parseProblems(data('ovt-problems')); eq(d.rows.length, 3, 'rows'); eq(d.rows[0].resolution.reason, 'zkontrolovano', 'resolution'); eq(d.counts.bez_vysledku, 1, 'counts'); eq(d.rows[1].subState.code, 'ceka_na_ovt', 'subState'); eq(d.rows[1].at, null, 'at may be null'); eq(d.rows[2].valueSDph, 25000, 'ADMF value'); });
check('results: the Zrušeno bucket (taken-over outcome zruseno) is sent in rows, totals and labels, and the page has a column for every bucket the backend sends', () => {
  const d = P.parseResults(data('ovt-results'));
  eq(d.bucketLabels.zruseno, 'Zrušeno', 'label of the bucket'); eq(typeof d.totals.zruseno, 'number', 'total of the bucket'); eq(d.rows.every((r) => typeof r.buckets.zruseno === 'number'), true, 'every row carries the bucket');
  eq(d.rows.every((r) => Object.values(r.buckets).reduce((a, b) => a + b, 0) === r.total), true, 'a row total is the sum of its buckets');
  eq(data('meta').vocabulary.outcomes.zruseno, 'Zrušeno', 'outcome label in the vocabulary');
  const page = fs.readFileSync(path.join(root, 'app/components/ovt/OvtResultsClient.tsx'), 'utf8');
  const order = (page.match(/const ORDER = \[([^\]]*)\]/)?.[1] ?? '').split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean);
  for (const b of Object.keys(d.bucketLabels)) eq(order.includes(b), true, `the page lists a column for the bucket ${b}`);
  const v = P.parseVisits(data('ovt-results-visits-zruseno')); const e = v.visits[0];
  eq(v.bucketLabel, 'Zrušeno', 'drill-down label'); eq(e.state.code, 'closed', 'a taken-over Zrušeno visit is closed'); eq(e.state.open, false, 'never open work'); eq(e.legacy, true, 'legacy'); eq(e.result.outcome, 'zruseno', 'outcome'); eq(e.result.outcomeLabel, 'Zrušeno', 'chip text'); eq(e.result.source, 'legacy', 'source');
});
check('results + drill-down', () => { const d = P.parseResults(data('ovt-results')); eq(d.rows[1].person, null, 'no owner row'); eq(d.rows[0].nedopadloReasons[0].reason, 'vysoka_cena', 'reason'); eq(d.bucketLabels.closed_no_result, 'Uzavřeno bez výsledku', 'label'); eq(P.parseVisits(data('ovt-results-visits')).visits.length, 1, 'visits'); });
check('missing: recent, backlog, closed outside the app (rows carry the visit, age and decision)', () => { const d = P.parseMissing(data('mvt-missing')); eq(d.owing[0].count, 2, 'owing'); eq(d.recent.length, 1, 'recent'); eq(d.backlog[0].event.id, 2, 'backlog row'); eq(d.backlog[0].ageDays > 7, true, 'backlog age'); eq(d.closedOutside.count, 2, 'closedOutside'); eq(d.closedOutside.rows[0].event.id, 3, 'closed outside: the visit'); eq(typeof d.closedOutside.rows[0].ageDays, 'number', 'closed outside: age'); eq(d.closedOutside.rows[0].resolution, null, 'closed outside: no decision'); eq(d.closeReasons.netyka_se, 'Netýká se', 'reasons'); eq(d.recent[0].resolution.reason, 'pripomenuto', 'handled row'); });
check('reopens: before, after and the changed fields as {field,label,before,after}', () => { const d = P.parseReopens(data('mvt-reopens')); eq(d.rows[0].after, null, 'open'); eq(d.rows[1].after.paymentMethodLabel, 'Fakturou', 'after'); eq(d.rows[1].changes.length, 2, 'changes'); eq(d.rows[1].changes[0].label, 'Vybráno', 'change label'); eq(d.rows[1].changes[0].before, 800, 'change before'); eq(d.rows[1].changes[0].after, 1200, 'change after'); });
check('doplatek', () => { const d = P.parseDoplatek(data('mvt-doplatek')); eq(d.rows[1].invoice, true, 'invoice'); eq(d.rows[1].invoiceCheck, 'disabled', 'check'); eq(d.rows[0].severity, 'red', 'severity'); eq(d.invoiceCheckEnabled, false, 'flag'); eq(d.rows[0].orderCreatedAt, '2026-10-28T08:15:00.000Z', 'orderCreatedAt'); });
check('rescues, montaz claims', () => { eq(P.parseRescues(data('mvt-rescues')).summary.claimed, 1, 'claimed'); const c = P.parseMontazClaims(data('mvt-montaz-claims')); eq(c.rows[0].followUp.id, 77, 'followUp'); eq(c.rows[1].claim, null, 'no claim'); });
check('submissions list + detail (Czech labels of what the fitter entered)', () => { eq(P.parseSubmissionList(data('mvt-submissions')).total, 1, 'total'); const d = P.parseSubmissionDetail(data('mvt-submission-detail')); eq(d.steps[1].code, 'ORDER_LOCKED', 'step code'); eq(d.warnings.length, 1, 'warnings'); eq(d.warnings[0].includes('raynet'), false, 'no Raynet name'); eq(d.inputFields.find((f) => f.key === 'komentar').label, 'Komentář', 'input label'); });
check('overview: a reopened visit is a plain event, the pending flag is a boolean', () => { const d = P.parseOverview(data('mvt-overview')); eq(d.missing.owing.length, 1, 'owing'); eq(d.missing.count, 2, 'missing counts recent and older'); eq(d.reopened.top[0].reopen.reason, 'znovu', 'reopen reason on the event'); eq(d.submissionProblems.pending, false, 'pending'); });
check('fitters\' reopen requests: open list (a request on a visit outside the scope has event null), all list with decisions, pending answer', () => {
  const o = P.parseReopenRequests(data('mvt-reopen-requests-open'));
  eq(o.rows.length, 2, 'rows'); eq(o.openCount, 2, 'openCount'); eq(o.pending, false, 'pending'); eq(o.rows[0].request.status, 'requested', 'status'); eq(o.rows[0].request.requestedByName, 'Montér Petr', 'who'); eq(o.rows[0].event.id, 51, 'event'); eq(o.rows[1].event, null, 'event outside the scope is null');
  const a = P.parseReopenRequests(data('mvt-reopen-requests-all'));
  eq(a.rows[1].request.decidedViaLabel, 'V dashboardu team leadera', 'how decided'); eq(a.rows[1].request.decisionNote, 'Otevřeno, zapište znovu.', 'note'); eq(a.rows[1].request.erpReopenId, 41, 'reopen id'); eq(a.rows[2].request.statusLabel, 'Zamítnuto', 'label');
  const p = P.parseReopenRequests(data('mvt-reopen-requests-pending'));
  eq(p.pending, true, 'pending flag'); eq(p.rows.length, 0, 'no rows');
  throws(() => P.parseReopenRequests({ rows: [{ request: { id: 'x' }, event: null }] }), 'bad request id'); throws(() => P.parseReopenRequests([]), 'not an object');
});
check('fitters\' reopen requests: approve answers as an ERP action (steps, request), decline answers {request}', () => {
  const d = P.parseAction(data('mvt-reopen-request-approved'));
  eq(d.outcome, 'done', 'outcome'); eq(d.steps.length, 2, 'steps'); eq(d.steps[0].label, 'Znovuotevření návštěvy v ERP', 'step label'); eq(d.reopenId, 42, 'reopen id'); eq(d.request.status, 'opened', 'request');
  eq(P.parseReopenRequest(data('mvt-reopen-request-declined').request).decisionNote, 'Ne.', 'decline note');
  eq(P.parseAction({ ...data('mvt-reopen-request-approved'), outcome: 'dry' }).outcome, 'dry', 'dry run');
  eq(P.parseAction({ outcome: 'done', steps: [], ref: null, request: null }).steps.length, 0, 'already reopened in the ERP: no steps');
});
check('fitters\' reopen requests: after approve the notice follows request.status, not only the outcome; decidedActorEmail is parsed tolerantly', () => {
  const base = data('mvt-reopen-request-approved');
  const ok = P.parseAction(base); ok.request = P.parseReopenRequest(base.request);
  eq(RQ.approveNotice(ok), null, 'opened + done: nothing special (the dialog closes itself)');
  for (const outcome of ['partial', 'done']) {
    const w = P.parseAction({ ...base, outcome }); w.request = P.parseReopenRequest(data('mvt-reopen-request-declined').request);
    const n = RQ.approveNotice(w);
    eq(n.kind, 'mismatch', `${outcome} + declined`); eq(n.text.includes('Zamítnuto'), true, 'status label'); eq(n.text.includes('Team Leader'), true, 'who'); eq(n.text.includes('otevřena'), true, 'says it was opened in the ERP');
  }
  const rq = P.parseAction({ ...base, outcome: 'partial' }); rq.request = P.parseReopenRequest({ ...base.request, status: 'requested', statusLabel: 'Čeká na vyřízení', decidedAt: null, decidedByName: null });
  const rn = RQ.approveNotice(rq); eq(rn.text.includes('Čeká na vyřízení'), false, 'requested: no state label'); eq(rn.text.includes('označí jako otevřená sama'), true, 'requested: will be marked on the next load'); eq(rn.text.includes('nedozví'), false, 'requested: no fitter warning');
  eq(E.errorText(new E.TlApiError(409, '', 'EVENT_CANCELLED', {})), 'Událost je zrušená.', 'EVENT_CANCELLED keeps its global text');
  const wd = P.parseAction(base); wd.request = P.parseReopenRequest({ ...data('mvt-reopen-request-declined').request, status: 'withdrawn', statusLabel: 'Montér žádost stáhl', decidedByName: 'Montér Petr' });
  eq(RQ.approveNotice(wd).text.includes('Montér žádost stáhl'), true, 'withdrawn by the fitter');
  const dry = P.parseAction({ ...base, outcome: 'dry' }); dry.request = P.parseReopenRequest(data('mvt-reopen-request-declined').request); eq(RQ.approveNotice(dry), null, 'dry run: nothing was opened');
  const failed = P.parseAction({ ...base, outcome: 'failed' }); failed.request = P.parseReopenRequest(data('mvt-reopen-request-declined').request); eq(RQ.approveNotice(failed), null, 'failed: the ERP did not open it');
  const already = P.parseAction({ ...base, steps: [] }); already.request = P.parseReopenRequest(base.request);
  eq(RQ.approveNotice(already).kind, 'already_open', 'no steps: already open'); eq(RQ.approveNotice(already).text.includes('už byla v ERP otevřená'), true, 'sentence');
  eq(P.parseReopenRequest(base.request).decidedActorEmail, null, 'absent = null');
  eq(P.parseReopenRequest(data('mvt-reopen-requests-all').rows[2].request).decidedActorEmail, 'admin@example.cz', 'on behalf of');
});
check('fitters\' reopen requests: 409 REQUEST_DECIDED names who decided and how, the other new codes have Czech sentences', () => {
  const b = fx('error-request-decided'); const t = E.errorText(new E.TlApiError(409, b.message, b.code, b));
  eq(t.includes('Jiný Leader'), true, 'who'); eq(t.includes('Zamítnuto'), true, 'state'); eq(t.includes('V dashboardu team leadera'), true, 'how'); eq(t.includes('Opravu zapisuje kancelář.'), true, 'note');
  eq(E.errorText(new E.TlApiError(409, 'x', 'REQUEST_DECIDED', {})).includes('mezitím'), true, 'without data.request');
  for (const [status, code, part] of [[404, 'REQUEST_NOT_FOUND', 'Žádost'], [409, 'EVENT_CANCELLED', 'zrušená'], [409, 'NOT_CLOSED', 'uzavřená'], [400, 'NOTE_REQUIRED', '3 až 1000'], [400, 'INVALID_BODY', 'dlouhá'], [400, 'INVALID_ID', 'Neplatné'], [400, 'INVALID_QUERY', 'filtr'], [503, 'MIGRATION_PENDING', 'migraci']]) {
    const s = E.errorText(new E.TlApiError(status, '', code, {})); eq(s.includes(part), true, `${code}: ${s}`);
  }
});
check('fitters\' reopen requests: overview block, day view line, reopened list fields; an older backend (fields absent) parses to nulls', () => {
  const o = P.parseOverview(data('mvt-overview-requests'));
  eq(o.reopenRequests.count, 1, 'count'); eq(o.reopenRequests.top[0].request.reason.length > 0, true, 'reason'); eq(o.reopenRequests.pending, false, 'pending'); eq(o.reopened.overdue, 0, 'overdue');
  const old = P.parseOverview(data('mvt-overview'));
  eq(old.reopenRequests, null, 'old backend: no block'); eq(old.reopened.overdue, 0, 'old backend: overdue defaults to 0');
  const d = P.parseMvtDay(data('mvt-day-request'));
  eq(d.events[0].reopenRequest.reason, 'Zákazník doplatil jinak.', 'request on a day event'); eq(d.events[1].reopenRequest, null, 'no request'); eq(P.parseMvtDay(data('mvt-day')).events[0].reopenRequest, null, 'old backend: null');
  const r = P.parseReopens(data('mvt-reopens-expiry'));
  eq(r.rows[0].requestId, null, 'no request'); eq(r.rows[0].expiry, null, 'expiry is null for now'); eq(r.rows[1].requestId, 5, 'opened on a request'); eq(r.rows[1].expiry.state, 'running', 'expiry state'); eq(r.rows[1].expiry.expiresAt, '2026-11-21T08:00:00.000Z', 'expires at');
  const o2 = P.parseReopens(data('mvt-reopens')); eq(o2.rows.every((x) => x.requestId === null && x.expiry === null), true, 'old backend: defaults');
  const bad = fx('mvt-reopens-expiry').data; bad.rows[1].expiry = { state: 'whatever', expiresAt: null }; eq(P.parseReopens(bad).rows[1].expiry, null, 'unknown state shows nothing');
  const page = fs.readFileSync(path.join(root, 'app/components/mvt/MvtReopensClient.tsx'), 'utf8');
  eq(/if \(!expiry\) return null;/.test(page), true, 'the chip is drawn only when expiry is set');
});
check('readiness: recorded answer (rows, findings, hint, gate) and the unavailable answer parse; a bad level or a missing field is refused', () => {
  const d = P.parseReadiness(data('mvt-readiness'));
  eq(d.available, true, 'available'); eq(d.windowDays, 7, 'window'); eq(d.checked, 4, 'checked counts the visits without a finding'); eq(d.counts.chyba, 2, 'red rows'); eq(d.byDay.length, 8, 'days of the window');
  eq(d.tomorrow.chyba, 1, 'tomorrow'); eq(d.badge.show, true, 'gate'); eq(d.badge.limit, 15, 'gate limit'); eq(d.testMode, false, 'testMode');
  const trigger = d.rows.find((r) => r.event.id === 2);
  eq(trigger.findings[0].code, 'bez_vlastniho_zamereni', 'first finding'); eq(trigger.level, 'chyba', 'level'); eq(trigger.hint.otherOrderIds[0], 1001, 'hint order'); eq(trigger.event.note, 'Výrobní list není, je to zaměřeno zvlášť.', 'note is plain text');
  eq(/#1001/.test(trigger.findings[0].fix), true, 'the fix names the order');
  const noFiles = trigger.findings.find((f) => f.code === 'bez_priloh');
  eq(noFiles.label, 'Montáž nemá žádné přílohy', 'no preparation files: label'); eq(noFiles.level, 'overit', 'no preparation files: amber, not a blocker');
  const u = P.parseReadiness(data('mvt-readiness-unavailable'));
  eq(u.available, false, 'unavailable'); eq(u.rows.length, 0, 'no rows'); eq(u.counts, null, 'no counts'); eq(u.badge, null, 'no badge');
  const bad = fx('mvt-readiness').data; bad.rows[0].level = 'zelena'; throws(() => P.parseReadiness(bad), 'unknown level');
  const bad2 = fx('mvt-readiness').data; delete bad2.counts; throws(() => P.parseReadiness(bad2), 'no counts');
});
check('action with steps: done, and a failure that arrives as HTTP 200', () => {
  const d = P.parseAction(data('action-done'));
  eq(d.outcome, 'done', 'done'); eq(d.steps.length, 5, 'nedopadlo has five steps (columns, status, tags, comment, visit_result)'); eq(d.steps[2].name, 'tags', 'tags step');
  const rt = P.parseAction(data('action-retry-done')); eq(rt.steps[0].detail, 'beze změny (už zapsáno předchozím pokusem)', 'retry detail kept'); eq(rt.steps.every((x) => x.status === 'ok'), true, 'retry steps ok');
  const pt = P.parseAction(data('action-partial')); eq(pt.outcome, 'partial', 'partial'); eq(pt.steps[2].status, 'failed', 'non-stopping step failed');
  const f = P.parseAction(data('action-failed-locked'));
  eq(f.outcome, 'failed', 'failed'); eq(typeof f.steps[0].code, 'string', 'code'); eq(f.steps[1].status, 'pending', 'pending after a stopping step'); eq(f.steps.length, 5, 'five steps');
});
check('calls lookup + customer phones', () => { const o = P.parseCallsOrders(data('calls-lookup')); eq(o[0].phones[1].key, '603333444', 'key'); eq(o[0].customerId, 201, 'customerId'); eq(P.parseCustomerPhones(data('customer-phones')).orders.length, 1, 'orders'); });
check('review-qr + prompts', () => { const d = P.parseReviewQr(data('review-qr')); eq(d.regions.length, 14, 'regions'); eq(d.regions.find((r) => r.ovts.length).ovts[0].userId, 5, 'ovt'); eq(d.outsideRegions[0].reason, 'no_home_kraj', 'outside'); eq(d.targets[1].active, false, 'inactive target'); const p = P.parsePrompts(data('review-qr-prompts')); eq(p.prompts[0].erpOrderId, 10000011, 'erp order'); });

check('call grant: only for the person and the call it was issued for, and not after it expires', () => {
  const g = CG.issueCallGrant('tl@example.cz', 'abc123');
  eq(CG.checkCallGrant('tl@example.cz', 'abc123', g), true, 'valid');
  eq(CG.checkCallGrant('TL@example.cz', 'abc123', g), true, 'e-mail case');
  eq(CG.checkCallGrant('other@example.cz', 'abc123', g), false, 'other person');
  eq(CG.checkCallGrant('tl@example.cz', 'abc124', g), false, 'other call');
  eq(CG.checkCallGrant('tl@example.cz', 'abc123', null), false, 'no grant');
  eq(CG.checkCallGrant('tl@example.cz', 'abc123', g.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), false, 'tampered');
  eq(CG.checkCallGrant('tl@example.cz', 'abc123', g, Date.now() + CG.GRANT_TTL_MS + 1000), false, 'expired');
});
check('timestamps inside a text are shown as Prague time', () => { eq(F.humanizeTimestamps('Zamčeno (2026-11-16T15:44:04.706Z).'), 'Zamčeno (16. 11. 2026 16:44).', 'iso'); });

check('wrong shapes are refused (named field)', () => {
  const bad = fx('ovt-day').data; delete bad.tiles; throws(() => P.parseOvtDay(bad), 'no tiles');
  const b2 = fx('ovt-day').data; b2.events[0].state = 'closed'; throws(() => P.parseOvtDay(b2), 'state as text');
  const b3 = fx('action-done').data; b3.outcome = 'success'; throws(() => P.parseAction(b3), 'unknown outcome');
  const b4 = fx('action-done').data; b4.steps[0].status = 'SUCCESS'; throws(() => P.parseAction(b4), 'unknown step status');
  const b5 = fx('meta').data; delete b5.vocabulary.ovtCloseReasons; throws(() => P.parseMeta(b5), 'no vocabulary');
  try { P.parseOvtDay(bad); } catch (e) { if (!String(e.message).includes('tiles')) throw new Error('error does not name the field'); }
});

// ---- Hotovost: finance fixtures, parsers, helpers -----------------------------------------------------------------------
const FIN_DIR = process.env.FINANCE_FIXTURES ?? '/Users/karel/source/zaluzieee/finance-dashboard/backend/docs/fixtures/cash';
const cashFxDir = fs.existsSync(path.join(FIN_DIR, 'tl-persons.json')) ? FIN_DIR : path.join(root, 'scripts/fixtures/cash');
console.log(`      (cash fixtures from ${cashFxDir})`);
const cfx = (n) => JSON.parse(fs.readFileSync(path.join(cashFxDir, `${n}.json`), 'utf8'));
const cdata = (n) => { const j = cfx(n); if (j.success !== true) throw new Error('fixture is not a success envelope'); return j.data; };
const sameKeys = (obj, known, what) => {
  const have = Object.keys(obj).sort().join(',');
  const want = [...known].sort().join(',');
  if (have !== want) throw new Error(`${what}: backend keys [${have}] differ from the client's [${want}]`);
};

check('cash persons: client keys equal the finance fixture, mapping and counts', () => {
  const raw = cdata('tl-persons');
  for (const p of raw.persons) sameKeys(p, C.CASH_PERSON_KEYS, 'person');
  const ps = C.parseCashPersons(raw);
  eq(ps.length, 5, 'persons'); eq(ps[0].role, 'ovt', 'role'); eq(ps[1].role, 'mvt', 'mvt role');
  eq(ps[4].erp_user_id, null, 'unmapped person'); eq(ps[0].erp_user_ids.length, 1, 'erp ids'); eq(ps[0].missing_proof_count, 2, 'missing proof');
  eq(ps[2].inventura_at, null, 'not activated'); eq(ps[0].balance_czk, '3200.00', 'decimal string kept');
});
check('cash detail: client keys equal the finance fixture (person, entry, summary, missing proof)', () => {
  const raw = cdata('tl-person-detail');
  sameKeys(raw.person, C.CASH_PERSON_HEAD_KEYS, 'person');
  for (const e of raw.entries) sameKeys(e, C.CASH_ENTRY_KEYS, 'entry');
  sameKeys(raw.summary, C.CASH_SUMMARY_KEYS, 'summary');
  for (const m of raw.missingProof.entries) sameKeys(m, C.CASH_MISSING_PROOF_KEYS, 'missing proof');
  const d = C.parseCashDetail(raw);
  eq(d.entries.length, 5, 'entries'); eq(d.missingProof.count, 2, 'missing count'); eq(d.erpSync.stale, true, 'stale flag'); eq(d.erpSync.reason, 'not_configured', 'reason');
  eq(d.summary.ovtCode, 'OVT05', 'code'); eq(d.summary.pendingDepositsCzk, 1000, 'pending'); eq(d.summary.discrepancyDepositsCzk, 500, 'discrepancy');
  const e3 = d.entries.find((e) => e.id === 3);
  eq(e3.order_ref, 77, 'order_ref'); eq(e3.erp_order_id, null, 'erp_order_id'); eq(C.entryOrderId(e3), 77, 'order link target'); eq(e3.source, 'erp_sync', 'source');
  eq(d.entries.find((e) => e.id === 5).recon_status, 'discrepancy', 'recon'); eq(d.entries.find((e) => e.id === 6).attachments[0].filename, 'paragon.jpg', 'attachment');
});
check('cash: wrong shapes are refused (named field)', () => {
  const b1 = cfx('tl-persons').data; delete b1.persons[0].balance_czk; throws(() => C.parseCashPersons(b1), 'no balance');
  const b2 = cfx('tl-persons').data; b2.persons[0].active = 'yes'; throws(() => C.parseCashPersons(b2), 'active as text');
  const b3 = cfx('tl-person-detail').data; delete b3.summary; throws(() => C.parseCashDetail(b3), 'no summary');
  const b4 = cfx('tl-person-detail').data; b4.entries[0].recon_status = 'done'; throws(() => C.parseCashDetail(b4), 'unknown recon status');
  const b5 = cfx('tl-person-detail').data; b5.entries[1].attachments = null; throws(() => C.parseCashDetail(b5), 'attachments');
  const b6 = cfx('tl-person-detail').data; b6.entries[0].amount_czk = 'abc'; throws(() => C.parseCashDetail(b6), 'amount');
  try { C.parseCashPersons(b1); } catch (e) { if (!String(e.message).includes('balance_czk')) throw new Error('error does not name the field'); }
});
check('cash overview: totals count only activated persons (the old page rule)', () => {
  const ps = C.parseCashPersons(cdata('tl-persons'));
  const t = C.cashTotals(ps);
  eq(t.count, 5, 'count'); eq(t.activated, 2, 'activated'); eq(t.waiting, 3, 'waiting'); eq(t.balance, 5200, 'balance'); eq(t.overdue, 5200, 'overdue'); eq(t.overdueCount, 2, 'overdue persons'); eq(t.missingProof, 2, 'missing proof');
  const ovt = C.cashTotals(C.filterPersons(ps, { role: 'ovt', q: '', onlyActive: true }));
  eq(ovt.count, 4, 'ovt only'); eq(ovt.balance, 3200, 'ovt balance');
  eq(JSON.stringify(C.roleCounts(ps, true)), '{"all":5,"ovt":4,"mvt":1}', 'role counts');
});
check('cash overview: switch OVT / MVT / all, search without diacritics, inactive hidden', () => {
  const ps = C.parseCashPersons(cdata('tl-persons')).map((p) => (p.id === 3 ? { ...p, active: false } : p));
  eq(C.filterPersons(ps, { role: 'mvt', q: '', onlyActive: true }).map((p) => p.id).join(), '2', 'mvt');
  eq(C.filterPersons(ps, { role: 'all', q: '', onlyActive: true }).length, 4, 'inactive hidden');
  eq(C.filterPersons(ps, { role: 'all', q: '', onlyActive: false }).length, 5, 'inactive shown');
  eq(C.filterPersons(ps, { role: 'all', q: 'jana nova', onlyActive: false }).map((p) => p.id).join(), '1', 'Jana Nová found as "jana nova"');
  eq(C.filterPersons(ps, { role: 'all', q: 'MONTER', onlyActive: false }).map((p) => p.id).join(), '2', 'case and diacritics');
  eq(C.filterPersons(ps, { role: 'all', q: 'unmapped@', onlyActive: false }).map((p) => p.id).join(), '5', 'by e-mail');
  eq(C.parseRoleFilter('mvt'), 'mvt', 'role param'); eq(C.parseRoleFilter('x'), 'all', 'bad role param'); eq(C.parseRoleFilter(null), 'all', 'no role param');
});
check('cash overview: sorting (names in Czech, missing dates always last, held = longest first)', () => {
  const mk = (id, name, extra) => ({ id, email: `${id}@x.cz`, display_name: name, role: 'ovt', active: true, balance_czk: '0', entry_count: 0, last_entry_at: null, overdue_czk: '0', held_since: null, inventura_at: null, raynet_user_id: null, erp_user_id: id, erp_user_ids: [id], missing_proof_count: 0, ...extra });
  const ps = [mk(1, 'Čech', { held_since: '2026-11-10T08:00:00Z', overdue_czk: '100', balance_czk: '900' }), mk(2, 'Adam', { held_since: '2026-11-01T08:00:00Z', overdue_czk: '300', balance_czk: '100' }), mk(3, 'Zora', { overdue_czk: '200', balance_czk: '500' }), mk(4, 'Dita', { held_since: '2026-11-05T08:00:00Z' })];
  const ids = (k, d) => C.sortPersons(ps, k, d).map((p) => p.id).join();
  eq(ids('name', 'asc'), '2,1,4,3', 'name asc (Č after C, before D)');
  eq(ids('overdue', 'desc'), '2,3,1,4', 'overdue desc');
  eq(ids('balance', 'asc'), '4,2,3,1', 'balance asc');
  eq(ids('held', 'desc'), '2,4,1,3', 'held desc = oldest first, never-held last');
  eq(ids('held', 'asc'), '1,4,2,3', 'held asc, never-held still last');
  eq(ps.map((p) => p.id).join(), '1,2,3,4', 'input not mutated');
});
check('cash person page: anchor, expenses since, notes, labels, links, money', () => {
  const d = C.parseCashDetail(cdata('tl-person-detail'));
  eq(typeof C.anchorAt(d.entries), 'string', 'anchor');
  const mk = (id, type, at, amt, extra) => ({ ...d.entries[0], id, entry_type: type, happened_at: at, amount_czk: amt, voided_at: null, ...extra });
  const es = [mk(1, 'inventura', '2026-11-02T08:00:00Z', '0'), mk(2, 'expense', '2026-11-01T08:00:00Z', '50'), mk(3, 'expense', '2026-11-03T08:00:00Z', '300'), mk(4, 'expense', '2026-11-04T08:00:00Z', '70', { voided_at: '2026-11-05T08:00:00Z' }), mk(5, 'inventura', '2026-11-09T08:00:00Z', '0', { voided_at: '2026-11-09T09:00:00Z' })];
  eq(C.anchorAt(es), '2026-11-02T08:00:00Z', 'latest VALID inventura'); eq(C.expenseSince(es, C.anchorAt(es)), 300, 'after anchor, no voided'); eq(C.expenseSince(es, null), 350, 'no anchor: all valid');
  const post = { ...d.entries[0], entry_type: 'bank_deposit', deposit_channel: 'post', declared_variable_symbol: '1051117', declared_gross_czk: '1065.00', fee_czk: '65.00', customer_name: null, expense_category: null, note: null };
  eq(C.entryNote(post), 'VS 1051117 · předáno 1 065 Kč · poplatek 65 Kč', 'post deposit note'); eq(C.entryTypeLabel(post), 'Vklad na poště', 'post label');
  eq(C.entryNote({ ...d.entries[0], customer_name: 'Marie', expense_category: 'Other', note: 'obj. #77' }), 'Marie · obj. #77', 'Other category hidden');
  eq(C.entryNote(d.entries.find((e) => e.id === 6)), 'PHM', 'expense category');
  eq(C.entryOrderId({ erp_order_id: 9, order_ref: 77 }), 9, 'erp id first'); eq(C.entryOrderId({ erp_order_id: null, order_ref: null }), null, 'none');
  eq(C.sourceLabel('erp_sync'), 'ERP (návštěva)', 'erp_sync'); eq(C.sourceLabel('ovt_app'), 'tablet', 'ovt_app'); eq(C.sourceLabel('mvt_app'), 'aplikace montérů', 'mvt_app'); eq(C.sourceLabel('manual'), 'ručně (finance)', 'manual'); eq(C.sourceLabel('bank_api'), 'banka', 'bank_api'); eq(C.sourceLabel('new_thing'), 'new_thing', 'unknown kept');
  eq(C.fmtCzk('3200.00'), '3 200 Kč', 'decimal string'); eq(C.fmtCzk(0), '0 Kč', 'zero'); eq(C.fmtCzk(null), '—', 'null'); eq(C.personName({ display_name: null, email: 'jana@x.cz' }), 'jana', 'name from e-mail');
  eq(L.erpOrderUrl('https://erp.example.cz', C.entryOrderId(d.entries.find((e) => e.id === 3))), 'https://erp.example.cz/orders/77', 'link to the ERP order');
});
check('cash errors: the 401 that is not a lost session never loops through the login; finance messages are shown as they are', () => {
  eq(C.cashHttpStatus(401, 'TOKEN_EXPIRED'), 401, 'renew and retry'); eq(C.cashHttpStatus(401, 'UNAUTHORIZED'), 401, 'no session');
  eq(C.cashHttpStatus(401, 'WRONG_AUDIENCE'), 403, 'wrong audience'); eq(C.cashHttpStatus(401, 'INVALID_TOKEN'), 403, 'invalid token'); eq(C.cashHttpStatus(401, null), 403, 'unknown 401');
  eq(C.cashHttpStatus(403, 'WRONG_CLIENT'), 403, '403 stays'); eq(C.cashHttpStatus(503, 'NOT_CONFIGURED'), 503, '503 stays'); eq(C.cashHttpStatus(404, 'PERSON_NOT_FOUND'), 404, '404 stays');
  for (const n of ['error-attachment-not-found', 'error-storage-not-configured']) { const b = cfx(n); if (!C.CASH_MESSAGE_CODES.has(b.code) || typeof b.message !== 'string' || !b.message) throw new Error(`${n}: code ${b.code} is not shown with finance's message`); }
  eq(C.CASH_NOT_CONFIGURED_MESSAGE, 'Hotovost není nastavena.', 'not set up text');
});
check('FINANCE_API_URL: unset or not http(s) = not set up, trailing slash cut, no default address', () => {
  const was = process.env.FINANCE_API_URL;
  try {
    delete process.env.FINANCE_API_URL; eq(FU.getFinanceUrl(), null, 'unset');
    process.env.FINANCE_API_URL = '   '; eq(FU.getFinanceUrl(), null, 'blank');
    process.env.FINANCE_API_URL = 'finance.local:4000'; eq(FU.getFinanceUrl(), null, 'no scheme');
    process.env.FINANCE_API_URL = 'ftp://x'; eq(FU.getFinanceUrl(), null, 'other scheme');
    process.env.FINANCE_API_URL = ' http://127.0.0.1:4100/// '; eq(FU.getFinanceUrl(), 'http://127.0.0.1:4100', 'trimmed');
  } finally { if (was === undefined) delete process.env.FINANCE_API_URL; else process.env.FINANCE_API_URL = was; }
});
check('Hotovost routes: only numeric ids reach the finance URL; every path the source calls exists', () => {
  for (const id of ['1', '42', '9007199254740991']) eq(CR.isCashId(id), true, id);
  for (const id of ['0', '05', '-1', '1.5', '1/2', '..', '%2e', '1 ', '', 'x', '12345678901234567']) eq(CR.isCashId(id), false, id);
  for (const p of ['persons', 'persons/4', 'attachments/9', 'status']) eq(CR.matchCashPath(p), true, p);
  for (const p of ['persons/0', 'attachments', 'persons/4/entries', 'attachments/x', 'receive', 'persons/..']) eq(CR.matchCashPath(p), false, p);
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.tsx?$/.test(f.name)) files.push(p); } };
  walk(path.join(root, 'app')); walk(path.join(root, 'lib'));
  let n = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bcashGet\(\s*[`'"]([^`'"]+)[`'"]/g)) { n++; if (!CR.matchCashPath(m[1].replace(/\$\{[^}]+\}/g, '5'))) throw new Error(`${path.relative(root, f)}: cashGet ${m[1]} is not a Hotovost route`); }
    for (const m of src.matchAll(/\/api\/cash\/([A-Za-z0-9_\/${}.-]*[A-Za-z0-9_}])/g)) { if (m[1] === '${path}') continue; n++; if (!CR.matchCashPath(m[1].replace(/\$\{[^}]+\}/g, '5'))) throw new Error(`${path.relative(root, f)}: /api/cash/${m[1]} is not a Hotovost route`); }
  }
  if (n < 3) throw new Error(`only ${n} call sites found, the scan is broken`);
});
check('Hotovost is read-only: the route files export GET only, and the proxy sends GET only', () => {
  const dir = path.join(root, 'app/api/cash');
  const routes = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name === 'route.ts') routes.push(p); } };
  walk(dir);
  eq(routes.length, 4, 'route files');
  for (const r of routes) { const src = fs.readFileSync(r, 'utf8'); if (/export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/.test(src) || /export\s*\{[^}]*\b(POST|PUT|PATCH|DELETE)\b/.test(src)) throw new Error(`${path.relative(root, r)} exports a write method`); }
  const proxy = fs.readFileSync(path.join(root, 'lib/finance-proxy.ts'), 'utf8');
  if (/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(proxy)) throw new Error('finance proxy sends a write');
  if (!/\/api\/tl\/cash\//.test(proxy) || /\/api\/me\/cash/.test(proxy)) throw new Error('finance proxy must call only /api/tl/cash/');
  if (/X-Person|searchParams|request\.(headers|url)/.test(proxy)) throw new Error('finance proxy must not forward caller-chosen identity or query');
});

check('escalations from finance: client keys equal the backend fixtures, rows, null visit, states', () => {
  const raw = data('mvt-escalations-all');
  for (const r of raw.rows) { sameKeys(r.escalation, ES.ESCALATION_KEYS, 'escalation'); }
  const d = ES.parseEscalations(raw);
  eq(d.rows.length, 3, 'rows'); eq(d.openCount, 1, 'open count'); eq(d.pending, false, 'pending'); eq(d.rows[0].event.id, 300, 'visit'); eq(d.rows[1].event, null, 'visit left the period');
  eq(d.rows.map((r) => r.escalation.state).join(), 'open,withdrawn,resolved', 'states'); eq(d.rows[2].escalation.resolutionNote, 'Doplatek doplacen na dobírku.', 'note');
  eq(ES.visibleRows(d.rows, 'open').length, 1, 'open filter'); eq(ES.visibleRows(d.rows, 'all').length, 3, 'all filter');
  eq(ES.parseEscalations(data('mvt-escalations')).rows.length, 1, 'default list is open only');
  const r = ES.parseResolved(data('mvt-escalation-resolved')); eq(r.state, 'resolved', 'resolved'); eq(r.resolvedBy, 'tl@example.cz', 'by'); eq(r.resolutionNote, 'Vyřešeno s montérem', 'note');
  const bad = fx('mvt-escalations').data; bad.rows[0].escalation.state = 'done'; throws(() => ES.parseEscalations(bad), 'unknown state');
  const bad2 = fx('mvt-escalations').data; delete bad2.rows[0].escalation.reason; throws(() => ES.parseEscalations(bad2), 'no reason');
});
check('escalations: note rule (3-1000 trimmed), only https links, filter param, error texts', () => {
  eq(ES.noteValid('ab'), false, 'short'); eq(ES.noteValid('  ab  '), false, 'short trimmed'); eq(ES.noteValid('abc'), true, '3'); eq(ES.noteValid('x'.repeat(1001)), false, 'long');
  const fo = 'https://doklady.example.cz';
  eq(ES.safeLink('https://doklady.example.cz/v/1', fo), 'https://doklady.example.cz/v/1', 'finance origin'); eq(ES.safeLink('javascript:alert(1)', fo), null, 'js'); eq(ES.safeLink('http://doklady.example.cz/v/1', fo), null, 'http'); eq(ES.safeLink(null, fo), null, 'null');
  eq(ES.safeLink('https://evil.example/login', fo), null, 'foreign origin'); eq(ES.safeLink('https://doklady.example.cz.evil.example/', fo), null, 'look-alike host'); eq(ES.safeLink('https://doklady.example.cz/v/1', null), null, 'no origin configured = no link');
  eq(ES.parseFilter('all'), 'all', 'all'); eq(ES.parseFilter('x'), 'open', 'default');
  const b = fx('error-already-resolved'); eq(E.errorText(new E.TlApiError(409, b.message, b.code, b)).includes('vyřešená'), true, 'ALREADY_RESOLVED');
  eq(E.errorText(new E.TlApiError(400, 'x', 'NOTE_REQUIRED', {})).includes('3 až 1000'), true, 'NOTE_REQUIRED');
});

// ---- errors in Czech ------------------------------------------------------------------------------------------------
const apiErr = (name, status) => { const b = fx(name); return new E.TlApiError(status, b.message, b.code, b); };
check('FINANCE_WEB_URL: https origin only, unset = null', () => {
  const was = process.env.FINANCE_WEB_URL;
  try {
    delete process.env.FINANCE_WEB_URL; eq(FU.getFinanceWebOrigin(), null, 'unset');
    process.env.FINANCE_WEB_URL = 'http://x.cz'; eq(FU.getFinanceWebOrigin(), null, 'http');
    process.env.FINANCE_WEB_URL = 'x.cz'; eq(FU.getFinanceWebOrigin(), null, 'no scheme');
    process.env.FINANCE_WEB_URL = ' https://Doklady.example.cz/some/path/ '; eq(FU.getFinanceWebOrigin(), 'https://doklady.example.cz', 'origin only');
  } finally { if (was === undefined) delete process.env.FINANCE_WEB_URL; else process.env.FINANCE_WEB_URL = was; }
});
check('error texts per code', () => {
  const t = (n, s) => E.errorText(apiErr(n, s));
  if (!t('error-no-erp-user', 403).includes('nemá uživatele v ERP')) throw new Error('NO_ERP_USER');
  if (!t('error-migration-pending', 503).includes('migrac')) throw new Error('MIGRATION_PENDING');
  if (!t('error-not-configured', 503).includes('TL2_START_AT')) throw new Error('NOT_CONFIGURED names the missing variable');
  const w = t('error-erp-write-failed', 502);
  if (!w.includes('Zakázka je ve stavu, který to nedovoluje') || w.includes('ERP odmítlo zápis: ERP') || !w.includes('Sloupce zakázky') || !w.includes('tl2-9f9f9f')) throw new Error(`ERP_WRITE_FAILED shows the ERP message, the step and the ref: ${w}`);
  if (!t('error-order-locked', 423).includes('zamčená')) throw new Error('ORDER_LOCKED');
  if (!t('error-token-renew', 401).includes('ERP odmítlo')) throw new Error('TOKEN_RENEW');
  eq(E.errorText(new E.TlApiError(401, 'x', 'UNAUTHORIZED', {})), 'Přihlášení vypršelo, přihlaste se prosím znovu.', 'session expired');
  const c = (n, st) => E.errorText(apiErr(n, st));
  if (!c('error-not-in-scope', 404).includes('nespadá')) throw new Error('NOT_IN_SCOPE');
  if (!c('error-rate-limited', 429).includes('60')) throw new Error('RATE_LIMITED');
  if (!c('error-order-not-in-survey', 409).includes('není ve stavu zaměření')) throw new Error('ORDER_NOT_IN_SURVEY');
  if (!c('error-invalid-region', 400).includes('14 krajů')) throw new Error('INVALID_REGION');
  eq(E.errorText(new E.TlApiError(409, 'Řádek už je uzavřen.', 'ALREADY_CLOSED', {})).includes('uzavřel'), true, 'ALREADY_CLOSED');
  eq(E.errorText(new E.TlApiError(400, 'Vyberte důvod uzavření.', 'INVALID_REASON', {})), 'Vyberte důvod uzavření.', 'validation keeps the backend text');
});

// ---- BFF allow-list: exactly the backend routes the screens use ------------------------------------------------------
check('BFF allow-list: open routes', () => {
  const allowed = [['GET', 'meta'], ['GET', 'people'], ['GET', 'search'], ['GET', 'ovt/day'], ['POST', 'ovt/orders/10000001/b2b'], ['GET', 'ovt/problems'], ['POST', 'ovt/problems/close'], ['POST', 'ovt/problems/nedopadlo'], ['GET', 'ovt/results'], ['GET', 'ovt/results/visits'], ['GET', 'mvt/day'], ['GET', 'mvt/overview'], ['GET', 'mvt/readiness'], ['GET', 'mvt/missing'], ['POST', 'mvt/missing/close'], ['GET', 'mvt/reopens'], ['POST', 'mvt/events/5/reopen'], ['GET', 'mvt/reopen-requests'], ['POST', 'mvt/reopen-requests/5/approve'], ['POST', 'mvt/reopen-requests/5/decline'], ['GET', 'mvt/escalations'], ['POST', 'mvt/escalations/5/resolve'], ['GET', 'mvt/doplatek'], ['POST', 'mvt/doplatek/resolve'], ['GET', 'mvt/rescues'], ['GET', 'mvt/montaz-claims'], ['GET', 'mvt/submissions'], ['GET', 'mvt/submissions/7'], ['POST', 'resolutions/3/undo'], ['GET', 'calls/search'], ['GET', 'review-qr'], ['PUT', 'review-qr/settings'], ['PUT', 'review-qr/defaults'], ['PUT', 'review-qr/regions'], ['POST', 'review-qr/targets'], ['PUT', 'review-qr/targets/4'], ['DELETE', 'review-qr/targets/4'], ['GET', 'review-qr/prompts']];
  for (const [m, p] of allowed) if (!R.matchRoute(m, p.split('/'))) throw new Error(`${m} ${p} should be open`);
});
check('readiness: urgent (today + tomorrow) and the light summary answer without rows', () => {
  const d = P.parseReadiness(data('mvt-readiness'));
  eq(d.urgent.red, 1, 'urgent red'); eq(d.urgent.today.day, '2026-11-19', 'today'); eq(d.urgent.tomorrow.chyba, 1, 'tomorrow red');
  const s = P.parseReadiness(data('mvt-readiness-summary'));
  eq(s.rows.length, 0, 'no rows in the summary'); eq(s.urgent.red, 1, 'summary urgent'); eq(s.badge.show, true, 'summary gate'); eq(s.counts.chyba, 2, 'summary counts');
  eq(P.parseReadiness(data('mvt-readiness-unavailable')).urgent, null, 'unavailable has no urgent');
});
check('readiness route: only the days parameter is forwarded, its value is a small integer', () => {
  const r = R.matchRoute('GET', ['mvt', 'readiness']);
  eq(!!r, true, 'open'); eq(JSON.stringify(r.query), JSON.stringify(['days', 'summary']), 'forwarded parameters'); eq(R.validQueryValue('summary', '1'), true, 'summary 1'); eq(R.validQueryValue('summary', '0'), false, 'summary 0'); eq(R.validQueryValue('summary', 'x'), false, 'summary text');
  eq(R.validQueryValue('days', '14'), true, 'days 14'); eq(R.validQueryValue('days', 'x'), false, 'days text'); eq(R.validQueryValue('days', '-7'), false, 'days negative');
  eq(R.matchRoute('POST', ['mvt', 'readiness']), null, 'POST closed'); eq(R.matchRoute('GET', ['mvt', 'readiness', '1']), null, 'sub-path closed');
});
check('BFF allow-list: everything else is closed (no open relay, no recordings keys)', () => {
  const denied = [['GET', 'orders'], ['POST', 'calls/lookup'], ['GET', 'calls/customer-phones'], ['GET', 'teams'], ['PUT', 'ovt/day'], ['GET', 'resolutions/3/undo'], ['GET', 'mvt/submissions/05'], ['GET', 'mvt/events/5/reopen'], ['GET', 'mvt/reopen-requests/5/approve'], ['POST', 'mvt/reopen-requests'], ['DELETE', 'mvt/reopen-requests'], ['PUT', 'mvt/reopen-requests/5/decline'], ['POST', 'mvt/reopen-requests/05/approve'], ['POST', 'mvt/reopen-requests/5/withdraw'], ['GET', 'mvt/escalations/5/resolve'], ['POST', 'mvt/escalations'], ['DELETE', 'mvt/escalations/5'], ['POST', 'mvt/escalations/05/resolve'], ['DELETE', 'review-qr'], ['GET', 'meta/x'], ['GET', '..'], ['GET', 'ovt/results/%2e%2e']];
  for (const [m, p] of denied) if (R.matchRoute(m, p.split('/'))) throw new Error(`${m} ${p} should be closed`);
});
check('BFF allow-list covers every path the source calls', () => {
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.tsx?$/.test(f.name)) files.push(p); } };
  walk(path.join(root, 'app'));
  let n = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(tlGet|tlSend|send)\(\s*(?:'(POST|PUT|DELETE)',\s*|"(POST|PUT|DELETE)",\s*)?[`'"]([^`'"]+)[`'"]/g)) {
      const method = m[2] ?? m[3] ?? (m[1] === 'tlGet' ? 'GET' : null);
      if (!method) continue;
      const p = m[4].replace(/\$\{[^}]+\}/g, '5').replace(/^\/api\/tl\//, '');
      n++;
      if (!R.matchRoute(method, p.split('/'))) throw new Error(`${path.relative(root, f)}: ${method} ${p} is not in the allow-list`);
    }
  }
  if (n < 20) throw new Error(`only ${n} call sites found, the scan is broken`);
});
check('BFF query values are validated', () => {
  const ok = [['date', '2026-11-16'], ['person', '12'], ['person', 'none'], ['closed', 'only'], ['current', '1'], ['q', 'Novák'], ['side', 'mvt'], ['status', 'failed,partial'], ['bucket', 'closed_no_result'], ['page', '3'], ['includeClosed', '1']];
  for (const [k, v] of ok) if (!R.validQueryValue(k, v)) throw new Error(`${k}=${v} should pass`);
  const bad = [['date', '2026-11-16; DROP'], ['person', '0'], ['person', '1 OR 1=1'], ['closed', 'all'], ['side', 'x'], ['status', 'a/b'], ['page', '-1'], ['unknown', '1'], ['q', 'a\u0000b']];
  for (const [k, v] of bad) if (R.validQueryValue(k, v)) throw new Error(`${k}=${v} should be refused`);
});

// ---- access gate ------------------------------------------------------------------------------------------------------
check('access gate: only the listed pages and API trees exist', () => {
  for (const p of ['/', '/login', '/ovt', '/prehled-dne', '/problematicke-zakazky', '/vysledky', '/recenze-qr', '/mvt', '/mvt/prehled-dne', '/mvt/pripravenost', '/mvt/nedokoncene', '/mvt/opravy', '/mvt/nesedi-doplatek', '/mvt/zapisy', '/mvt/zapisy/12', '/mvt/zachrany', '/mvt/reklamace', '/mvt/eskalace', '/objednavky-s-hovory', '/hotovost', '/hotovost/4', '/zakaznik/201/hovory', '/zakazka/10000011/hovory']) eq(A.isPageEnabled(p), true, p);
  for (const p of ['/tymy', '/klient/123', '/klient/123/hovory', '/hotovost/05', '/hotovost/x', '/hotovost/4/x', '/automat-zf', '/skryte-zakazky', '/kontrola-nemozne-realizace', '/poslane-na-retence', '/mvt/parovani', '/mvt/pripravenost/1', '/mvt/problematicke-zakazky', '/auth', '/mvt/zapisy/05', '/mvt/zapisy/x']) eq(A.isPageEnabled(p), false, p);
  for (const p of ['/api/tl/meta', '/api/calls/orders', '/api/calls/play/ab', '/api/cash/persons', '/api/cash/persons/4', '/api/cash/attachments/9', '/api/cash/status']) eq(A.isApiEnabled(p), true, p);
  for (const p of ['/api/teams', '/api/users', '/api/cash', '/api/cashx/persons', '/api/raynet/office-day-events', '/api/retention-auto-zf/status', '/api/customer-calls/x', '/api/orders-with-calls', '/api/tlx', '/api']) eq(A.isApiEnabled(p), false, p);
});
check('access gate: public auth paths are exact', () => {
  for (const p of ['/api/auth/session', '/api/auth/csrf', '/api/auth/providers', '/api/auth/callback/demaxia', '/api/auth/signin/demaxia', '/api/auth/renew', '/api/auth/sso-logout', '/api/auth/session-expired']) eq(A.isPublicAuthPath(p), true, p);
  for (const p of ['/api/auth', '/api/auth/', '/api/auth/callback/evil', '/api/auth/refresh', '/api/auth/signout/x', '/api/auth/../tl/meta', '/api/auth/session/x', '/api/auth/signin/demaxia/x']) eq(A.isPublicAuthPath(p), false, p);
});
check('callback path cannot leave the host', () => {
  eq(safeCallbackPath('/prehled-dne?date=2026-11-16'), '/prehled-dne?date=2026-11-16', 'relative path kept');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com/x', '/\t/evil.com', '/.//evil.com', 'javascript:alert(1)', '///evil.com']) eq(safeCallbackPath(bad), '/', bad);
});
check('CSRF guard', () => {
  const base = { method: 'POST', origin: 'https://tl.example.cz', referer: null, contentType: 'application/json', hasBody: true, rawUpload: false, hasFileNameHeader: false, appOrigin: 'https://tl.example.cz' };
  eq(checkCsrf(base).ok, true, 'same origin');
  eq(checkCsrf({ ...base, origin: 'https://evil.com' }).ok, false, 'other origin');
  eq(checkCsrf({ ...base, origin: null, referer: null }).ok, false, 'no origin');
  eq(checkCsrf({ ...base, contentType: 'text/plain' }).ok, false, 'form content type');
  eq(checkCsrf({ ...base, method: 'GET', origin: 'https://evil.com' }).ok, true, 'reads are not guarded');
});

// ---- links, Prague days, calendar -------------------------------------------------------------------------------------
check('ERP links', () => {
  eq(L.erpOrderUrl('https://erp.example.cz/', 10000011), 'https://erp.example.cz/orders/10000011', 'order');
  eq(L.erpClaimUrl('https://erp.example.cz', 900), 'https://erp.example.cz/claims/900', 'claim');
  eq(L.erpCustomerUrl('https://erp.example.cz', 201), 'https://erp.example.cz/customers/201', 'customer');
  eq(L.erpEventUrl('https://erp.example.cz', 12, '2026-11-16'), 'https://erp.example.cz/calendar?day=2026-11-16&event=12', 'event');
  eq(L.erpOrderUrl(null, 5), null, 'no base, no link'); eq(L.erpOrderUrl('javascript:alert(1)', 5), null, 'only http(s)');
});
check('every day is a Prague day', () => {
  eq(F.pragueYmd('2026-11-15T23:30:00.000Z'), '2026-11-16', 'winter, 23:30 UTC is the next Prague day');
  eq(F.pragueYmd('2026-07-15T22:30:00.000Z'), '2026-07-16', 'summer');
  eq(F.fmtTime('2026-11-16T10:30:00.000Z'), '11:30', 'winter time');
  eq(F.fmtTime('2026-07-16T10:30:00.000Z'), '12:30', 'summer time');
  eq(F.shiftYmd('2026-11-30', 1), '2026-12-01', 'shift'); eq(F.daysBetween('2026-11-01', '2026-11-16'), 15, 'between'); eq(F.isYmd('2026-02-30'), false, 'not a date');
  eq(F.fmtKc(5000).replace(/\s/g, ' '), '5 000 Kč', 'money');
});
check('day calendar geometry (Prague time, lanes, now marker)', () => {
  const e = (a, b) => ({ startsAt: a, endsAt: b });
  const r = G.visibleHourRange('2026-11-16', [e('2026-11-16T05:30:00.000Z', '2026-11-16T07:00:00.000Z')]);
  eq(r.startHour, 6, 'widened to 6:30 Prague'); eq(r.endExclusive, 19, 'default end');
  const g = G.barGeometry(e('2026-11-16T07:00:00.000Z', '2026-11-16T08:00:00.000Z'), '2026-11-16', 8, 19);
  eq(Math.round(g.leftPct), 0, 'starts at 8:00 Prague'); eq(Math.round(g.widthPct), 9, 'one hour of 11');
  const lanes = G.assignLanes([{ item: 1, start: 0, end: 60, leftPct: 0, widthPct: 1 }, { item: 2, start: 30, end: 90, leftPct: 0, widthPct: 1 }, { item: 3, start: 60, end: 90, leftPct: 0, widthPct: 1 }]);
  eq(lanes.map((l) => l.lane).join(','), '0,1,0', 'overlap gets its own lane');
  eq(G.nowLeftPct('2026-11-15', 8, 19, Date.parse('2026-11-16T10:30:00.000Z')), null, 'now only on its own day');
  eq(Math.round(G.nowLeftPct('2026-11-16', 8, 19, Date.parse('2026-11-16T10:30:00.000Z'))), 32, '11:30 Prague');
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall contract checks passed');
