'use client';

import type { ReactNode } from 'react';
import { Navigation } from './Navigation';
import { MetaProvider, useMeta } from './MetaContext';
import { fmtDateTime } from '@/lib/format';
import type { Meta } from '@/lib/types';

/**
 * The banner says what each scope shows. Without a history scope the old wording stays (one rule for every page); with it, the work lists
 * and the history pages are named separately, so the text is true for both.
 */
function startText(meta: Meta): string {
  const start = fmtDateTime(meta.startAt);
  const hist = meta.historyFrom ? fmtDateTime(meta.historyFrom) : null;
  if (!hist) {
    if (meta.testMode) return `zobrazují se jen události vytvořené ručně v ERP od ${start}.`;
    return meta.startAt ? `Zobrazují se jen návštěvy od ${start}; starší nejsou součástí tohoto dashboardu.` : '';
  }
  const work = meta.testMode
    ? `pracovní seznamy a počty (Zaměření bez výsledku, Vráceno OVT, Chybí výsledek, Nesedí doplatek, Opravy, úvodní stránka) zobrazují jen události vytvořené ručně v ERP od ${start}.`
    : `Pracovní seznamy a počty (Zaměření bez výsledku, Vráceno OVT, Chybí výsledek, Nesedí doplatek, Opravy, úvodní stránka) zobrazují jen návštěvy od ${start}.`;
  const history = `Přehledy dne, Výsledky, Nedopadlo, Záchrany, Reklamace z montáží, hledání a výběr osob sahají do ${hist}${meta.testMode ? ' (zkušební omezení se tam nepoužívá)' : ''}; výsledky starších návštěv jsou přenesené ze starých systémů.`;
  return `${work} ${history}`;
}

function StartNote() {
  const { meta } = useMeta();
  if (!meta) return null;
  return (
    <div className="border-b border-gray-100 bg-gray-50">
      <p className="container mx-auto px-4 py-1 text-xs text-gray-500">
        {meta.testMode ? <span className="font-semibold text-amber-800">Zkušební provoz: </span> : null}
        {startText(meta)}
      </p>
    </div>
  );
}

/** Shell: top bar with the OVT / MVT switch, green navigation, the backend's vocabulary ("meta") for every page. */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <MetaProvider>
        <Navigation />
        <StartNote />
        {children}
      </MetaProvider>
    </div>
  );
}
