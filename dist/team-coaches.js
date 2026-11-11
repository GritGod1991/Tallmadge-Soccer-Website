import { divisionPage, divisionRequest, teamPage } from './division-data.js';
import { classicDivisionPattern, classicDivisionPage } from './schedule-data.js';

import { loadRosterTeams } from './roster-data.js';

const params = new URLSearchParams(location.search);
const requestedTeam = params.get('teamId');
const selectedTeam = requestedTeam && (await loadRosterTeams().catch(() => [])).find((item) => item.id === requestedTeam);
const age = params.get('age');
const division = params.get('division');
const renamed = division && (await divisionRequest().catch(() => [])).find((item) =>
  item.league === 'travel' && item.name === division && classicDivisionPattern.test(item.originalName ?? ''));
const original = renamed?.originalName ?? division;
const splitU10 = original === 'U10 Boys' || original === 'U10 Girls';

if (requestedTeam) {
  const empty = document.querySelector('#coaches-empty');
  empty.hidden = false;
  if (selectedTeam) {
    const title = selectedTeam.name + ' Coaches';
    document.title = title + ' | Tallmadge Soccer';
    document.querySelector('#coaches-title').textContent = title;
    const back = document.querySelector('#coaches-back');
    back.href = teamPage(selectedTeam);
    back.textContent = 'Back to ' + selectedTeam.name;
    empty.textContent = 'No coaches have been posted for this team yet.';
  } else {
    empty.textContent = 'This team is no longer available.';
  }
} else if (renamed || splitU10 || (division === null && /^(9|10|11|12|13|14)$/.test(age ?? ''))) {
  const team = renamed || splitU10 ? division : 'U' + age;
  document.title = team + ' Coaches | Tallmadge Soccer';
  document.querySelector('#coaches-title').textContent = team + ' Coaches';
  const back = document.querySelector('#coaches-back');
  back.href = renamed ? divisionPage(renamed) : classicDivisionPage(team);
  back.textContent = 'Back to ' + team + ' Classic Travel';
  if (splitU10) {
    const empty = document.querySelector('#coaches-empty');
    empty.textContent = 'No coaches have been posted for this team yet.';
    empty.hidden = false;
  } else {
    document.querySelector('#coaches-preview').hidden = false;
  }
} else {
  document.querySelector('#coaches-empty').hidden = false;
}
