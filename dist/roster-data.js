export async function loadRosterTeams() {
  const response = await fetch('/api/teams', { cache: 'no-store' });
  if (!response.ok) throw new Error('Club teams could not be loaded.');
  return response.json();
}

export async function rosterRequest(teamId, season, view, player) {
  const params = new URLSearchParams({ teamId, season });
  if (view) params.set('view', view);
  const token = view || player ? sessionStorage.getItem('tallmadge-club-tab-session') : null;
  const headers = token ? { 'X-Tallmadge-Club-Session': token } : {};
  const response = await fetch('/api/rosters?' + params, player ? {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(player),
  } : { headers, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Could not load or save this roster.');
  return data;
}
