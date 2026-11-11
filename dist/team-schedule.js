import { setupSeasonPicker } from './season-data.js';
import { divisionPage, divisionRequest, teamPage } from './division-data.js';
import { loadRosterTeams } from './roster-data.js';
import { formatKickoff, gameFieldLabel, scheduleRequest } from './schedule-data.js';

const params = new URLSearchParams(location.search);
const age = params.get('age');
const validAge = /^(9|10|11|12|13|14)$/.test(age ?? '');
let division = params.get('division') ?? (validAge ? 'U' + age : '');
let team = params.get('team')?.trim() || (validAge && !params.has('division') ? 'Tallmadge U' + age : '');
const requestedTeam = params.get('teamId');
const title = document.querySelector('#schedule-title');
const back = document.querySelector('#schedule-back');
const note = document.querySelector('#schedule-data-note');
const filter = document.querySelector('#schedule-filter');
const count = document.querySelector('#schedule-count');
const games = document.querySelector('#team-games');
const dateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
});
const easternClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const escaped = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => escaped[char]);

function gameCard(game, next) {
  const final = Boolean(game.score);
  const date = dateFormat.format(new Date(game.date));
  const rows = [game.home, game.away].map((name, index) => {
    return '<div class="schedule-team"><span>' + escape(name) + '<small>' + (index === 0 ? 'Home' : 'Away') +
      '</small></span>' + (final ? '<b>' + game.score[index] + '</b>' : '') + '</div>';
  }).join('');
  return '<article class="schedule-game' + (next ? ' schedule-next' : '') + '">' +
    (next ? '<div class="schedule-next-label">★ Next Game</div>' : '') +
    '<div class="schedule-game-top"><time datetime="' + escape(game.date) + '">' + date + '</time><span>' +
    escape(game.field) + '</span></div><div class="schedule-game-body"><div class="schedule-teams">' + rows +
    '</div><div class="schedule-game-meta"><span class="schedule-tag">' + (final ? 'Final' : 'Scheduled') +
    '</span><strong>' + escape(game.timeLabel) + '</strong></div></div></article>';
}

function showGames(rows) {
  const now = easternClock.format(new Date()).replace(' ', 'T');
  const upcoming = (game) => !game.score && (game.date + 'T' + game.time >= now);
  const next = rows.find(upcoming);
  function render() {
    const selected = filter.value;
    const visible = rows.filter((game) => selected === 'all' || (selected === 'final' ? game.score : upcoming(game)));
    count.textContent = visible.length + (visible.length === 1 ? ' game' : ' games');
    games.innerHTML = visible.map((game) => gameCard(game, game === next)).join('');
    if (!visible.length) games.textContent = 'No games to show.';
  }
  filter.addEventListener('change', render);
  render();
}

async function loadSchedule() {
  const [catalog, teams] = await Promise.all([divisionRequest(), requestedTeam ? loadRosterTeams() : []]);
  const selectedTeam = teams.find(({ id }) => id === requestedTeam);
  if (selectedTeam) {
    division = selectedTeam.division;
    team = selectedTeam.name;
  }
  const entry = catalog.find(({ name }) => name === division);
  if (!entry || team.length > 80 || (requestedTeam && !selectedTeam)) {
    filter.closest('.schedule-controls').hidden = true;
    note.textContent = '';
    games.textContent = requestedTeam ? 'This team is no longer available.' : 'Choose a division or team to view its schedule.';
    return;
  }
  function setHeading() {
    const heading = (team || division) + ' Schedule';
    title.textContent = heading;
    document.title = heading + ' | Tallmadge Soccer';
  }
  setHeading();
  back.href = selectedTeam ? teamPage(selectedTeam) : divisionPage(entry);
  back.textContent = 'Back to ' + (selectedTeam?.name ?? (entry.league === 'travel' ? division + ' Classic Travel' : division));

  const query = new URLSearchParams({ division });
  if (team) query.set('team', team);
  if (selectedTeam) query.set('teamId', selectedTeam.id);
  try {
    const season = await setupSeasonPicker(document.querySelector('#season-picker'));
    query.set('season', season.id);
    if (!selectedTeam && validAge && !params.has('division') && !params.has('team')) {
      const response = await fetch('/api/teams', { cache: 'no-store' });
      if (response.ok) {
        const primaryId = '00000000-0000-4000-8000-' + age.padStart(12, '0');
        const primary = (await response.json()).find((item) => item.id === primaryId);
        if (primary) {
          team = primary.name;
          query.set('team', team);
          query.set('teamId', primary.id);
          setHeading();
        }
      }
    }
    const saved = await scheduleRequest(query);
    note.textContent = 'Saved games · Kickoff times are Eastern';
    showGames(saved.map((game) => ({ ...game, field: gameFieldLabel(game), timeLabel: formatKickoff(game.time) + ' ET' })));
  } catch {
    note.textContent = 'Could not load the schedule. Refresh to try again.';
  }
}

loadSchedule().catch(() => {
  note.textContent = 'Could not load the schedule. Refresh to try again.';
});
