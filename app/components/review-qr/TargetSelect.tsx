"use client";

import { input, PLATFORM_LABEL, targetName, type Platform, type Target } from "./types";

/**
 * Target picker grouped by platform in the audience's preferred order.
 * Inactive targets are listed only when currently selected, so a stale
 * choice stays visible instead of silently changing.
 */
export function TargetSelect({
  targets,
  platformOrder,
  value,
  emptyLabel,
  disabled,
  onChange,
  className,
}: {
  targets: Target[];
  platformOrder: Platform[];
  value: number | null;
  emptyLabel: string;
  disabled?: boolean;
  onChange: (targetId: number | null) => void;
  className?: string;
}) {
  return (
    <select
      className={`${input} ${className ?? ""}`}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">{emptyLabel}</option>
      {platformOrder.map((p) => {
        const list = targets.filter((t) => t.platform === p && (t.active || t.id === value));
        if (list.length === 0) return null;
        return (
          <optgroup key={p} label={PLATFORM_LABEL[p]}>
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {targetName(t)}
                {t.active ? "" : " (neaktivní)"}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
