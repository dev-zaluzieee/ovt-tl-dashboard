/**
 * Links into the ERP web. The base comes from the backend (`meta.erpWebBaseUrl`, from `ERPCZ_WEB_BASE_URL`); when it is
 * not set (or not http/https) there is no link, never a guessed one. Paths as the ERP web has them: `/orders/:id`,
 * `/claims/:id`, `/customers/:id`, `/calendar?day=YYYY-MM-DD&event=:id`.
 */

function base(b: string | null | undefined): string | null {
  if (!b || !/^https?:\/\//i.test(b)) return null;
  return b.replace(/\/+$/, '');
}

export function erpOrderUrl(b: string | null | undefined, orderId: number | null | undefined): string | null {
  const x = base(b);
  return x && orderId ? `${x}/orders/${orderId}` : null;
}

export function erpClaimUrl(b: string | null | undefined, claimId: number | null | undefined): string | null {
  const x = base(b);
  return x && claimId ? `${x}/claims/${claimId}` : null;
}

export function erpCustomerUrl(b: string | null | undefined, customerId: number | null | undefined): string | null {
  const x = base(b);
  return x && customerId ? `${x}/customers/${customerId}` : null;
}

export function erpEventUrl(b: string | null | undefined, eventId: number, day: string | null | undefined): string | null {
  const x = base(b);
  if (!x) return null;
  return `${x}/calendar?${day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `day=${day}&` : ''}event=${eventId}`;
}
