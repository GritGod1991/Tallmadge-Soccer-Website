import { divisions } from './rec-divisions.js';
import { divisionPage, divisionRequest, teamPage } from './division-data.js';
import { teamScheduleLink } from './schedule-data.js';

const sections = new Map([
  ['overview', ''],
  ['coaches', 'Coaches'],
  ['info', 'Info'],
]);
const params = new URLSearchParams(location.search);
const division = params.get('division');
const section = params.get('section') ?? 'overview';
const nameParam = params.get('name');
const catalog = await divisionRequest().catch(() => null);
const original = divisions.get(division);
const item = catalog?.find(({ name, league }) => league === 'rec' && name === (nameParam ?? original)) ??
  (!nameParam && original ? catalog?.find(({ originalName, league }) => league === 'rec' && originalName === original) : undefined);
const name = item?.name;

if (name && section === 'schedule') {
  location.replace(teamScheduleLink(name));
} else if (item && section === 'overview') {
  location.replace(divisionPage(item));
} else if (name && sections.has(section)) {
  const label = sections.get(section);
  const title = label ? `${name} ${label}` : name;
  const overview = divisionPage(item);
  document.title = `${title} | Tallmadge Soccer`;
  document.querySelector('#rec-title').textContent = title;
  document.querySelector('#rec-info-name').textContent = name;
  document.querySelector(`[data-rec-panel="${section}"]`).hidden = false;
  if (label) {
    const back = document.querySelector('#rec-back');
    const teamId = params.get('teamId');
    back.href = teamId ? teamPage({ id: teamId }) : overview;
    back.textContent = teamId ? 'Back to team' : `Back to ${name}`;
  }
} else {
  document.querySelector('#rec-empty').hidden = false;
}
