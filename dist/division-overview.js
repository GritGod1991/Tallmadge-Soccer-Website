import { divisionPage, divisionRequest, isSplitU10, isU10Division, leagueLabels, teamPage } from './division-data.js';
import { loadRosterTeams } from './roster-data.js';
import { teamScheduleLink } from './schedule-data.js';

const params = new URLSearchParams(location.search);
const requestedTeam = params.get('teamId');
const requestedDivision = params.get('division');
const status = document.querySelector('#division-status');
const menu = document.querySelector('#division-options');
const teamList = document.querySelector('#division-team-list');
const sections = document.querySelectorAll('[data-section]');
const back = document.querySelector('#division-back');

function showTeams(division, teams, catalog) {
  const members = teams.filter((team) => team.division === division.name);
  for (const team of members) {
    const link = document.createElement('a');
    link.className = 'league-option league-' + division.league;
    link.href = teamPage(team);
    link.textContent = team.name;
    teamList.append(link);
  }
  if (!members.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No teams have been added to this division yet.';
    teamList.append(empty);
  }
  teamList.hidden = false;
  const schedule = document.querySelector('#division-schedule-link');
  schedule.href = teamScheduleLink(division.name);
  schedule.hidden = false;
  for (const link of sections) link.hidden = true;
  const u10Group = isU10Division(division) && catalog.some(isSplitU10);
  back.href = u10Group ? '/classic-travel-u10.html' : division.league === 'travel' ? '/classic-travel.html' : '/rec-league.html';
  back.textContent = u10Group ? 'Back to U10' : 'Back to ' + leagueLabels[division.league];
}

function showSections(division, team) {
  const travel = division.league === 'travel';
  back.href = divisionPage(division);
  back.textContent = 'Back to ' + division.name + ' teams';
  const query = new URLSearchParams({ teamId: team.id });
  for (const link of sections) {
    const section = link.dataset.section;
    link.hidden = !travel && ['standings', 'history'].includes(section);
    if (travel && section === 'info') {
      link.setAttribute('aria-disabled', 'true');
    } else {
      link.href = section === 'info' ?
        '/rec-division.html?' + new URLSearchParams({ name: division.name, section, teamId: team.id }) :
        '/team-' + section + '.html?' + query;
    }
    link.classList.add('league-' + division.league);
  }
}

try {
  const [catalog, teams] = await Promise.all([divisionRequest(), loadRosterTeams()]);
  const team = teams.find(({ id }) => id === requestedTeam);
  if (requestedTeam && !team) throw new Error('This team is no longer available.');
  const name = team?.division ?? requestedDivision;
  const division = catalog.find((item) => item.name === name) ?? catalog.find((item) => name && item.originalName === name);
  if (!division) throw new Error('This division is no longer available.');
  const title = team?.name ?? division.name;
  document.title = title + ' | Tallmadge Soccer';
  document.querySelector('h1').textContent = title;
  if (team) showSections(division, team);
  else showTeams(division, teams, catalog);
  status.hidden = true;
  menu.hidden = false;
} catch (error) {
  status.textContent = error.message;
}
