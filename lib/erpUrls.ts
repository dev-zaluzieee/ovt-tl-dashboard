/**
 * Odkaz na zakázku v ERP (systeeem) — stejná konvence jako `externalUrl('erp', …)` ve frontend-admin.
 * Volitelně přepište přes NEXT_PUBLIC_ERP_ORDERS_BASE_URL (např. https://systeeem.cz/orders bez koncového lomítka).
 */
export function erpOrderDeepLink(erpOrderId: string | number): string {
  const base =
    (typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_ERP_ORDERS_BASE_URL?.replace(/\/$/, '')) ||
    'https://systeeem.cz/orders';
  return `${base}/${encodeURIComponent(String(erpOrderId))}`;
}
