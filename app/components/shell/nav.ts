export type Side = 'ovt' | 'mvt';

export interface NavItem {
  href: string;
  label: string;
  description: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

const HOVORY: NavItem = { href: '/objednavky-s-hovory', label: 'Hovory', description: 'Objednávky s hovory a historie hovorů zákazníka: přehrání nahrávky a AI analýza.' };

const HOTOVOST: NavItem = { href: '/hotovost', label: 'Hotovost', description: 'Kolik hotovosti mají lidé v terénu u sebe, co je po termínu a kdo čeká na inventuru. Jen ke čtení.' };

/** Navigation per side (no teams). Same groups on both sides so a team leader finds things in the same place. */
export const NAV: Record<Side, NavGroup[]> = {
  ovt: [
    {
      label: 'Den',
      items: [
        { href: '/prehled-dne', label: 'Přehled dne', description: 'Zaměření dne po jednotlivých OVT: kalendář a seznam, stav každé návštěvy, B2B zakázky.' },
        { href: '/problematicke-zakazky', label: 'Problematické zakázky', description: 'Zaměření bez výsledku, nedopadlo a zakázky vrácené OVT k dořešení. Uzavření s důvodem a zpět.' },
      ],
    },
    {
      label: 'Lidé',
      items: [
        { href: '/vysledky', label: 'Výsledky', description: 'Počty zaměření podle výsledku na jednoho OVT a období, s rozpadem na jednotlivé návštěvy.' },
        { href: '/recenze-qr', label: 'Recenze QR', description: 'QR na recenzi, který tablet ukáže po uzavření zakázky: zapnutí, výchozí QR, QR podle krajů, cíle, odpovědi.' },
      ],
    },
    { label: 'Zákazník', items: [HOVORY] },
    { label: 'Hotovost', items: [HOTOVOST] },
  ],
  mvt: [
    {
      label: 'Den',
      items: [
        { href: '/mvt', label: 'Přehled', description: 'Co potřebuje rozhodnutí: chybějící výsledky, opravy, nesedící doplatky, reklamace z montáží, zápisy s problémem.' },
        { href: '/mvt/prehled-dne', label: 'Přehled dne', description: 'Montáže, servisy a reklamace dne po montérech se stavem z ERP a z aplikace montérů.' },
        { href: '/mvt/pripravenost', label: 'Připravenost montáží', description: 'Naplánované montáže, servisy a reklamace, kterým chybí formuláře, přílohy, adresa, montér nebo zboží. Jen ke čtení.' },
        { href: '/mvt/nedokoncene', label: 'Chybí výsledek', description: 'Návštěvy po termínu bez výsledku; kdo dluží výsledek; co bylo uzavřeno mimo aplikaci.' },
        { href: '/mvt/opravy', label: 'Opravy', description: 'Návštěvy otevřené k opravě: kdo a proč, výsledek před a po.' },
        { href: '/mvt/eskalace', label: 'Z financí', description: 'Návštěvy, které finance eskalovaly vedoucímu týmu montérů; vyřešení s poznámkou.' },
        { href: '/mvt/nesedi-doplatek', label: 'Nesedí doplatek', description: 'Vybraná částka se liší od očekávané nebo platba fakturou; uzavření s důvodem.' },
      ],
    },
    {
      label: 'Historie',
      items: [
        { href: '/mvt/zapisy', label: 'Zápisy', description: 'Každé odeslání výsledku z aplikace montérů a co se kam zapsalo.' },
        { href: '/mvt/zachrany', label: 'Záchrany', description: 'Montáže dokončené se záchranou, sleva a zda po nich přišla reklamace.' },
        { href: '/mvt/reklamace', label: 'Reklamace z montáží', description: 'Montáže nedokončené a co z nich vzniklo: reklamace a navazující návštěva.' },
      ],
    },
    { label: 'Zákazník', items: [HOVORY] },
    { label: 'Hotovost', items: [HOTOVOST] },
  ],
};

const MVT_PREFIXES = ['/mvt'];
const OVT_PATHS = ['/ovt', '/prehled-dne', '/problematicke-zakazky', '/vysledky', '/recenze-qr'];

/** Side of a path; null for shared pages (Hovory). */
export function sideOfPath(pathname: string): Side | null {
  if (MVT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'mvt';
  if (OVT_PATHS.some((p) => pathname === p)) return 'ovt';
  return null;
}

export function isActive(pathname: string, href: string): boolean {
  if (href === '/mvt') return pathname === '/mvt';
  return pathname === href || pathname.startsWith(href + '/');
}
