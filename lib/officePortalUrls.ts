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

/**
 * Odkaz na historii/časovou osu zakázky v kancelářském portálu
 * (`/objednavka/{id}/historie`) — kde je nově vidět i retenční stopa.
 */
export function officePortalOrderHistoryDeepLink(orderId: string | number): string {
  return `${officePortalOrderDeepLink(orderId)}/historie`;
}

/**
 * Odkaz na retenční OP (obchodní případ) v kancelářském portálu
 * (`/retencni-portal/op/{orderId}`). TL dashboard nemá vlastní /retencni-portal
 * route, takže proklik na zakázku musí mířit absolutně do office portálu.
 */
export function officePortalRetentionOpDeepLink(orderId: string | number): string {
  const base =
    (typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_OFFICE_PORTAL_BASE_URL?.replace(/\/$/, '')) ||
    'https://orders.systeeem.cz';
  return `${base}/retencni-portal/op/${encodeURIComponent(String(orderId))}`;
}
