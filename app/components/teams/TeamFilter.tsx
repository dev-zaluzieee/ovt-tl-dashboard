'use client';

import { useEffect, useState } from 'react';

interface TeamMember {
  user_id: string;
  email: string | null;
  displayName: string;
  raynet_id: string | null;
}

interface Team {
  id: number;
  name: string;
  members: TeamMember[];
}

/** The selected team's member identity sets, for filtering by owner. */
export interface TeamSelection {
  id: number;
  name: string;
  memberEmails: string[];
  memberRaynetIds: string[];
}

interface Props {
  value: number | null;
  onChange: (selection: TeamSelection | null) => void;
}

/**
 * Shared "filter by team" dropdown. Loads teams once and hands the caller the
 * selected team's member e-mails + Raynet ids so each page can filter its own
 * rows however its owner data is shaped.
 */
export function TeamFilter({ value, onChange }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/teams', { headers: { Accept: 'application/json' } });
        const body = await res.json();
        if (!cancelled && res.ok && body.success) {
          setTeams((body.data as Team[]) ?? []);
        }
      } catch {
        /* non-fatal — filter just stays empty */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loaded && teams.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Žádné týmy zatím nejsou. Vytvořte je v sekci „Týmy“.
      </p>
    );
  }

  const handle = (raw: string) => {
    if (!raw) {
      onChange(null);
      return;
    }
    const id = Number(raw);
    const team = teams.find((t) => t.id === id);
    if (!team) {
      onChange(null);
      return;
    }
    onChange({
      id: team.id,
      name: team.name,
      memberEmails: team.members
        .map((m) => m.email)
        .filter((e): e is string => !!e),
      memberRaynetIds: team.members
        .map((m) => m.raynet_id)
        .filter((r): r is string => !!r),
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-gray-700">Tým</span>
      <select
        value={value ?? ''}
        onChange={(e) => handle(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm"
      >
        <option value="">Všechny týmy</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
