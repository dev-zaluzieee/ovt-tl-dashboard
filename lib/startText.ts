import { fmtDateTime } from './format';
import type { Meta } from './types';

/**
 * The banner says what each scope shows. Without a history scope the old wording stays (one rule for every page); with it, the work lists
 * and the history pages are named separately, so the text is true for both.
 * Slice T2: "Vráceno OVT" has no start date and "Zaměření bez výsledku" follows the backend's own rule (meta.problemRules); an older backend
 * without that field keeps the previous wording.
 */
export function startText(meta: Meta): string {
  const start = fmtDateTime(meta.startAt);
  const hist = meta.historyFrom ? fmtDateTime(meta.historyFrom) : null;
  const rules = meta.problemRules;
  const bez = rules?.bez_vysledku ?? null;
  const vraceno = rules?.vraceno_ovt ?? null;
  const own = !!(bez || vraceno);
  const problems = own
    ? ` Problematické zakázky: ${[
        bez,
        meta.bezVysledkuFrom && bez ? `Zaměření bez výsledku se navíc hlídají jen od ${fmtDateTime(meta.bezVysledkuFrom)}` : null,
        vraceno,
      ]
        .filter(Boolean)
        .join('. ')}.`
    : '';
  if (!hist) {
    if (meta.testMode) return `zobrazují se jen události vytvořené ručně v ERP od ${start}.${problems}`;
    return meta.startAt ? `Zobrazují se jen návštěvy od ${start}; starší nejsou součástí tohoto dashboardu.${problems}` : problems.trim();
  }
  const list = own ? 'Chybí výsledek, Nesedí doplatek, Opravy, úvodní stránka' : 'Zaměření bez výsledku, Vráceno OVT, Chybí výsledek, Nesedí doplatek, Opravy, úvodní stránka';
  const work = meta.testMode
    ? `pracovní seznamy a počty (${list}) zobrazují jen události vytvořené ručně v ERP od ${start}.`
    : `Pracovní seznamy a počty (${list}) zobrazují jen návštěvy od ${start}.`;
  const history = `Přehledy dne, Výsledky, Nedopadlo, Záchrany, Reklamace z montáží, hledání a výběr osob sahají do ${hist}${meta.testMode ? ' (zkušební omezení se tam nepoužívá)' : ''}; výsledky starších návštěv jsou přenesené ze starých systémů.`;
  return `${work}${problems} ${history}`;
}
