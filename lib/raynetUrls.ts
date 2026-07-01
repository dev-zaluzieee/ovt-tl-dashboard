/**
 * Opens a Raynet CRM event detail in the browser (same pattern as frontend-admin).
 */
export function raynetEventDeepLink(eventId: string | number): string {
  return `https://app.raynet.cz/demaxia/?view=DetailView&en=Event&ei=${encodeURIComponent(String(eventId))}`;
}

/** Opens a Raynet BusinessCase (obchodní případ) detail. */
export function raynetBusinessCaseDeepLink(bcId: string | number): string {
  return `https://app.raynet.cz/demaxia/?view=DetailView&en=BusinessCase&ei=${encodeURIComponent(String(bcId))}`;
}

/** Opens a Raynet Company (zákazník) detail. */
export function raynetCompanyDeepLink(companyId: string | number): string {
  return `https://app.raynet.cz/demaxia/?view=DetailView&en=Company&ei=${encodeURIComponent(String(companyId))}`;
}
