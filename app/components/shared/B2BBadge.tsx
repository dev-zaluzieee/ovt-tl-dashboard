/**
 * B2B badge — read-only visual marker. Shown across the whole app (order
 * lists, order detail, klient card, prehled-dne). Source of truth is the
 * Raynet event's `B2B_28453` customField; write happens only in the TL
 * dashboard's `/prehled-dne → seznam` view (see B2BToggle).
 */
export function B2BBadge({
  b2b,
  size = 'sm',
}: {
  b2b: boolean;
  /** `sm` = badge chip, `xs` = tiny inline marker. */
  size?: 'sm' | 'xs';
}) {
  if (!b2b) return null;
  const cls =
    size === 'xs'
      ? 'inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-1.5 py-0 text-[10px] font-semibold text-indigo-800'
      : 'inline-flex items-center rounded-md border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800';
  return (
    <span className={cls} title="B2B klient (označeno TL)">
      B2B
    </span>
  );
}
