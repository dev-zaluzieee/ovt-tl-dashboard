// Validates recorded backend answers (scripts/fixtures, shapes from ceniky-2 readonly-docs L7) against the app's parsers, and
// checks the app's own rules (BFF allow-list, access gate, callback paths, CSRF, error texts, Prague days).
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
const names = ['tl-parse', 'tl-errors', 'tl-routes', 'safe-callback', 'portal-access', 'csrf', 'links', 'format', 'dayGrid'];
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
check('meta', () => { const m = P.parseMeta(data('meta')); eq(m.today, '2026-11-16', 'today'); eq(m.erpWebBaseUrl, 'https://erp.example.cz', 'erp base'); eq(m.vocabulary.ovtCloseReasons.jine.includes('Jiné'), true, 'reasons'); eq(m.vocabulary.quietStates.length, 3, 'quiet'); });
check('people', () => { eq(P.parsePeople(data('people-ovt')).length, 3, 'people'); eq(P.parsePeople(data('people-ovt'))[2].active, false, 'inactive'); });
check('ovt day: events, groups (no owner last), tiles', () => { const d = P.parseOvtDay(data('ovt-day')); eq(d.events.length, 7, 'events'); eq(d.groups.at(-1).person, null, 'no owner last'); eq(d.tiles.closed, 3, 'closed'); eq(d.qIgnored, false, 'qIgnored default'); eq(d.events[1].b2b, true, 'b2b'); eq(d.events[4].tabletDraft, true, 'draft'); });
check('mvt day: state counts, assignment source, app state', () => { const d = P.parseMvtDay(data('mvt-day')); eq(d.stateCounts.overdue, 1, 'overdue'); eq(d.events[0].app.status, 'success', 'app'); eq(d.events.find((e) => e.id === 24).people[0].source, 'assignment', 'assignment'); eq(d.events.find((e) => e.id === 25).result.current, false, 'old result'); });
check('problems: kinds, closed row carries resolution', () => { const d = P.parseProblems(data('ovt-problems')); eq(d.rows.length, 5, 'rows'); eq(d.rows[4].resolution.reason, 'zkontrolovano', 'resolution'); eq(d.counts.bez_vysledku, 2, 'counts'); eq(d.rows[1].subState.code, 'ovt_opravil', 'subState'); eq(d.truncated, true, 'truncated'); eq(d.qIgnored, true, 'qIgnored'); eq(d.rows[3].valueSDph, null, 'no ADMF value'); });
check('results + drill-down', () => { const d = P.parseResults(data('ovt-results')); eq(d.rows[2].person, null, 'no owner row'); eq(d.rows[0].nedopadloReasons[0].reason, 'vysoka_cena', 'reason'); eq(d.bucketLabels.closed_no_result, 'Uzavřeno bez výsledku', 'label'); eq(P.parseVisits(data('ovt-results-visits')).visits.length, 1, 'visits'); });
check('missing', () => { const d = P.parseMissing(data('mvt-missing')); eq(d.owing[0].count, 2, 'owing'); eq(d.recent[1].resolution.reason, 'pripomenuto', 'handled'); eq(d.closedOutside.count, 12, 'closedOutside'); eq(d.closeReasons.netyka_se, 'Netýká se', 'reasons'); });
check('reopens: before and after', () => { const d = P.parseReopens(data('mvt-reopens')); eq(d.rows[0].after, null, 'open'); eq(d.rows[1].after.paymentMethodLabel, 'Fakturou', 'after'); eq(d.rows[1].changes.length, 2, 'changes'); });
check('doplatek', () => { const d = P.parseDoplatek(data('mvt-doplatek')); eq(d.rows[1].invoice, true, 'invoice'); eq(d.rows[1].invoiceCheck, 'disabled', 'check'); eq(d.rows[2].resolution.note, 'Sleva domluvena', 'resolution'); eq(d.invoiceCheckEnabled, false, 'flag'); eq(d.rows[0].orderCreatedAt, '2026-10-28T08:15:00.000Z', 'orderCreatedAt'); });
check('rescues, montaz claims', () => { eq(P.parseRescues(data('mvt-rescues')).summary.claimed, 1, 'claimed'); const c = P.parseMontazClaims(data('mvt-montaz-claims')); eq(c.rows[2].followUp.id, 500, 'followUp'); eq(c.rows[1].claim, null, 'no claim'); });
check('submissions list + detail', () => { eq(P.parseSubmissionList(data('mvt-submissions')).total, 3, 'total'); const d = P.parseSubmissionDetail(data('mvt-submission-detail')); eq(d.steps[1].code, 'ORDER_LOCKED', 'step code'); eq(d.warnings.length, 1, 'warnings'); });
check('overview', () => { const d = P.parseOverview(data('mvt-overview')); eq(d.missing.owing.length, 2, 'owing'); eq(d.submissionProblems.count, 2, 'problems'); });
check('action with steps: done, and a failure that arrives as HTTP 200', () => {
  const d = P.parseAction(data('action-done'));
  eq(d.outcome, 'done', 'done'); eq(d.steps.length, 5, 'nedopadlo has five steps (columns, status, tags, comment, visit_result)'); eq(d.steps[2].name, 'tags', 'tags step');
  const rt = P.parseAction(data('action-retry-done')); eq(rt.steps[0].detail, 'beze změny (už zapsáno předchozím pokusem)', 'retry detail kept'); eq(rt.steps.every((x) => x.status === 'ok'), true, 'retry steps ok');
  const pt = P.parseAction(data('action-partial')); eq(pt.outcome, 'partial', 'partial'); eq(pt.steps[2].status, 'failed', 'non-stopping step failed');
  const f = P.parseAction(data('action-failed-locked'));
  eq(f.outcome, 'failed', 'failed'); eq(f.steps[0].code, 'ORDER_LOCKED', 'code'); eq(f.steps[1].status, 'pending', 'pending after a stopping step'); eq(f.steps.length, 5, 'five steps');
});
check('calls lookup + customer phones', () => { const o = P.parseCallsOrders(data('calls-lookup')); eq(o[0].phones[1].key, '603333444', 'key'); eq(o[0].customerId, 201, 'customerId'); eq(P.parseCustomerPhones(data('customer-phones')).orders.length, 1, 'orders'); });
check('review-qr + prompts', () => { const d = P.parseReviewQr(data('review-qr')); eq(d.regions.length, 3, 'regions'); eq(d.regions[0].ovts[0].userId, 1, 'ovt'); eq(d.outsideRegions[0].reason, 'no_home_kraj', 'outside'); eq(d.targets[2].active, false, 'inactive target'); const p = P.parsePrompts(data('review-qr-prompts')); eq(p.prompts[0].erpOrderId, 10000011, 'erp order'); eq(p.statsByRegion[1].key, null, 'no region'); });

