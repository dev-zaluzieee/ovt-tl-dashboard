/**
 * Odkaz na zakázku v kancelářském portálu (ceníky-2 frontend, `/objednavka/{id}`).
 * Přepis přes NEXT_PUBLIC_OFFICE_PORTAL_BASE_URL (bez koncového lomítka);
 * výchozí https://orders.systeeem.cz.
 */
export function officePortalOrderDeepLink(orderId: string | number): string {
  const base =
    (typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_OFFICE_PORTAL_BASE_URL?.replace(/\/$/, '')) ||
    'https://orders.systeeem.cz';
  return `${base}/objednavka/${encodeURIComponent(String(orderId))}`;
}
