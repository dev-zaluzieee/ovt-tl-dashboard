import React from 'react';

export interface RetentionBadgeProps {
  /** State B: "V retencích" — Raynet event has CN tag. Wins precedence when both states apply. */
  inRetention?: boolean;
  /** State A: "Zasláno na retence" — open OVT_REQUEST in our DB. Shown only when state B is false. */
  inRetentionRequested?: boolean;
  className?: string;
}

/**
 * Three-state pill: none / "Zasláno na retence" (amber) / "V retencích" (red).
 * Precedence: state B > state A > none. The office team agreed CN-tag-set means the
 * order IS in retention regardless of any later request, so state B wins visually.
 */
export function RetentionBadge({ inRetention, inRetentionRequested, className }: RetentionBadgeProps) {
  if (inRetention) {
    return (
      <span
        className={
          'inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 ' +
          (className ?? '')
        }
        title="Zakázka je v retencích (CN štítek)"
      >
        V retencích
      </span>
    );
  }
  if (inRetentionRequested) {
    return (
      <span
        className={
          'inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ' +
          (className ?? '')
        }
        title="OVT zaslal žádost o retenci, kancelář ji ještě nezpracovala"
      >
        Zasláno na retence
      </span>
    );
  }
  return null;
}