check('wrong shapes are refused (named field)', () => {
  const bad = fx('ovt-day').data; delete bad.tiles; throws(() => P.parseOvtDay(bad), 'no tiles');
  const b2 = fx('ovt-day').data; b2.events[0].state = 'closed'; throws(() => P.parseOvtDay(b2), 'state as text');
  const b3 = fx('action-done').data; b3.outcome = 'success'; throws(() => P.parseAction(b3), 'unknown outcome');
  const b4 = fx('action-done').data; b4.steps[0].status = 'SUCCESS'; throws(() => P.parseAction(b4), 'unknown step status');
  const b5 = fx('meta').data; delete b5.vocabulary.ovtCloseReasons; throws(() => P.parseMeta(b5), 'no vocabulary');
  try { P.parseOvtDay(bad); } catch (e) { if (!String(e.message).includes('tiles')) throw new Error('error does not name the field'); }
});

// ---- errors in Czech ------------------------------------------------------------------------------------------------
const apiErr = (name, status) => { const b = fx(name); return new E.TlApiError(status, b.message, b.code, b); };
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
  const allowed = [['GET', 'meta'], ['GET', 'people'], ['GET', 'search'], ['GET', 'ovt/day'], ['POST', 'ovt/orders/10000001/b2b'], ['GET', 'ovt/problems'], ['POST', 'ovt/problems/close'], ['POST', 'ovt/problems/nedopadlo'], ['GET', 'ovt/results'], ['GET', 'ovt/results/visits'], ['GET', 'mvt/day'], ['GET', 'mvt/overview'], ['GET', 'mvt/missing'], ['POST', 'mvt/missing/close'], ['GET', 'mvt/reopens'], ['POST', 'mvt/events/5/reopen'], ['GET', 'mvt/doplatek'], ['POST', 'mvt/doplatek/resolve'], ['GET', 'mvt/rescues'], ['GET', 'mvt/montaz-claims'], ['GET', 'mvt/submissions'], ['GET', 'mvt/submissions/7'], ['POST', 'resolutions/3/undo'], ['GET', 'calls/search'], ['GET', 'review-qr'], ['PUT', 'review-qr/settings'], ['PUT', 'review-qr/defaults'], ['PUT', 'review-qr/regions'], ['POST', 'review-qr/targets'], ['PUT', 'review-qr/targets/4'], ['DELETE', 'review-qr/targets/4'], ['GET', 'review-qr/prompts']];
  for (const [m, p] of allowed) if (!R.matchRoute(m, p.split('/'))) throw new Error(`${m} ${p} should be open`);
});
check('BFF allow-list: everything else is closed (no open relay, no recordings keys)', () => {
  const denied = [['GET', 'orders'], ['POST', 'calls/lookup'], ['GET', 'calls/customer-phones'], ['GET', 'teams'], ['PUT', 'ovt/day'], ['GET', 'resolutions/3/undo'], ['GET', 'mvt/submissions/05'], ['GET', 'mvt/events/5/reopen'], ['DELETE', 'review-qr'], ['GET', 'meta/x'], ['GET', '..'], ['GET', 'ovt/results/%2e%2e']];
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
  const ok = [['date', '2026-11-16'], ['person', '12'], ['person', 'none'], ['closed', 'only'], ['current', '1'], ['q', 'Novák'], ['side', 'mvt'], ['status', 'failed,partial'], ['bucket', 'closed_no_result'], ['page', '3']];
  for (const [k, v] of ok) if (!R.validQueryValue(k, v)) throw new Error(`${k}=${v} should pass`);
  const bad = [['date', '2026-11-16; DROP'], ['person', '0'], ['person', '1 OR 1=1'], ['closed', 'all'], ['side', 'x'], ['status', 'a/b'], ['page', '-1'], ['unknown', '1'], ['q', 'a\u0000b']];
  for (const [k, v] of bad) if (R.validQueryValue(k, v)) throw new Error(`${k}=${v} should be refused`);
});

