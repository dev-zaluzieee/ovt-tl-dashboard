/**
 * Plain-language explanation of one recorded export step ("Co se kam zapsalo")
 * for team leaders — the same wording the montér saw in the preview and the
 * report, reconstructed from the step's request payload. Never shows raw
 * field codes; unknown keys fall back to the code so nothing is hidden.
 */
import { fmtKc } from './shared';

export interface StepLike {
  target: string;
  status: string;
  request_payload: unknown;
  response_body: unknown;
  response_status: number | null;
  error_code: string | null;
  error_message: string | null;
}

export interface StepExplanation {
  /** System + object, e.g. "ERP — zakázka #84084". */
  title: string;
  /** "Field → value" lines, already humanised. */
  lines: string[];
  /** Quoted free text (comments). */
  quote?: string;
  /** Why nothing happened / what failed, in plain words. */
  note?: string;
  /** The step was added by hand after the fact (data repair). */
  backfill?: string;
}

// ── Raynet custom fields ─────────────────────────────────────────────────────
const RAYNET_CF: Record<string, string> = {
  Monter_12530: 'Montér',
  Technik_b3586: 'Technik',
  Stav_zakaz_8b2d4: 'Stav zakázky',
  Vybrano_ko_4ba23: 'Vybráno kolik',
  Vybrano_ko_85b19: 'Vybráno kolik (z reklamací)',
  Doplatek_u_51912: 'Způsob úhrady',
  Zpusob_uhr_09625: 'Způsob úhrady (reklamace)',
  Sleva_MVT_62bd9: 'Sleva (MVT)',
  Sleva_MVT_422f2: 'Sleva (MVT, reklamace)',
  Info_ke_sl_e80f2: 'Info ke slevě',
  Info_ke_sl_e9d6d: 'Info ke slevě (reklamace)',
  Info_k_zac_82b3e: 'Info k záchraně',
  Dokonceno_1d4b3: 'Dokončeno',
};
const RAYNET_MONEY = new Set(['Vybrano_ko_4ba23', 'Vybrano_ko_85b19', 'Sleva_MVT_62bd9', 'Sleva_MVT_422f2']);

