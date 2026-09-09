/** Mirrors finance-dashboard `PersonBalance` (+ raynet_user_id) and `LedgerEntry`. */
export interface CashPerson {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  active: boolean;
  raynet_user_id: number | null;
  balance_czk: string;
  entry_count: number;
  last_entry_at: string | null;
  overdue_czk: string;
  held_since: string | null;
  inventura_at: string | null;
}

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
  raynet_export_status: string | null;
  erp_export_status: string | null;
  customer_name: string | null;
  created_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  recon_status: 'pending' | 'reconciled' | 'discrepancy' | null;
  expense_category: string | null;
  /** bank_deposit: 'bank_card' (bankomat) or 'post' (Česká pošta). */
  deposit_channel?: 'bank_card' | 'post' | null;
  declared_variable_symbol?: string | null;
  declared_gross_czk?: string | null;
  fee_czk?: string | null;
  fee_deducted?: boolean | null;
  related_entry_id?: number | null;
  attachments: { id: number; filename: string }[];
}

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  opening_balance: 'Počáteční stav',
  cash_received: 'Přijatá záloha',
  bank_deposit: 'Vklad do banky',
  expense: 'Nákup / výdaj',
  inventura: 'Inventura (fyzický stav)',
};

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'ručně (finance)',
  ceniky_sync: 'tablet (ADMF)',
  ovt_app: 'tablet (OVT)',
  mvt_app: 'MVT app',
  sheet_import: 'import ze sheetu',
  bank_api: 'banka',
  'system:cash_sync': 'systém',
};

/** Sign convention copied from finance: inflows +, outflows −, inventura = anchor. */
export const ENTRY_SIGN: Record<string, 1 | -1> = {
  opening_balance: 1,
  cash_received: 1,
  inventura: 1,
  bank_deposit: -1,
  expense: -1,
};

export function fmtCzk(n: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n);
}
export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' });
}
/** Ledger row timestamp — date + time, so same-day entries (e.g. an inventura) are distinguishable. */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
}
export function personName(p: { display_name: string | null; email: string }): string {
  return (p.display_name && p.display_name.trim()) || p.email.split('@')[0] || p.email;
}