// ---- access gate ------------------------------------------------------------------------------------------------------
check('access gate: only the listed pages and API trees exist', () => {
  for (const p of ['/', '/login', '/ovt', '/prehled-dne', '/problematicke-zakazky', '/vysledky', '/recenze-qr', '/mvt', '/mvt/prehled-dne', '/mvt/nedokoncene', '/mvt/opravy', '/mvt/nesedi-doplatek', '/mvt/zapisy', '/mvt/zapisy/12', '/mvt/zachrany', '/mvt/reklamace', '/objednavky-s-hovory', '/zakaznik/201/hovory', '/zakazka/10000011/hovory']) eq(A.isPageEnabled(p), true, p);
  for (const p of ['/tymy', '/klient/123', '/klient/123/hovory', '/hotovost', '/hotovost/4', '/automat-zf', '/skryte-zakazky', '/kontrola-nemozne-realizace', '/poslane-na-retence', '/mvt/parovani', '/mvt/problematicke-zakazky', '/auth', '/mvt/zapisy/05', '/mvt/zapisy/x']) eq(A.isPageEnabled(p), false, p);
  for (const p of ['/api/tl/meta', '/api/calls/orders', '/api/calls/play/ab']) eq(A.isApiEnabled(p), true, p);
  for (const p of ['/api/teams', '/api/users', '/api/cash/persons', '/api/raynet/office-day-events', '/api/retention-auto-zf/status', '/api/customer-calls/x', '/api/orders-with-calls', '/api/tlx', '/api']) eq(A.isApiEnabled(p), false, p);
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
