import { divisions as recDivisions } from './rec-divisions.js';

export const leagueLabels = { travel: 'Classic Travel', rec: 'Rec League' };
export const isSplitU10 = ({ league, name, originalName }) => league === 'travel' &&
  ['U10 Boys', 'U10 Girls'].includes(originalName ?? name);
export const isU10Division = (division) => isSplitU10(division) ||
  (division.league === 'travel' && division.name.toLowerCase() === 'u10');

export async function divisionRequest(method = 'GET', input) {
  const token = input ? sessionStorage.getItem('tallmadge-club-tab-session') : null;
  const response = await fetch('/api/divisions', {
    method, cache: 'no-store',
    ...(input && { headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Tallmadge-Club-Session': token } : {}) }, body: JSON.stringify(input) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Could not load or save divisions. Try again.');
  return result;
}

export function sortedDivisions(divisions, league) {
  const recOrder = [...recDivisions.values()];
  return divisions.filter((item) => item.league === league).sort((a, b) => {
    if (league === 'rec') {
      const rank = (item) => recOrder.includes(item.name) ? recOrder.indexOf(item.name) : recOrder.length;
      const order = rank(a) - rank(b);
      if (order) return order;
    }
    return a.name.localeCompare(b.name, 'en', { numeric: true });
  });
}

export function populateDivisionSelect(select, divisions) {
  for (const [league, label] of Object.entries(leagueLabels)) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const item of sortedDivisions(divisions, league)) {
      group.append(new Option(item.name, item.name));
    }
    if (group.childElementCount) select.append(group);
  }
}

export function divisionPage({ name }) {
  return '/division.html?' + new URLSearchParams({ division: name });
}

export function teamPage(team) {
  return '/division.html?' + new URLSearchParams({ teamId: team.id });
}
