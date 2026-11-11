export async function seasonRequest({ staff = false, action } = {}) {
  const token = staff || action ? sessionStorage.getItem('tallmadge-club-tab-session') : null;
  const headers = token ? { 'X-Tallmadge-Club-Session': token } : {};
  const options = action ? {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(action),
  } : { cache: 'no-store', headers };
  const response = await fetch('/api/seasons' + (staff ? '?staff=1' : ''), options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Could not load seasons.');
  return data;
}

export async function setupSeasonPicker(picker, { staff = false } = {}) {
  const seasons = await seasonRequest({ staff });
  const url = new URL(location.href);
  const selected = seasons.find((season) => season.id === url.searchParams.get('season')) ??
    seasons.find((season) => season.is_active);
  if (!selected) throw new Error('No active season is available yet.');
  for (const season of seasons) picker.add(new Option(season.name, season.id));
  picker.value = selected.id;
  picker.disabled = false;
  picker.addEventListener('change', () => {
    url.searchParams.set('season', picker.value);
    location.assign(url.href);
  });
  return selected;
}
