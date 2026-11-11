import { setupSeasonPicker } from './season-data.js';
import { loadRosterTeams, rosterRequest } from './roster-data.js';

const form = document.querySelector('#live-roster-editor');
const fields = form.querySelector('fieldset');
const picker = document.querySelector('#roster-team-picker');
const list = document.querySelector('#live-roster-players');
const status = document.querySelector('#live-roster-status');
const heading = document.querySelector('#live-roster-title');
const cancel = document.querySelector('#live-roster-cancel');
const preview = document.querySelector('#roster-preview-link');
const keys = ['name', 'displayName', 'number', 'birthday', 'position'];
const url = new URL(location.href);
let season;
let team;
let players = [];
let editing = null;
let newId;
let saving = false;

function reset() {
  editing = null;
  newId = undefined;
  form.reset();
  heading.textContent = 'Add a player';
  cancel.hidden = true;
}

function render() {
  list.replaceChildren();
  for (const player of [...players].sort((a, b) => a.number - b.number || a.name.localeCompare(b.name))) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const name = document.createElement('strong');
    name.textContent = '#' + player.number + ' · ' + player.name;
    const detail = document.createElement('p');
    detail.textContent = [player.position, player.birthday && 'Birthday: ' + player.birthday,
      player.displayName ? 'Family display: ' + player.displayName : 'Family display name hidden'].filter(Boolean).join(' · ');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link';
    edit.textContent = 'Edit player';
    edit.addEventListener('click', () => {
      if (saving) return;
      editing = player;
      for (const key of keys) form.elements.namedItem(key).value = player[key] ?? '';
      heading.textContent = 'Edit player';
      cancel.hidden = false;
      status.textContent = '';
      form.elements.namedItem('name').focus();
    });
    row.append(name, detail, edit);
    list.append(row);
  }
}

picker.addEventListener('change', () => {
  if (picker.value) url.searchParams.set('teamId', picker.value);
  else url.searchParams.delete('teamId');
  url.searchParams.set('season', season.id);
  location.assign(url.href);
});

cancel.addEventListener('click', () => {
  if (saving) return;
  reset();
  status.textContent = '';
  form.elements.namedItem('name').focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || !team) return;
  const player = Object.fromEntries(keys.map((key) => [key, form.elements.namedItem(key).value]));
  if (!player.number) return;
  player.number = Number(player.number);
  saving = true;
  fields.disabled = true;
  status.textContent = 'Saving player…';
  try {
    const saved = await rosterRequest(team.id, season.id, 'staff', {
      ...player, id: editing?.id ?? (newId ??= crypto.randomUUID()), revision: editing?.revision ?? 0,
    });
    players = [...players.filter((entry) => entry.id !== saved.id), saved];
    reset();
    render();
    status.textContent = 'Player saved to this roster.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saving = false;
    fields.disabled = false;
  }
});

try {
  let teams;
  [season, teams] = await Promise.all([
    setupSeasonPicker(document.querySelector('#roster-season-picker'), { staff: true }), loadRosterTeams(),
  ]);
  for (const item of teams) picker.add(new Option(item.division + ' · ' + item.name, item.id));
  picker.disabled = teams.length === 0;
  team = teams.find((item) => item.id === url.searchParams.get('teamId'));
  if (team) {
    picker.value = team.id;
    players = await rosterRequest(team.id, season.id, 'staff');
    render();
    fields.disabled = false;
    preview.href = '/team-roster.html?' + new URLSearchParams({ teamId: team.id, season: season.id, preview: '1' });
    preview.hidden = false;
  }
  status.textContent = team ? (players.length ? '' : 'No players have been added to this roster.') : 'Choose a club team.';
} catch (error) {
  status.textContent = error.message;
}
