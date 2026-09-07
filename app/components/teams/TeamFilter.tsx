'use client';

import { useEffect, useState } from 'react';
import { useWorkforce, type Workforce } from '../workforce/WorkforceContext';

interface TeamMember {
  user_id: string;
  email: string | null;
  displayName: string;
  raynet_id: string | null;
}

interface Team {
  id: number;
  name: string;
  workforce?: Workforce;
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
  /** Which workforce's teams to offer. Defaults to the portal's current choice. */
  workforce?: Workforce;
}

/**
 * Shared "filter by team" dropdown. Loads the teams of one workforce and hands
 * the caller the selected team's member e-mails + Raynet ids so each page can
 * filter its own rows however its owner data is shaped (OVT pages match users,
 * MVT pages match montéři by Raynet id).
 */
export function TeamFilter({ value, onChange, workforce: wfProp }: Props) {
  const { workforce: wfCtx } = useWorkforce();
  const workforce = wfProp ?? wfCtx;
  const [teams, setTeams] = useState<Team[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const res = await fetch(`/api/teams?workforce=${workforce}`, { headers: { Accept: 'application/json' } });
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
  }, [workforce]);

  // A previously selected team that belongs to the other workforce no longer applies.
  useEffect(() => {
    if (loaded && value != null && !teams.some((t) => t.id === value)) onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, teams]);

  if (loaded && teams.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Žádné {workforce === 'mvt' ? 'MVT' : 'OVT'} týmy zatím nejsou. Vytvořte je v sekci „Týmy“.
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
      memberEmails: team.members.map((m) => m.email).filter((e): e is string => !!e),
      memberRaynetIds: team.members.map((m) => m.raynet_id).filter((r): r is string => !!r),
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-gray-700">Tým</span>
      <select value={value ?? ''} onChange={(e) => handle(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm">
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
