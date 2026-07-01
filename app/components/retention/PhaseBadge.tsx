/**
 * Phase badge for a Raynet BusinessCase phase.
 *
 * Color comes straight from Raynet (`code02` hex, no `#` prefix) so the badge
 * matches what users see in Raynet's own UI. Falls back to a neutral gray
 * style when no color is set or no phase is known.
 */

export interface PhaseBadgeData {
  id: number;
  label: string;
  color: string | null;
}

interface Props {
  phase: PhaseBadgeData | null;
  /** When true, render a small "—" placeholder for rows without a phase
   *  (linked BC missing or Raynet unreachable). Default: render nothing. */
  showPlaceholder?: boolean;
  /** Size variant. */
  size?: 'sm' | 'md';
}

/**
 * Decide black vs. white text for any given background hex so the label stays
 * legible across all phase colors (e.g., light beige vs. dark red).
 *
 * Uses ITU-R BT.709 luma weights — same heuristic Raynet's own UI uses.
 */
function pickTextColor(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return '#1f2937'; // gray-800 fallback
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 140 ? '#1f2937' : '#ffffff';
}

export function PhaseBadge({ phase, showPlaceholder = false, size = 'sm' }: Props) {
  if (!phase) {
    if (!showPlaceholder) return null;
    return (
      <span
        className={`inline-flex items-center rounded-md border border-gray-200 bg-gray-50 ${
          size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
        } font-medium text-gray-400`}
        title="Fáze není známá"
      >
        —
      </span>
    );
  }

  const sizeClass =
    size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  if (!phase.color) {
    // Phase exists but color is missing — render in neutral gray.
    return (
      <span
        className={`inline-flex items-center rounded-md border border-gray-300 bg-gray-100 font-semibold text-gray-700 ${sizeClass}`}
        title={`Fáze: ${phase.label}`}
      >
        {phase.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold ${sizeClass}`}
      style={{
        backgroundColor: `#${phase.color}`,
        color: pickTextColor(phase.color),
      }}
      title={`Fáze: ${phase.label}`}
    >
      {phase.label}
    </span>
  );
}
