export function teamScheduleLink(division, team) {
  const params = new URLSearchParams({ division });
  if (team) params.set('team', team);
  return '/team-schedule.html?' + params;
}

export async function scheduleRequest(params, options) {
  const response = await fetch('/api/schedules' + (params ? '?' + params : ''), {
    cache: 'no-store', ...options,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not load schedules.');
  return result;
}

// The stored kickoff is an Ohio wall-clock time. Format it without converting to the viewer's zone.
const kickoffFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });

export function formatKickoff(time) {
  return kickoffFormat.format(new Date('2000-01-01T' + time + ':00Z'));
}

export function gameFieldLabel(game) {
  return game.awayFieldName || 'Field ' + game.field;
}

export const classicDivisionPattern = /^U(?:9|10(?: Boys| Girls)?|11|12|13|14)$/;

export function classicDivisionPage(division) {
  const page = division.toLowerCase().replace(' ', '-');
  return '/classic-travel-' + page + '.html';
}
