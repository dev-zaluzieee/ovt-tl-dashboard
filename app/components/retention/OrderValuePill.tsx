/**
 * Small read-only pill showing the locally-resolved order value (CN → exported
 * ADMF → latest ADMF, s-DPH). When the Raynet BC totalAmount diverges, the
 * pill turns amber and the tooltip explains the mismatch.
 *
 * Used across MyOps, Aktivní OP, Fronta retencí, and anywhere we need a
 * compact "hodnota zakázky" badge.
 */

export interface OrderValueSyncBlock {
  inSync: boolean;
  local: {
    value: number;
    source: 'CN' | 'ADMF_EXPORTED' | 'ADMF_LATEST';
    sourceId: number;
    sourceLabel: string | null;
  } | null;
  raynet: number | null;
}

interface Props {
  sync: OrderValueSyncBlock | null | undefined;
  /** Size variant. */
  size?: 'sm' | 'md';
}

function formatKc(n: number): string {
  return `${new Intl.NumberFormat('cs-CZ').format(Math.round(n))} Kč`;
}

const SOURCE_LABEL: Record<
  'CN' | 'ADMF_EXPORTED' | 'ADMF_LATEST',
  string
> = {
  CN: 'CN',
  ADMF_EXPORTED: 'ADMF (export)',
  ADMF_LATEST: 'ADMF',
};

export function OrderValuePill({ sync, size = 'sm' }: Props) {
  if (!sync || sync.local == null) {
    return null;
  }
  const outOfSync = !sync.inSync;
  const sizeClass =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px]'
      : 'px-2 py-0.5 text-xs';
  const colorClass = outOfSync
    ? 'border-amber-400 bg-amber-50 text-amber-900'
    : 'border-emerald-300 bg-emerald-50 text-emerald-900';
  const sourceTag = SOURCE_LABEL[sync.local.source];
  const titleParts: string[] = [
    `Hodnota zakázky (s DPH): ${formatKc(sync.local.value)}`,
    `Zdroj: ${sourceTag}${
      sync.local.sourceLabel ? ` — ${sync.local.sourceLabel}` : ''
    }`,
  ];
  if (outOfSync) {
    titleParts.push(
      sync.raynet != null
        ? `Raynet: ${formatKc(sync.raynet)} (neshoduje se)`
        : 'Raynet: neuvedeno'
    );
  }
  return (
    <span
      title={titleParts.join('\n')}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-semibold tabular-nums ${sizeClass} ${colorClass}`}
    >
      {outOfSync && (
        <span aria-hidden className="leading-none">
          ⚠
        </span>
      )}
      <span>{formatKc(sync.local.value)}</span>
      <span className="font-medium opacity-70">{sourceTag}</span>
    </span>
  );
}
