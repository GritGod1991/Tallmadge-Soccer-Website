import { setupSeasonPicker } from './season-data.js';
import { scheduleRequest } from './schedule-data.js';
import { divisionPage, divisionRequest, teamPage } from './division-data.js';
import { loadRosterTeams } from './roster-data.js';

const params = new URLSearchParams(location.search);
const age = params.get('age');
const requestedTeam = params.get('teamId');
const [divisions, teams] = await Promise.all([
  divisionRequest().catch(() => null),
  requestedTeam ? loadRosterTeams().catch(() => null) : [],
]);
const selectedTeam = teams?.find(({ id }) => id === requestedTeam);
const division = selectedTeam?.division ?? params.get('division') ?? (age ? 'U' + age : '');
const headers = Array.from(document.querySelectorAll('[data-stat]'));
const rows = document.querySelector('#standings-rows');
const sortMessage = document.querySelector('#standings-sort-message');
const club = selectedTeam?.name ?? 'Tallmadge ' + division;
const note = document.querySelector('#standings-note');

function standingsFromGames(games) {
  const teams = new Map();
  for (const game of games) {
    const names = [game.home, game.away];
    const entries = names.map((name) => {
      const key = name.toLowerCase();
      if (!teams.has(key)) {
        teams.set(key, { name, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, difference: 0, points: 0 });
      }
      return teams.get(key);
    });
    if (!game.score) continue;
    for (const [index, team] of entries.entries()) {
      const goalsFor = game.score[index];
      const goalsAgainst = game.score[1 - index];
      team.played += 1;
      team.goalsFor += goalsFor;
      team.goalsAgainst += goalsAgainst;
      team.difference += goalsFor - goalsAgainst;
      if (goalsFor > goalsAgainst) {
        team.wins += 1;
        team.points += 3;
      } else if (goalsFor === goalsAgainst) {
        team.draws += 1;
        team.points += 1;
      } else {
        team.losses += 1;
      }
    }
  }
  return [...teams.values()].sort(leagueOrder);
}

function leagueOrder(a, b) {
  return b.points - a.points || b.difference - a.difference || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name);
}

let ranked = [];
let stat = 'points';
let descending = true;

function renderStandings() {
  const ordered = [...ranked].sort((a, b) => {
    const difference = descending ? b[stat] - a[stat] : a[stat] - b[stat];
    return difference || leagueOrder(a, b);
  });

  for (const button of headers) {
    const active = button.dataset.stat === stat;
    if (active) button.parentElement.setAttribute('aria-sort', descending ? 'descending' : 'ascending');
    else button.parentElement.removeAttribute('aria-sort');
    button.lastElementChild.textContent = active ? (descending ? '▼' : '▲') : '';
  }

  rows.replaceChildren(...ordered.map((team) => {
    const row = document.createElement('tr');
    if (team.name.toLowerCase() === club.toLowerCase()) row.className = 'standings-club';
    const rank = row.insertCell();
    rank.textContent = ranked.indexOf(team) + 1;
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = team.name;
    row.append(name);
    for (const button of headers) {
      const cell = row.insertCell();
      const key = button.dataset.stat;
      if (key === stat) cell.className = 'standings-active-stat';
      cell.textContent = team[key];
    }
    return row;
  }));
  const active = headers.find((button) => button.dataset.stat === stat);
  sortMessage.textContent = `Sorted by ${active.title.toLowerCase()}, ${descending ? 'highest first' : 'lowest first'}.`;
}

const entry = divisions?.find(({ name, league }) => name === division && league === 'travel');
if (!divisions || !teams) {
  note.textContent = 'Could not load standings. Refresh to try again.';
} else if (requestedTeam && !selectedTeam) {
  note.textContent = 'This team is no longer available.';
} else if (entry && !selectedTeam) {
  location.replace(divisionPage(entry));
} else if (entry) {
  const title = selectedTeam.name + ' Standings';
  document.title = title + ' | Tallmadge Soccer';
  document.querySelector('#standings-title').textContent = title;
  document.querySelector('#standings-division').textContent = `Classic Travel · ${division}`;
  const back = document.querySelector('#standings-back');
  back.href = teamPage(selectedTeam);
  back.textContent = 'Back to ' + selectedTeam.name;
  for (const button of headers) {
    button.addEventListener('click', () => {
      const next = button.dataset.stat;
      descending = next === stat ? !descending : next !== 'goalsAgainst';
      stat = next;
      renderStandings();
    });
  }
  try {
    const season = await setupSeasonPicker(document.querySelector('#season-picker'));
    const query = new URLSearchParams({
      division, season: season.id, team: selectedTeam.name, teamId: selectedTeam.id,
    });
    const finals = (await scheduleRequest(query)).filter((game) => game.score);
    ranked = standingsFromGames(finals);
    note.textContent = finals.length ? 'Based on posted results for games involving ' + selectedTeam.name + ' · 3 points for a win, 1 for a draw' :
      'No final scores have been posted for this team yet.';
    document.querySelector('.standings-panel').hidden = ranked.length === 0;
    if (ranked.length) renderStandings();
  } catch {
    note.textContent = 'Could not load standings. Refresh to try again.';
  }
} else {
  note.hidden = true;
  document.querySelector('#standings-empty').hidden = false;
}
