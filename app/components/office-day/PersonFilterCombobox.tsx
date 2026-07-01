'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

/** One row from backend `pairedPeople` (Raynet person aggregate). */
export type PairedPersonOption = {
  raynet_id: string;
  label: string;
  raynet_name: string | null;
  app_emails: string[];
};

/** Lowercase ASCII-ish fold for Czech-friendly search (optional diacritic strip). */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function matchesSearch(option: PairedPersonOption, q: string): boolean {
  if (!q.trim()) {
    return true;
  }
  const f = fold(q.trim());
  const hay = [
    option.label,
    option.raynet_id,
    option.raynet_name ?? '',
    ...option.app_emails,
  ]
    .join(' ')
    .toLowerCase();
  return fold(hay).includes(f);
}

type PersonFilterComboboxProps = {
  options: PairedPersonOption[];
  /** `null` = všichni propojení obchodníci */
  value: string | null;
  onChange: (raynetId: string | null) => void;
  disabled?: boolean;
};

/**
 * Searchable single-select for Raynet person; keyboard-friendly listbox under input.
 */
export function PersonFilterCombobox({
  options,
  value,
  onChange,
  disabled = false,
}: PersonFilterComboboxProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((o) => o.raynet_id === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const allRow: PairedPersonOption = {
      raynet_id: '',
      label: 'Všichni obchodníci',
      raynet_name: null,
      app_emails: [],
    };
    const rest = options.filter((o) => matchesSearch(o, query));
    if (!query.trim()) {
      return [allRow, ...rest];
    }
    const allMatches =
      fold('všichni').includes(fold(query)) ||
      fold('obchodníci').includes(fold(query)) ||
      fold('všichni obchodníci').includes(fold(query));
    return allMatches ? [allRow, ...rest] : rest;
  }, [options, query]);

  useEffect(() => {
    if (highlight >= filtered.length) {
      setHighlight(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, highlight]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  const commitHighlight = () => {
    const row = filtered[highlight];
    if (!row) {
      return;
    }
    if (row.raynet_id === '') {
      onChange(null);
    } else {
      onChange(row.raynet_id);
    }
    setOpen(false);
    inputRef.current?.blur();
  };

  const displayValue = open
    ? query
    : selected
      ? selected.label
      : 'Všichni obchodníci';

  return (
    <div className="relative w-full max-w-md">
      <label htmlFor={listId + '-input'} className="mb-1 block text-sm font-medium text-gray-700">
        Obchodník (Raynet)
      </label>
      <input
        ref={inputRef}
        id={listId + '-input'}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId + '-listbox'}
        aria-autocomplete="list"
        disabled={disabled}
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery(selected ? selected.label : '');
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (listRef.current?.contains(next)) {
            return;
          }
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (disabled) {
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            if (filtered.length === 0) {
              return;
            }
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            if (filtered.length === 0) {
              return;
            }
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open) {
              commitHighlight();
            } else {
              setOpen(true);
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Hledat podle jména, e-mailu nebo ID…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-[#1E8449] focus:outline-none focus:ring-2 focus:ring-[#1E8449]/30"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          id={listId + '-listbox'}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((row, i) => (
            <li
              key={row.raynet_id === '' ? '__all__' : row.raynet_id}
              role="option"
              aria-selected={i === highlight}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === highlight ? 'bg-[#E8F5E9] text-gray-900' : 'text-gray-800 hover:bg-gray-50'
              }`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                setHighlight(i);
                if (row.raynet_id === '') {
                  onChange(null);
                } else {
                  onChange(row.raynet_id);
                }
                setOpen(false);
              }}
            >
              <div className="font-medium">{row.label}</div>
              {row.raynet_id !== '' && (
                <div className="text-xs text-gray-500">
                  ID {row.raynet_id}
                  {row.app_emails.length > 0
                    ? ` · ${row.app_emails.join(', ')}`
                    : ''}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
