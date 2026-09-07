'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useWorkforce, WORKFORCE_LABEL, type Workforce } from '../workforce/WorkforceContext';

interface User {
  email?: string;
  role?: string;
}

function getCookieValue(cookieName: string): string | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${cookieName}=`))
    ?.split('=')
    .slice(1)
    .join('=');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface NavItem {
  href: string;
  label: string;
  /** Short explanation for the home tiles. */
  description: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Navigation per workforce. Same groups on both sides (Den / Lidé / Historie /
 * Zákazník) so a TL switching sides finds things in the same place. Pages that
 * don't exist yet on the MVT side are simply absent — nothing is faked.
 */
export const NAV: Record<Workforce, NavGroup[]> = {
  ovt: [
    {
      label: 'Den',
      items: [
        { href: '/prehled-dne', label: 'Přehled dne', description: 'Kalendář a denní seznam Raynet událostí obchodníků (OVT).' },
        { href: '/problematicke-zakazky', label: 'Problematické zakázky', description: 'Nevyřízené zakázky v posledních 2 dnech: chybí v systému, bez exportu ADMF, nebo „Nezastižen“.' },
      ],
    },
    {
      label: 'Lidé',
      items: [
        { href: '/vysledky', label: 'Výsledková tabule', description: 'Výkon OVT (zaměření, objednávky, konverze, hodnota) za den i měsíc, celkově i po týmech.' },
        { href: '/hotovost', label: 'Hotovost', description: 'Kolik hotovosti má kdo u sebe — stejná čísla jako vidí finance.' },
      ],
    },
    {
      label: 'Historie',
      items: [
        { href: '/poslane-na-retence', label: 'Poslané na retence', description: 'Historická stopa zakázek, které TL poslal do retence — kdo, kdy a zda si je retence už převzala.' },
        { href: '/skryte-zakazky', label: 'Skryté zakázky', description: 'Zakázky, které TL potvrdil a skryl z problematických.' },
        { href: '/kontrola-nemozne-realizace', label: 'Nemožná realizace', description: 'Kontrola zakázek označených jako nerealizovatelné.' },
      ],
    },
    {
      label: 'Zákazník',
      items: [{ href: '/objednavky-s-hovory', label: 'Hovory', description: 'Objednávky s hovory z Daktely a historie hovorů zákazníka.' }],
    },
  ],
  mvt: [
    {
      label: 'Den',
      items: [
        { href: '/mvt/prehled-dne', label: 'Přehled dne', description: 'Montáže, servisy a reklamace dne po montérech, se stavem dokončení z aplikace. Jen ke čtení.' },
        { href: '/mvt/nedokoncene', label: 'Nedokončené montáže', description: 'Montáže po termínu bez výsledku, nezdařené zápisy do ERP a reklamace čekající na založení.' },
      ],
    },
    {
      label: 'Lidé',
      items: [
        { href: '/mvt/vysledky', label: 'Výsledky montérů', description: 'Dokončené, se záchranou, reklamace, slevy a vybraná hotovost po montérech a týmech.' },
        { href: '/hotovost', label: 'Hotovost', description: 'Kolik hotovosti má kdo u sebe — stejná čísla jako vidí finance.' },
      ],
    },
    {
      label: 'Historie',
      items: [
        { href: '/mvt/zapisy', label: 'Zápisy z aplikace', description: 'Každé odeslání výsledku montáže z aplikace a co se kam zapsalo (Raynet, ERP, hotovost).' },
        { href: '/mvt/reklamace', label: 'Reklamace z montáží', description: 'Co montéři poslali na reklamace a zda už vznikla navazující událost.' },
      ],
    },
    {
      label: 'Zákazník',
      items: [{ href: '/objednavky-s-hovory', label: 'Hovory', description: 'Objednávky s hovory z Daktely a historie hovorů zákazníka.' }],
    },
  ],
};

export const SHARED_NAV: NavItem[] = [
  { href: '/tymy', label: 'Týmy', description: 'Správa týmů OVT i MVT (vedoucí + členové) pro filtrování portálu.' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

export function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { workforce, setWorkforce, isOvtTl, isMvtTl } = useWorkforce();
  const [signingOut, setSigningOut] = useState(false);

  const user = useMemo<User | null>(() => {
    const email = getCookieValue('user_email');
    const role = getCookieValue('user_role');
    if (!email) return null;
    return { email, role: role || undefined };
  }, []);

  // Deep links: an MVT page opened while OVT is selected (or vice versa) flips the
  // selection so the bar always matches the page being viewed.
  const pathWorkforce: Workforce | null = useMemo(() => {
    if (pathname === '/mvt' || pathname.startsWith('/mvt/')) return 'mvt';
    if (pathname === '/ovt') return 'ovt';
    if (NAV.ovt.some((g) => g.items.some((it) => isActive(pathname, it.href) && !NAV.mvt.some((mg) => mg.items.some((m) => m.href === it.href))))) return 'ovt';
    return null;
  }, [pathname]);
  useEffect(() => {
    if (pathWorkforce && pathWorkforce !== workforce) setWorkforce(pathWorkforce);
  }, [pathWorkforce, workforce, setWorkforce]);

  const switchTo = (w: Workforce) => {
    setWorkforce(w);
    router.push(w === 'mvt' ? '/mvt' : '/ovt');
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await fetch('/api/auth/signout', { method: 'POST' });
      router.push('/auth');
      router.refresh();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setSigningOut(false);
    }
  };

  const items = [...NAV[workforce].flatMap((g) => g.items), ...SHARED_NAV];
  const home = workforce === 'mvt' ? '/mvt' : '/ovt';

  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href={home} className="inline-block">
              <Image src="/logo-zaluzieee.png" alt="žaluzieee logo" width={384} height={94} priority className="h-8 w-auto" unoptimized />
            </Link>
            {/* OVT / MVT — each side has its own landing page and nav bar. */}
            <div className="flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="tablist" aria-label="Pracovní síla">
              {(['ovt', 'mvt'] as Workforce[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  aria-selected={workforce === w}
                  onClick={() => switchTo(w)}
                  className={`px-3 py-1.5 font-semibold transition-colors ${
                    workforce === w ? 'bg-[#1E8449] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  title={w === 'ovt' ? 'Obchodníci (OVT)' : 'Montéři (MVT)'}
                >
                  {WORKFORCE_LABEL[w]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6">
            {user && (
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-700">
                  <span className="font-medium">{user.email || 'Uživatel'}</span>
                  {user.role === 'admin' && <span className="ml-2 rounded bg-[#1E8449] px-2 py-1 text-xs text-white">Admin</span>}
                  {isOvtTl && <span className="ml-1 rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600">OVT TL</span>}
                  {isMvtTl && <span className="ml-1 rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600">MVT TL</span>}
                </div>
                <button type="button" onClick={handleSignOut} disabled={signingOut} className="text-sm text-gray-700 transition-colors hover:text-[#1E8449]">
                  Odhlásit se
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="bg-[#1E8449] text-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center gap-6">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`transition-opacity hover:opacity-80 ${isActive(pathname, it.href) ? 'font-semibold underline' : ''}`}
              >
                {it.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
