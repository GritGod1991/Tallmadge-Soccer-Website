import { divisions } from './rec-divisions.js';
import { divisionPage, divisionRequest, teamPage } from './division-data.js';
import { setupSeasonPicker } from './season-data.js';
import { loadRosterTeams, rosterRequest } from './roster-data.js';

const url = new URL(location.href);
const divisionParam = url.searchParams.get('division');
const age = url.searchParams.get('age');
const requestedTeam = url.searchParams.get('teamId');
const preview = url.searchParams.get('preview') === '1';
const back = document.querySelector('#roster-back');
const note = document.querySelector('#roster-note');
const list = document.querySelector('#roster-players');
const template = document.querySelector('#roster-player');
const teamPicker = document.querySelector('#family-roster-team');

try {
  const [season, teams, catalog] = await Promise.all([
    setupSeasonPicker(document.querySelector('#family-roster-season'), { staff: preview }),
    loadRosterTeams(),
    divisionRequest(),
  ]);
  const direct = teams.find((item) => item.id === requestedTeam);
  if (requestedTeam && !direct) throw new Error('This team is no longer available.');
  const division = direct?.division ?? (catalog.some(({ name }) => name === divisionParam) ? divisionParam : divisions.get(divisionParam) ?? divisionParam) ?? (age ? 'U' + age : '');
  const entry = catalog.find(({ name }) => name === division);
  if (!entry) throw new Error('Choose a team from Classic Travel or a Rec League division to view its roster.');
  const choices = teams.filter((item) => item.division === division);
  const primaryId = age && '00000000-0000-4000-8000-' + age.padStart(12, '0');
  const team = direct ?? choices.find((item) => item.id === primaryId) ?? choices[0];
  back.href = preview ? '/manage-rosters.html?' + new URLSearchParams({ season: season.id, teamId: team?.id ?? '' }) :
    direct ? teamPage(direct) : divisionPage(entry);
  back.textContent = preview ? 'Back to Manage Rosters' : 'Back to ' + (direct?.name ?? division);
  if (!team) {
    note.textContent = 'No club teams have been added for this division yet.';
  } else {
    document.title = team.name + ' Roster | Tallmadge Soccer';
    document.querySelector('#roster-title').textContent = team.name + ' Roster';
    if (choices.length > 1) {
      for (const item of choices) teamPicker.add(new Option(item.name, item.id));
      teamPicker.value = team.id;
      teamPicker.parentElement.hidden = false;
      teamPicker.addEventListener('change', () => {
        url.searchParams.set('teamId', teamPicker.value);
        url.searchParams.set('season', season.id);
        location.assign(url.href);
      });
    }
    const players = await rosterRequest(team.id, season.id, preview ? 'preview' : null);
    const context = preview ? 'Staff preview · ' + season.name : season.name;
    note.textContent = players.length ? context : context + ' · No roster has been posted for this team yet.';
    for (const player of players) {
      const row = template.content.cloneNode(true);
      row.querySelector('.roster-number').textContent = '#' + player.number;
      const name = row.querySelector('.roster-name strong');
      name.textContent = player.displayName;
      name.hidden = !player.displayName;
      row.querySelector('.roster-name small').textContent = player.position;
      list.append(row);
    }
  }
} catch (error) {
  note.textContent = error.message;
}
