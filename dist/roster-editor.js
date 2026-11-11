import { readTeams } from './demo-teams.js';

const form = document.querySelector('#roster-editor');
const picker = form.elements.namedItem('team');
const fields = document.querySelector('#roster-editor-fields');
const title = document.querySelector('#roster-editor-title');
const message = document.querySelector('#roster-editor-status');
const cancel = document.querySelector('#cancel-roster-edit');
const list = document.querySelector('#roster-drafts');
const empty = document.querySelector('#roster-drafts-empty');
const key = 'tallmadge-demo-roster-drafts';
const names = ['name', 'number', 'birthday', 'position'];
let editingId = null;

picker.add(new Option('Choose a team', ''));
for (const team of readTeams()) picker.add(new Option(`${team.name} · ${team.division}`, team.id));

function readPlayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function resetPlayer() {
  editingId = null;
  for (const name of names) form.elements.namedItem(name).value = '';
  title.textContent = 'Add a player';
  fields.disabled = !picker.value;
  cancel.hidden = true;
}

function renderPlayers() {
  list.replaceChildren();
  const players = readPlayers().filter((player) => player.team === picker.value);
  empty.hidden = players.length > 0;
  empty.textContent = picker.value ? 'No player drafts for this team yet.' : 'Choose a team to view its roster drafts.';
  for (const player of players.sort((a, b) => Number(a.number) - Number(b.number))) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const name = document.createElement('strong');
    name.textContent = `#${player.number} · ${player.name}`;
    const details = document.createElement('p');
    details.textContent = player.position ? `Birthday: ${player.birthday} · ${player.position}` : `Birthday: ${player.birthday}`;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link';
    edit.textContent = 'Edit player';
    edit.addEventListener('click', () => {
      editingId = player.id;
      for (const field of names) form.elements.namedItem(field).value = player[field];
      title.textContent = 'Edit player draft';
      message.textContent = '';
      cancel.hidden = false;
      form.elements.namedItem('name').focus();
    });
    row.append(name, details, edit);
    list.append(row);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const team = picker.value;
  const player = Object.fromEntries(names.map((field) => [field, form.elements.namedItem(field).value.trim()]));
  if (!readTeams().some((entry) => entry.id === team) || !player.name || !player.number || !player.birthday) {
    message.textContent = 'Choose a team and enter a name, jersey number, and birthday.';
    return;
  }
  const players = readPlayers();
  if (editingId && !players.some((entry) => entry.id === editingId && entry.team === team)) {
    message.textContent = 'This player draft is unavailable. Choose the team again.';
    return;
  }
  if (players.some((entry) => entry.team === team && entry.id !== editingId && Number(entry.number) === Number(player.number))) {
    message.textContent = 'That jersey number is already in use on this team.';
    return;
  }
  const id = editingId ?? crypto.randomUUID();
  try {
    localStorage.setItem(key, JSON.stringify([...players.filter((entry) => entry.id !== id), { ...player, team, id }]));
  } catch {
    message.textContent = 'Could not save the player draft in this browser.';
    return;
  }
  resetPlayer();
  renderPlayers();
  message.textContent = 'Player draft saved in this browser.';
});
picker.addEventListener('change', () => {
  resetPlayer();
  renderPlayers();
  message.textContent = '';
});
cancel.addEventListener('click', () => {
  resetPlayer();
  message.textContent = 'Edit canceled.';
});
resetPlayer();
renderPlayers();
