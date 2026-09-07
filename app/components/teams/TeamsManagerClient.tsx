'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkforce, WORKFORCE_LONG, type Workforce } from '../workforce/WorkforceContext';

interface AppUser {
  user_id: string;
  email: string | null;
  role: string | null;
  is_ovt_tl?: boolean;
  is_mvt_tl?: boolean;
  raynet_id: string | null;
  raynet_name: string | null;
}

/** Montér from the mvt-mapa registry (via ceniky-2). */
interface MvtPerson {
  raynet_user_id: number;
  name: string;
  email: string | null;
  region: string[] | null;
  is_active: boolean;
}

interface TeamPerson {
  user_id: string;
  email: string | null;
  displayName: string;
  raynet_id: string | null;
}

interface Team {
  id: number;
  name: string;
  workforce?: Workforce;
  leader_user_id: string;
  leader: TeamPerson | null;
  members: TeamPerson[];
}

function userLabel(u: AppUser): string {
  return u.raynet_name?.trim() || u.email?.split('@')[0] || u.user_id;
}

export function TeamsManagerClient() {
  const { workforce, setWorkforce } = useWorkforce();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [mvts, setMvts] = useState<MvtPerson[]>([]);
  const [mvtError, setMvtError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state (editingId === null → create mode).
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsRes, usersRes] = await Promise.all([
        fetch('/api/teams', { headers: { Accept: 'application/json' } }),
        fetch('/api/users', { headers: { Accept: 'application/json' } }),
      ]);
      const teamsBody = await teamsRes.json();
      const usersBody = await usersRes.json();
      if (!teamsRes.ok || !teamsBody.success) {
        setError(teamsBody.message || 'Nepodařilo se načíst týmy');
        return;
      }
      if (!usersRes.ok || !usersBody.success) {
        setError(usersBody.message || 'Nepodařilo se načíst uživatele');
        return;
      }
      setTeams(teamsBody.data as Team[]);
      setUsers((usersBody.data as AppUser[]) ?? []);
      // Montéři registry — needed for MVT teams only; a failure must not block OVT teams.
      try {
        const r = await fetch('/api/mvt-registry?active=true', { headers: { Accept: 'application/json' } });
        const b = await r.json();
        if (r.ok && b.success) {
          setMvts((b.data as MvtPerson[]) ?? []);
          setMvtError(null);
        } else setMvtError(b.error || b.message || 'Registr montérů není dostupný.');
      } catch {
        setMvtError('Registr montérů není dostupný.');
      }
    } catch {
      setError('Nepodařilo se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ovtLeaders = useMemo(
    () =>
      users
        .filter((u) => u.is_ovt_tl)
        .sort((a, b) => userLabel(a).localeCompare(userLabel(b), 'cs')),
    [users]
  );
  const ovtMembers = useMemo(
    () =>
      users
        .filter((u) => u.raynet_id)
        .sort((a, b) => userLabel(a).localeCompare(userLabel(b), 'cs')),
    [users]
  );
  const mvtLeaders = useMemo(
    () => users.filter((u) => u.is_mvt_tl).sort((a, b) => userLabel(a).localeCompare(userLabel(b), 'cs')),
    [users]
  );
  const mvtMembers = useMemo(() => [...mvts].sort((a, b) => a.name.localeCompare(b.name, 'cs')), [mvts]);
  const visibleTeams = useMemo(() => teams.filter((t) => (t.workforce ?? 'ovt') === workforce), [teams, workforce]);
  const isMvt = workforce === 'mvt';
  const leaders = isMvt ? mvtLeaders : ovtLeaders;

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setLeaderId('');
    setMemberIds(new Set());
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (team: Team) => {
    setEditingId(team.id);
    setName(team.name);
    setLeaderId(team.leader_user_id);
    setMemberIds(
      new Set((team.workforce ?? 'ovt') === 'mvt' ? team.members.map((m) => m.raynet_id ?? '').filter(Boolean) : team.members.map((m) => m.user_id))
    );
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim()) {
      setFormError('Zadejte název týmu.');
      return;
    }
    if (!leaderId) {
      setFormError('Vyberte vedoucího týmu.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = isMvt
        ? { name: name.trim(), workforce: 'mvt', leader_user_id: leaderId, member_raynet_ids: [...memberIds].map(Number) }
        : { name: name.trim(), workforce: 'ovt', leader_user_id: leaderId, member_user_ids: [...memberIds] };
      const res = await fetch(
        editingId == null ? '/api/teams' : `/api/teams/${editingId}`,
        {
          method: editingId == null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        setFormError(body.message || 'Nepodařilo se uložit tým');
        return;
      }
      closeForm();
      await load();
    } catch {
      setFormError('Došlo k chybě při ukládání.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (team: Team) => {
    if (!confirm(`Opravdu smazat tým „${team.name}“?`)) return;
    try {
      const res = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok || !body.success) {
        alert(body.message || 'Nepodařilo se smazat tým');
        return;
      }
      await load();
    } catch {
      alert('Došlo k chybě při mazání.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="tablist">
        {(['ovt', 'mvt'] as Workforce[]).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={workforce === w}
            onClick={() => {
              setWorkforce(w);
              closeForm();
            }}
            className={`px-4 py-2 font-medium ${workforce === w ? 'bg-[#1E8449] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            {WORKFORCE_LONG[w]} · {teams.filter((t) => (t.workforce ?? 'ovt') === w).length}
          </button>
        ))}
      </div>
      {isMvt && mvtError && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{mvtError}</div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Týmů: {visibleTeams.length}</p>
        {!showForm && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-[#1E8449] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#166d3b]"
          >
            Nový tým
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {editingId == null ? 'Nový tým' : 'Upravit tým'}
          </h2>

          {formError && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Název týmu</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#1E8449]"
                placeholder="např. Tým Praha"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Vedoucí týmu ({isMvt ? 'MVT TL' : 'OVT TL'})</label>
              {leaders.length === 0 ? (
                <p className="text-sm text-amber-800">
                  Žádný uživatel není označen jako „{isMvt ? 'MVT TL' : 'OVT TL'}“. Označte ho nejdříve v administraci uživatelů.
                </p>
              ) : (
                <select
                  value={leaderId}
                  onChange={(e) => setLeaderId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#1E8449]"
                >
                  <option value="">— vyberte —</option>
                  {leaders.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {userLabel(u)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Členové ({isMvt ? 'montéři' : 'OVT'}) — {memberIds.size} vybráno
              </label>
              {isMvt ? (
                mvtMembers.length === 0 ? (
                  <p className="text-sm text-gray-500">{mvtError ?? 'Žádní montéři v registru.'}</p>
                ) : (
                  <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 p-2">
                    {mvtMembers.map((m) => {
                      const key = String(m.raynet_user_id);
                      return (
                        <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                          <input type="checkbox" checked={memberIds.has(key)} onChange={() => toggleMember(key)} />
                          <span className="text-gray-800">{m.name}</span>
                          {m.region && m.region.length > 0 && <span className="text-gray-400">· {m.region.join(', ')}</span>}
                        </label>
                      );
                    })}
                  </div>
                )
              ) : ovtMembers.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Žádní OVT (uživatelé s propojeným Raynetem) k dispozici.
                </p>
              ) : (
                <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 p-2">
                  {ovtMembers.map((u) => (
                    <label
                      key={u.user_id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={memberIds.has(u.user_id)}
                        onChange={() => toggleMember(u.user_id)}
                      />
                      <span className="text-gray-800">{userLabel(u)}</span>
                      {u.email && <span className="text-gray-400">· {u.email}</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-[#1E8449] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#166d3b] disabled:opacity-50"
            >
              {saving ? 'Ukládám…' : 'Uložit'}
            </button>
          </div>
        </div>
      )}

      {visibleTeams.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
          <p className="font-medium text-gray-900">Zatím žádné {isMvt ? 'MVT' : 'OVT'} týmy</p>
          <p className="mt-2 text-sm">Vytvořte první tým tlačítkem „Nový tým“.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleTeams.map((team) => (
            <li key={team.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{team.name}</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Vedoucí: </span>
                    {team.leader?.displayName ?? `— (neznámý / bez ${isMvt ? 'MVT' : 'OVT'} TL)`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {team.members.length === 0 ? (
                      <span className="text-sm text-gray-400">Bez členů</span>
                    ) : (
                      team.members.map((m) => (
                        <span
                          key={m.user_id}
                          className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                        >
                          {m.displayName}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(team)}
                    className="rounded-lg border border-[#1E8449] px-3 py-1.5 text-sm font-medium text-[#1E8449] hover:bg-[#F1F8F4]"
                  >
                    Upravit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(team)}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Smazat
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
