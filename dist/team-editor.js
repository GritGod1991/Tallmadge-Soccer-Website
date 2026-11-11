import { readTeams, storageKey } from './demo-teams.js';

const editor = document.querySelector('#team-editor');
const nameInput = editor.elements.namedItem('name');
const divisionInput = editor.elements.namedItem('division');
const scope = document.querySelector('#team-scope');
const scopeNote = document.querySelector('#team-scope-note');
const title = document.querySelector('#team-editor-title');
const message = document.querySelector('#team-editor-status');
const cancel = document.querySelector('#cancel-team-edit');
const list = document.querySelector('#team-drafts');
let editingId = null;

function resetEditor() {
  editingId = null;
  editor.reset();
  title.textContent = 'Add a team';
  cancel.hidden = true;
}

function renderTeams() {
  scopeNote.textContent = 'Club-wide access to add and edit Rec League and Classic Travel teams.';
  list.replaceChildren();
  for (const team of readTeams()) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const name = document.createElement('strong');
    name.textContent = team.name;
    const division = document.createElement('p');
    division.textContent = team.division;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link';
    edit.textContent = 'Edit team';
    edit.addEventListener('click', () => {
      editingId = team.id;
      editor.hidden = false;
      nameInput.value = team.name;
      divisionInput.value = team.division;
      title.textContent = 'Edit team';
      cancel.hidden = false;
      message.textContent = '';
      nameInput.focus();
    });
    row.append(name, division, edit);
    list.append(row);
  }
}

editor.addEventListener('submit', (event) => {
  event.preventDefault();
  const teams = readTeams();
  const original = teams.find((team) => team.id === editingId);
  if (editingId && !original) {
    message.textContent = 'Choose a team you can edit.';
    return;
  }
  const name = nameInput.value.trim();
  const division = divisionInput.value;
  if (!name || !division) {
    message.textContent = 'Enter a team name and choose a division.';
    return;
  }
  if (teams.some((team) => team.id !== editingId && team.division === division && team.name.toLowerCase() === name.toLowerCase())) {
    message.textContent = 'That team name is already in this division.';
    return;
  }
  const id = editingId ?? crypto.randomUUID();
  const next = original ? teams.map((team) => team.id === id ? { id, name, division } : team)
    : [...teams, { id, name, division }];
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    message.textContent = 'Could not save the team draft in this browser.';
    return;
  }
  resetEditor();
  renderTeams();
  message.textContent = 'Team draft saved in this browser.';
});

scope.addEventListener('change', () => {
  resetEditor();
  renderTeams();
  message.textContent = '';
});
cancel.addEventListener('click', () => {
  resetEditor();
  message.textContent = 'Edit canceled.';
});
resetEditor();
renderTeams();
