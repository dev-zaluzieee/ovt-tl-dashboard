import Link from 'next/link';
import { AppLayout } from './components/layout/AppLayout';

interface Tile {
  href: string;
  title: string;
  description: string;
}

interface Section {
  label: string;
  tiles: Tile[];
}

const SECTIONS: Section[] = [
  {
    label: 'Přehled',
    tiles: [
      {
        href: '/prehled-dne',
        title: 'Přehled dne',
        description: 'Kalendář a denní seznam Raynet událostí obchodníků (OVT).',
      },
      {
        href: '/problematicke-zakazky',
        title: 'Problematické zakázky',
        description:
          'Nevyřízené zakázky za posledních 14 dní: chybí v systému, bez exportu ADMF, nebo „Nezastižen“.',
      },
      {
        href: '/vysledky',
        title: 'Výsledková tabule',
        description:
          'Výkon OVT (zaměření, objednávky, konverze, hodnota) za den i měsíc, celkově i po týmech.',
      },
    ],
  },
  {
    label: 'Nastavení',
    tiles: [
      {
        href: '/tymy',
        title: 'Týmy',
        description: 'Správa týmů (vedoucí OVT TL + členové) pro filtrování dashboardu.',
      },
    ],
  },
];

export default function Home() {
  return (
    <AppLayout>
      <main className="container mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#1E8449]">
            Vítejte v portálu vedoucích týmů
          </h1>
          <p className="mt-2 text-gray-600">Vyberte sekci.</p>
        </header>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {section.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.tiles.map((tile) => (
                  <Link
                    key={tile.href}
                    href={tile.href}
                    className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#1E8449] hover:shadow-md"
                  >
                    <h3 className="text-lg font-semibold text-[#1E8449]">
                      {tile.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">{tile.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </AppLayout>
  );
}
