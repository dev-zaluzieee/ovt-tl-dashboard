'use client';

/**
 * Two-tab pill that flips between "standard" and "compact" list density.
 * Used by every retention-portal list (Moje OP, Fronta, Aktivní OP,
 * Nedopadlé). Backed by the shared `useListDensity` hook so a toggle on one
 * list propagates to the others without a reload.
 */

import type { ListDensity } from './listDensity';

interface Props {
  density: ListDensity;
  onChange: (d: ListDensity) => void;
}

export function DensityToggle({ density, onChange }: Props) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs"
      role="tablist"
      aria-label="Hustota zobrazení"
    >
      <button
        type="button"
        role="tab"
        aria-selected={density === 'standard'}
        onClick={() => onChange('standard')}
        className={`px-3 py-1 font-medium transition-colors ${
          density === 'standard'
            ? 'bg-[#1E8449] text-white'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        Standardní
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={density === 'compact'}
        onClick={() => onChange('compact')}
        className={`border-l border-gray-300 px-3 py-1 font-medium transition-colors ${
          density === 'compact'
            ? 'bg-[#1E8449] text-white'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        Kompaktní
      </button>
    </div>
  );
}
