import { divisionRequest, populateDivisionSelect } from './division-data.js';
const form = document.querySelector('#live-team-editor');
const status = document.querySelector('#live-team-status');
const list = document.querySelector('#live-team-list');
const listStatus = document.querySelector('#live-team-list-status');
const filter = document.querySelector('#team-division-filter');
const empty = document.querySelector('#live-team-empty');
const heading = document.querySelector('#live-team-title');
const cancel = document.querySelector('#live-team-cancel');
const name = form.elements.namedItem('name');
const division = form.elements.namedItem('division');
const save = form.querySelector('button[type=submit]');
let teams = [];
let editing = null;
let newId;
let saving = false;

async function requestTeams(team, method = 'POST') {
  const token = sessionStorage.getItem('tallmadge-club-tab-session');
  const headers = token ? { 'X-Tallmadge-Club-Session': token } : {};
  const response = await fetch('/api/teams', team ? {
    method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(team),
  } : { cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    const fallback = method === 'DELETE' ? 'Could not delete the team. Refresh and try again.' : 'Could not load or save teams.';
    throw new Error(data?.error ?? fallback);
  }
  return data;
}

function reset() {
  editing = null;
  newId = undefined;
  form.reset();
  division.disabled = false;
  heading.textContent = 'Add a team';
  cancel.hidden = true;
}

function render() {
  teams.sort((a, b) => a.division.localeCompare(b.division, 'en', { numeric: true }) || a.name.localeCompare(b.name));
  list.replaceChildren();
  const visible = teams.filter((team) => !filter.value || team.division === filter.value);
  empty.hidden = visible.length > 0;
  empty.textContent = filter.value ? 'No teams in this division.' : 'No club teams have been added yet.';
  for (const team of visible) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const label = document.createElement('strong');
    label.textContent = team.name;
    const group = document.createElement('p');
    group.textContent = team.division;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link';
    edit.textContent = 'Edit name';
    edit.addEventListener('click', () => {
      if (saving) return;
      editing = team;
      heading.textContent = 'Edit team name';
      name.value = team.name;
      division.value = team.division;
      division.disabled = true;
      cancel.hidden = false;
      status.textContent = '';
      name.focus();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link schedule-delete';
    remove.textContent = 'Delete Team';
    remove.setAttribute('aria-label', 'Delete Team: ' + team.name);
    const confirmation = document.createElement('div');
    confirmation.hidden = true;
    const warning = document.createElement('p');
    warning.textContent = 'Permanently delete ' + team.name + ' (' + team.division + ')? This removes its rosters, games, ' +
      'scores, and staff assignments across all seasons. Standings will update for both teams in the deleted games.';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'link schedule-delete';
    confirm.textContent = 'Confirm Delete Team';
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'link';
    keep.textContent = 'Cancel';
    const feedback = document.createElement('p');
    feedback.setAttribute('role', 'status');
    const choices = document.createElement('div');
    choices.className = 'schedule-editor-actions';
    choices.append(confirm, keep);
    confirmation.append(warning, choices, feedback);

    remove.addEventListener('click', () => {
      listStatus.textContent = '';
      remove.hidden = true;
      confirmation.hidden = false;
      confirm.focus();
    });
    keep.addEventListener('click', () => {
      confirmation.hidden = true;
      feedback.textContent = '';
      remove.hidden = false;
      remove.focus();
    });
    confirm.addEventListener('click', () => deleteTeam(team, confirm, keep, feedback));
    const actions = document.createElement('div');
    actions.className = 'schedule-editor-actions';
    actions.append(edit, remove);
    row.append(label, group, actions, confirmation);
    list.append(row);
  }
}

async function deleteTeam(team, confirm, keep, feedback) {
  if (saving) {
    feedback.textContent = 'A team change is in progress. Try again in a moment.';
    return;
  }
  saving = true;
  confirm.disabled = true;
  keep.disabled = true;
  save.disabled = true;
  filter.disabled = true;
  feedback.textContent = 'Deleting team…';
  try {
    const result = await requestTeams({ id: team.id, revision: team.revision }, 'DELETE');
    if (result?.deleted !== true) throw new Error('Could not verify that the team was deleted. Refresh and try again.');
    teams = teams.filter((item) => item.id !== team.id);
    if (editing?.id === team.id) reset();
    render();
    listStatus.textContent = team.name + ' deleted.';
    listStatus.focus();
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    saving = false;
    confirm.disabled = false;
    keep.disabled = false;
    save.disabled = false;
    filter.disabled = false;
  }
}

filter.addEventListener('change', render);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  saving = true;
  save.disabled = true;
  status.textContent = 'Saving team…';
  try {
    const team = await requestTeams({
      id: editing?.id ?? (newId ??= crypto.randomUUID()), revision: editing?.revision ?? 0,
      name: name.value.trim(), division: division.value,
    });
    teams = [...teams.filter((entry) => entry.id !== team.id), team];
    reset();
    render();
    listStatus.textContent = '';
    status.textContent = 'Team saved.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saving = false;
    save.disabled = false;
  }
});

cancel.addEventListener('click', () => {
  if (saving) return;
  reset();
  status.textContent = '';
  name.focus();
});

try {
  const [saved, divisions] = await Promise.all([requestTeams(), divisionRequest()]);
  teams = saved;
  populateDivisionSelect(division, divisions);
  populateDivisionSelect(filter, divisions);
  filter.disabled = false;
  render();
  save.disabled = false;
  status.textContent = '';
} catch (error) {
  status.textContent = error.message;
}
