import { setupSeasonPicker } from './season-data.js';
import { loadFieldStatuses } from './field-status-data.js';
import { formatKickoff, gameFieldLabel, scheduleRequest } from './schedule-data.js';
import { divisionRequest, populateDivisionSelect } from './division-data.js';

const form = document.querySelector('#live-schedule-editor');
const title = document.querySelector('#live-schedule-title');
const message = document.querySelector('#live-schedule-message');
const cancel = document.querySelector('#live-schedule-cancel');
const list = document.querySelector('#live-schedule-games');
const empty = document.querySelector('#live-schedule-empty');
const controls = form.querySelector('fieldset');
const gameFields = ['division', 'date', 'time', 'field'];
const division = form.elements.namedItem('division');
const field = form.elements.namedItem('field');
const awayField = form.elements.namedItem('awayFieldName');
const awayFieldEntry = document.querySelector('#away-field-entry');
const sides = ['home', 'away'].map((key) => ({
  key,
  select: form.elements.namedItem(key),
  name: form.elements.namedItem(key + 'Name'),
  custom: form.querySelector('[data-team-name="' + key + '"]'),
}));
let games = [];
let divisions = [];
let clubTeamOptions = [];
let edit = null;
let newId;
let saving = false;
let selectedSeason;

function ownerRequest(game, method = 'POST') {
  const token = sessionStorage.getItem('tallmadge-club-tab-session');
  const headers = token ? { 'X-Tallmadge-Club-Session': token } : {};
  if (!game) return scheduleRequest(new URLSearchParams({ season: selectedSeason.id }), { headers });
  return scheduleRequest(null, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(game),
  });
}

function showTeamName(side) {
  const manual = side.select.value === 'opponent';
  side.custom.hidden = !manual;
  side.name.disabled = !manual;
  side.name.required = manual;
}

function setTeamChoices(names = {}) {
  const travel = divisions.some((item) => item.name === division.value && item.league === 'travel');
  const available = clubTeamOptions.filter((team) => team.division === division.value);
  for (const side of sides) {
    const name = names[side.key] ?? '';
    side.select.replaceChildren(new Option('Choose a team', ''));
    for (const team of available) side.select.add(new Option(team.name, team.id));
    const clubTeam = available.find((team) => names[side.key + 'TeamId'] ?
      team.id === names[side.key + 'TeamId'] : team.name.toLowerCase() === name.toLowerCase());
    if (division.value) side.select.add(new Option(travel || available.length ? 'Opponent / other team' : 'Enter team name', 'opponent'));
    side.select.disabled = !division.value;
    side.select.value = clubTeam ? clubTeam.id : name ? 'opponent' : '';
    side.name.value = clubTeam ? '' : name;
    showTeamName(side);
  }
}

for (const side of sides) {
  side.select.addEventListener('change', () => showTeamName(side));
}

division.addEventListener('change', () => {
  const names = Object.fromEntries(sides.filter((side) => side.select.value === 'opponent')
    .map((side) => [side.key, side.name.value]));
  setTeamChoices(names);
});

function showAwayField() {
  const isAway = field.value === 'away';
  awayFieldEntry.hidden = !isAway;
  awayField.disabled = !isAway;
  awayField.required = isAway;
}

field.addEventListener('change', showAwayField);

function reset() {
  edit = null;
  newId = undefined;
  form.reset();
  showAwayField();
  setTeamChoices();
  title.textContent = 'Add a game';
  cancel.hidden = true;
}

function render() {
  games.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  empty.hidden = games.length > 0;
  list.replaceChildren();
  for (const game of games) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const match = document.createElement('strong');
    match.textContent = game.home + ' vs. ' + game.away;
    const details = document.createElement('p');
    details.textContent = game.division + ' · ' + game.date + ' · ' + formatKickoff(game.time) + ' ET · ' + gameFieldLabel(game);
    const actions = document.createElement('div');
    actions.className = 'schedule-editor-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link';
    button.textContent = 'Edit game';
    button.addEventListener('click', () => {
      if (saving) return;
      edit = game;
      for (const key of gameFields) form.elements.namedItem(key).value = game[key];
      awayField.value = game.awayFieldName ?? '';
      showAwayField();
      setTeamChoices(game);
      title.textContent = 'Edit game';
      cancel.hidden = false;
      message.textContent = '';
      form.elements.namedItem('date').focus();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link schedule-delete';
    remove.textContent = 'Delete game';
    remove.addEventListener('click', () => deleteGame(game, remove));
    actions.append(button, remove);
    row.append(match, details, actions);
    list.append(row);
  }
}

async function deleteGame(game, button) {
  if (saving || !window.confirm(
    'Delete ' + game.home + ' vs. ' + game.away + ' on ' + game.date + '? This removes the game from both team schedules.'
  )) return;
  saving = true;
  controls.disabled = true;
  button.disabled = true;
  message.textContent = 'Deleting game…';
  try {
    await ownerRequest({ id: game.id, revision: game.revision }, 'DELETE');
    games = games.filter((entry) => entry.id !== game.id);
    if (edit?.id === game.id) reset();
    render();
    message.textContent = 'Game deleted from both team schedules.';
    message.focus();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    saving = false;
    controls.disabled = false;
    button.disabled = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  const game = Object.fromEntries(gameFields.map((key) => [key, form.elements.namedItem(key).value.trim()]));
  for (const side of sides) {
    const team = clubTeamOptions.find((item) => item.id === side.select.value);
    game[side.key] = team?.name ?? side.name.value.trim();
    game[side.key + 'TeamId'] = team?.id ?? null;
  }
  if (game.field === 'away') game.awayFieldName = awayField.value.trim();
  const id = edit?.id ?? (newId ??= crypto.randomUUID());
  saving = true;
  controls.disabled = true;
  message.textContent = 'Saving game…';
  try {
    const saved = await ownerRequest({ ...game, id, seasonId: selectedSeason.id, revision: edit?.revision ?? 0 });
    games = [...games.filter((entry) => entry.id !== saved.id), saved];
    reset();
    render();
    message.textContent = 'Game saved to both team schedules.';
  } catch (error) {
    message.textContent = error.message;
  } finally {
    saving = false;
    controls.disabled = false;
  }
});

cancel.addEventListener('click', () => {
  reset();
  message.textContent = 'Edit canceled.';
  form.elements.namedItem('division').focus();
});

async function initialize() {
  try {
    selectedSeason = await setupSeasonPicker(document.querySelector('#season-picker'), { staff: true });
    const teamsRequest = fetch('/api/teams', { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error('Could not load club teams.');
      return response.json();
    });
    const [saved, fields, teams, catalog] = await Promise.all([ownerRequest(), loadFieldStatuses(), teamsRequest, divisionRequest()]);
    divisions = catalog;
    populateDivisionSelect(division, divisions);
    games = saved;
    clubTeamOptions = teams;
    setTeamChoices();
    const awayOption = field.options[1];
    for (const id of fields.keys()) field.add(new Option('Field ' + id, id), awayOption);
    render();
    controls.disabled = false;
    message.textContent = fields.size ? '' : 'Away fields are available. No club fields are listed.';
  } catch (error) {
    message.textContent = error.message;
  }
}

setTeamChoices();
initialize();
