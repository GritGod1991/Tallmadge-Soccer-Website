import { readTeams } from './demo-teams.js';

const form = document.querySelector('#coach-editor');
const picker = form.elements.namedItem('team');
const fields = document.querySelector('#coach-editor-fields');
const title = document.querySelector('#coach-editor-title');
const message = document.querySelector('#coach-editor-status');
const cancel = document.querySelector('#cancel-coach-edit');
const list = document.querySelector('#coach-drafts');
const empty = document.querySelector('#coach-drafts-empty');
const key = 'tallmadge-demo-coach-drafts';
const profileFields = ['name', 'role', 'bio'];
let editingId = null;

picker.add(new Option('Choose a team', ''));
for (const team of readTeams()) picker.add(new Option(`${team.name} · ${team.division}`, team.id));

function readCoaches() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function resetProfile() {
  editingId = null;
  for (const field of profileFields) form.elements.namedItem(field).value = '';
  title.textContent = 'Add a coach';
  fields.disabled = !picker.value;
  cancel.hidden = true;
}

function renderCoaches() {
  list.replaceChildren();
  const coaches = readCoaches().filter((coach) => coach.team === picker.value);
  empty.hidden = coaches.length > 0;
  empty.textContent = picker.value ? 'No coaching drafts for this team yet.' : 'Choose a team to view its coaching drafts.';
  for (const coach of coaches) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const name = document.createElement('strong');
    name.textContent = `${coach.name} · ${coach.role}`;
    const bio = document.createElement('p');
    bio.textContent = coach.bio;
    bio.hidden = !coach.bio;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link';
    edit.textContent = 'Edit profile';
    edit.addEventListener('click', () => {
      editingId = coach.id;
      for (const field of profileFields) form.elements.namedItem(field).value = coach[field];
      title.textContent = 'Edit coaching profile';
      message.textContent = '';
      cancel.hidden = false;
      form.elements.namedItem('name').focus();
    });
    row.append(name, bio, edit);
    list.append(row);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const team = picker.value;
  const profile = Object.fromEntries(profileFields.map((field) => [field, form.elements.namedItem(field).value.trim()]));
  if (!readTeams().some((entry) => entry.id === team) || !profile.name || !['Head Coach', 'Assistant Coach'].includes(profile.role)) {
    message.textContent = 'Choose a team and enter the coach’s name and role.';
    return;
  }
  const coaches = readCoaches();
  if (editingId && !coaches.some((coach) => coach.id === editingId && coach.team === team)) {
    message.textContent = 'This coaching draft is unavailable. Choose the team again.';
    return;
  }
  const id = editingId ?? crypto.randomUUID();
  try {
    localStorage.setItem(key, JSON.stringify([...coaches.filter((coach) => coach.id !== id), { ...profile, team, id }]));
  } catch {
    message.textContent = 'Could not save the coaching draft in this browser.';
    return;
  }
  resetProfile();
  renderCoaches();
  message.textContent = 'Coaching draft saved in this browser.';
});
picker.addEventListener('change', () => {
  resetProfile();
  renderCoaches();
  message.textContent = '';
});
cancel.addEventListener('click', () => {
  resetProfile();
  message.textContent = 'Edit canceled.';
});
resetProfile();
renderCoaches();
