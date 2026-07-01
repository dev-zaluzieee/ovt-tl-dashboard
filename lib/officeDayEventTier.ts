/**
 * Vizuální vrstva „napojení na náš systém“ pro události přehledu dne (objednávka + stav ADMF exportu).
 */

export type OfficeDayOrderPayload = {
  id: number;
  customerName: string | null;
  source_erp_order_id: number | null;
  /** Chybí u starších odpovědí API — chová se jako „neznámý stav“. */
  admfExportStatus?: 'none' | 'not_exported' | 'exported' | null;
};

export type OfficeDayEventTier =
  | 'no_system'
  /** Zakázka u nás, ale ADMF chybí nebo ještě nebyl úspěšně exportován. */
  | 'pending_admf'
  | 'exported'
  /** `admfExportStatus` se z API nepodařilo doplnit. */
  | 'status_unknown';

/** Rozhodne úroveň pro barvení pruhů a štítků. */
export function getOfficeDayEventTier(
  order: OfficeDayOrderPayload | null,
  orderLinkingAvailable: boolean
): OfficeDayEventTier {
  if (!orderLinkingAvailable || order == null) {
    return 'no_system';
  }
  const s = order.admfExportStatus ?? null;
  if (s == null) {
    return 'status_unknown';
  }
  if (s === 'exported') {
    return 'exported';
  }
  return 'pending_admf';
}

/** Kompaktní text do seznamu a pruhů. */
export function officeDayEventTierShortLabelCs(tier: OfficeDayEventTier): string {
  switch (tier) {
    case 'no_system':
      return 'Bez zakázky v portálu';
    case 'pending_admf':
      return 'Bez exportu ADMF';
    case 'exported':
      return 'ADMF exportován';
    case 'status_unknown':
      return 'Stav ADMF neznámý';
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

/** Delší popis (legenda, modal). */
export function officeDayEventTierLabelCs(tier: OfficeDayEventTier): string {
  switch (tier) {
    case 'no_system':
      return 'Bez zakázky v portálu';
    case 'pending_admf':
      return 'Zakázka u nás — ADMF není exportovaný';
    case 'exported':
      return 'ADMF exportován (Raynet / ERP)';
    case 'status_unknown':
      return 'Stav ADMF se nepodařilo načíst';
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

/** Tailwind třídy pro ohraničení pruhu události v kalendáři. */
export function officeDayEventTierBarClass(tier: OfficeDayEventTier): string {
  switch (tier) {
    case 'no_system':
      return 'border-slate-400/70 bg-slate-100 text-slate-900 hover:bg-slate-200/90';
    case 'pending_admf':
      return 'border-amber-500 bg-amber-50 text-amber-950 hover:bg-amber-100';
    case 'exported':
      return 'border-emerald-600 bg-emerald-50 text-emerald-950 hover:bg-emerald-100';
    case 'status_unknown':
      return 'border-orange-500 bg-orange-50 text-orange-950 hover:bg-orange-100';
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

/** Kompaktní štítek (seznam / modal). */
export function officeDayEventTierBadgeClass(tier: OfficeDayEventTier): string {
  switch (tier) {
    case 'no_system':
      return 'border-slate-300 bg-slate-100 text-slate-800';
    case 'pending_admf':
      return 'border-amber-400 bg-amber-50 text-amber-950';
    case 'exported':
      return 'border-emerald-600 bg-emerald-50 text-emerald-900';
    case 'status_unknown':
      return 'border-orange-400 bg-orange-50 text-orange-950';
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}