// ── ERP order columns / values ──────────────────────────────────────────────
const ERP_ORDER_STATUS: Record<string, string> = { 'dokoncena-montaz': 'Dokončená montáž', reklamace: 'Reklamace', natrasovani: 'Natrasování', 'objednavka-dokoncena': 'Objednávka dokončena' };
const ERP_COL: Record<string, string> = {
  dokoncena_montaz: 'Dokončena montáž?',
  servis_dokoncen: 'Dokončeno? servis',
  proc_nedopadl_servis: 'Proč ne? servis',
  proc_nedopadla_montaz: 'Proč ne/výhrada montáž',
  datum_montaze: 'Dat. montáže',
  cas_montaze: 'Čas montáže',
  sedi_doplatek: 'Sedí doplatek?',
  zpusob_doplatku: 'Způsob doplatku',
  reklamace_datum_vyreseni: 'Vyřešeno dne',
  reklamace_druh_kompenzace: 'Druh kompenzace',
  reklamace_cena_kompenzace: 'Částka kompenzace',
  reklamace_zpusob_podani: 'Podání',
  reklamace_druh: 'Druh reklamace',
  reklamace_opakovana: 'Opakovaná reklamace',
  reklamace_prvni_date: 'Datum reklamace',
  reklamace_datum_montaze: 'Datum montáže',
  reklamace_datum_zamereni: 'Datum zaměření',
  reklamace_blocker: 'Na co čekám',
};
const ERP_VAL: Record<string, string> = {
  ano: 'Ano', ne: 'Ne', zkontroluj: 'ZKONTROLUJ',
  hotove: 'Hotově', 'qr-kod': 'QR kód', terminalem: 'Terminálem', prevodem: 'Převodem',
  reklamace: 'Reklamace', 'chybi-zbozi': 'Chybí zboží', 'chybi-komponenty': 'Chybí komponenty', 'zak-nezastizen': 'Zák. nezastižen',
  'bude-preplanovano': 'Bude přeplánováno', 'nestihl-dokoncit-bude-preplanovano': 'Nestihl dokončit – bude přeplánováno', listy: 'Lišty',
  sleva_monter: 'Sleva montér', placena_oprava: 'Placená oprava', zjisteno_monterem: 'Zjištěno montérem', servis: 'Servis',
  prvni: 'První', druha: 'Druhá', treti: 'Třetí', ctvrta: 'Čtvrtá', pata: 'Pátá', info_od_montera: 'Info od montéra',
  'reklamace-nova': 'Nová', 'reklamace-proveruje-se': 'Prověřuje se', 'reklamace-vyresena': 'Vyřešena',
};
const SKIP_REASON: Record<string, string> = {
  'no erp_order_id': 'Objednávka nemá ERP zakázku — kancelář doplní ručně.',
  'no erp write for outcome': 'Pro tento výsledek se v tomto systému nic nemění.',
  'no complaint found': 'K události se nepodařilo dohledat reklamaci v ERP — uzavře ji kancelář.',
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fmtD = (v: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : v;
};
const erpValue = (slug: string, v: unknown): string => {
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtD(s);
  if (slug === 'cas_montaze') return s.slice(0, 5);
  if (slug === 'reklamace_cena_kompenzace') return fmtKc(Number(s));
  return ERP_VAL[s] ?? s;
};

export function explainStep(s: StepLike): StepExplanation {
  const rp = isRecord(s.request_payload) ? s.request_payload : {};
  const rb = isRecord(s.response_body) ? s.response_body : {};
  const backfill = typeof rp.backfill === 'string' ? rp.backfill : undefined;
  const skipped = s.status === 'SKIPPED';
  const noteFromError = s.error_message ? SKIP_REASON[s.error_message] ?? s.error_message : undefined;

  switch (s.target) {
    case 'raynet_event': {
      const cf = isRecord(rp.customFields) ? rp.customFields : {};
      const lines = Object.entries(cf).map(([k, v]) => {
        const label = RAYNET_CF[k] ?? k;
        if (v === null) return `${label} → vymazáno`;
        if (typeof v === 'boolean') return `${label} → ${v ? 'Ano' : 'Ne'}`;
        if (typeof v === 'number' && RAYNET_MONEY.has(k)) return `${label} → ${fmtKc(v)}`;
        return `${label} → ${String(v)}`;
      });
      if (rp.status === 'COMPLETED') lines.push(`Událost označena jako dokončená${typeof rp.completed === 'string' ? ` (${rp.completed.slice(11, 16)})` : ''}`);
      return { title: 'Raynet — událost', lines, note: skipped || s.status === 'FAILED' ? noteFromError : undefined, backfill };
    }
    case 'erp_order': {
      const id = rp.erpOrderId != null ? ` #${String(rp.erpOrderId)}` : '';
      const lines: string[] = [];
      if (typeof rp.status === 'string') lines.push(`Stav → ${ERP_ORDER_STATUS[rp.status] ?? rp.status}`);
      if (isRecord(rp.revert) && typeof rp.revert.status === 'string') lines.push(`Stav vrácen → ${ERP_ORDER_STATUS[rp.revert.status] ?? rp.revert.status}`);
      const cols = isRecord(rp.column_values) ? rp.column_values : {};
      for (const [k, v] of Object.entries(cols)) lines.push(`${ERP_COL[k] ?? k} → ${erpValue(k, v)}`);
      const mon = isRecord(rp.monteri) ? rp.monteri : null;
      const asg = isRecord(rp.assignments) ? rp.assignments : isRecord(rb.assignments) ? rb.assignments : null;
      if (mon && Array.isArray(mon.names) && mon.names.length) {
        const names = (mon.names as unknown[]).map(String).join(', ');
        if (asg && asg.changed === false) lines.push(`Montér → ${names} (beze změny)`);
        else if (asg && Array.isArray(asg.before) && (asg.before as unknown[]).length === 0) lines.push(`Montér → ${names} (doplněn, dosud nebyl přiřazen)`);
        else if (asg) lines.push(`Montér → ${names} (nahradil dosavadní přiřazení)`);
        else lines.push(`Montér → ${names}`);
        if (Array.isArray(mon.unmapped) && (mon.unmapped as unknown[]).length) lines.push(`⚠ ERP nezná montéra: ${(mon.unmapped as unknown[]).map(String).join(', ')}`);
      }
      return { title: `ERP — zakázka${id}`, lines, note: skipped || s.status === 'FAILED' ? noteFromError : undefined, backfill };
    }
    case 'erp_complaint': {
      const lines: string[] = [];
      let title = 'ERP — reklamace';
      if (isRecord(rp.create)) {
        const created = typeof rb.id === 'number' ? rb.id : null;
        title = created != null ? `ERP — nová reklamace #${created}` : 'ERP — nová reklamace';
        const c = rp.create;
        lines.push(`Založena pod zakázkou #${String(c.parent_order_id ?? '?')}`);
        if (typeof c.status === 'string') lines.push(`Stav → ${ERP_VAL[c.status] ?? c.status}`);
        const cols = isRecord(c.column_values) ? c.column_values : {};
        for (const [k, v] of Object.entries(cols)) lines.push(`${ERP_COL[k] ?? k} → ${erpValue(k, v)}`);
        if (typeof c.notes === 'string') return { title, lines, quote: c.notes, backfill };
      } else if (rp.reuse != null) {
        title = `ERP — reklamace #${String(rp.reuse)}`;
        lines.push('Ponechána (oprava zápisu, reklamace už existovala)');
      } else if (rp.flagExisting != null) {
        title = `ERP — reklamace #${String(rp.flagExisting)}`;
        lines.push('Označena k posouzení — výsledek už není reklamace');
        if (typeof rp.reklamace_blocker === 'string') lines.push(`Na co čekám → ${ERP_VAL[rp.reklamace_blocker] ?? rp.reklamace_blocker}`);
      } else {
        if (rp.erpComplaintId != null) title = `ERP — reklamace #${String(rp.erpComplaintId)}`;
        if (typeof rp.status === 'string') lines.push(`Stav → ${ERP_VAL[rp.status] ?? rp.status}`);
        const cols = isRecord(rp.column_values) ? rp.column_values : {};
        for (const [k, v] of Object.entries(cols)) lines.push(`${ERP_COL[k] ?? k} → ${erpValue(k, v)}`);
      }
      return { title, lines, note: skipped || s.status === 'FAILED' ? noteFromError : undefined, backfill };
    }
    case 'erp_comment': {
      const kind = rp.targetKind === 'complaint' ? 'reklamace' : 'zakázka';
      const id = rp.erpOrderId != null ? ` #${String(rp.erpOrderId)}` : '';
      const lines: string[] = [];
      if (rp.viaCreateNotes) lines.push('Zapsán jako první komentář nové reklamace');
      return { title: `ERP — komentář na ${kind}${id}`, lines, quote: typeof rp.message === 'string' ? rp.message : typeof rp.komentar === 'string' ? rp.komentar : undefined, note: skipped || s.status === 'FAILED' ? noteFromError : undefined, backfill };
    }
    case 'finance_cash': {
      const amount = typeof rp.amountCzk === 'number' ? rp.amountCzk : null;
      const method = typeof rp.method === 'string' && rp.method ? rp.method : null;
      const lines: string[] = [];
      if (skipped) lines.push(method ? `Platba ${method} — bez pohybu hotovosti` : 'Nic se nevybíralo — bez pohybu hotovosti');
      else if (amount != null) lines.push(`${s.status === 'SUCCESS' ? '+' : ''}${fmtKc(amount)} ${s.status === 'SUCCESS' ? 'přidáno do hotovosti montéra' : 'se nepodařilo zapsat'}`);
      if (rp.reused === true) lines.push('Původní příjem ponechán (částka se nezměnila)');
      if (isRecord(rp.voided)) lines.push(rp.voided.ok ? `Původní příjem #${String(rp.voided.entryId)} stornován` : `⚠ Původní příjem #${String(rp.voided.entryId)} se nepodařilo stornovat: ${String(rp.voided.error ?? '')}`);
      if (typeof rp.ledgerEntryId === 'number') lines.push(`Záznam v pokladně #${rp.ledgerEntryId}`);
      return { title: 'Hotovost — pokladna montéra', lines, note: s.status === 'FAILED' ? s.error_message ?? undefined : undefined, backfill };
    }
    case 'raynet_attachment':
      return { title: 'Raynet — přílohy', lines: [], note: noteFromError, backfill };
    default:
      return { title: s.target, lines: [], note: noteFromError, backfill };
  }
}
