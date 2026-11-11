import { seasonRequest } from './season-data.js';

const form = document.querySelector('#season-editor');
const list = document.querySelector('#season-list');
const status = document.querySelector('#season-status');
const listStatus = document.querySelector('#season-list-status');
const submit = form.querySelector('button[type=submit]');
let seasons = [];
let saving = false;

function actionButton(text, type = 'button') {
  const button = document.createElement('button');
  button.type = type;
  button.className = 'link';
  button.textContent = text;
  return button;
}

function rowStatus() {
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'status');
  return feedback;
}

function renameControl(season) {
  const details = document.createElement('details');
  details.className = 'season-rename';
  const toggle = document.createElement('summary');
  toggle.className = 'link';
  toggle.textContent = 'Edit name';
  toggle.setAttribute('aria-label', 'Edit name for ' + season.name);
  const editor = document.createElement('form');
  const label = document.createElement('label');
  label.textContent = 'Season name';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = season.name;
  input.required = true;
  input.maxLength = 60;
  label.append(input);
  const actions = document.createElement('div');
  actions.className = 'schedule-editor-actions';
  const apply = actionButton('Save name', 'submit');
  const cancel = actionButton('Cancel');
  const feedback = rowStatus();
  actions.append(apply, cancel);
  editor.append(label, actions, feedback);
  details.append(toggle, editor);

  cancel.addEventListener('click', () => {
    details.open = false;
    input.value = season.name;
    feedback.textContent = '';
    toggle.focus();
  });
  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    input.disabled = true;
    cancel.disabled = true;
    try {
      await save({ action: 'rename', id: season.id, name: input.value }, apply, feedback);
    } finally {
      input.disabled = false;
      cancel.disabled = false;
    }
  });
  return details;
}

function appendDelete(row, controls, season) {
  const remove = actionButton('Delete season');
  remove.className = 'season-action season-action-delete';
  remove.setAttribute('aria-label', 'Delete ' + season.name);
  const confirmation = document.createElement('div');
  confirmation.hidden = true;
  confirmation.className = 'season-delete-confirmation';
  const question = document.createElement('p');
  question.textContent = 'Permanently delete ' + season.name + '?';
  const actions = document.createElement('div');
  actions.className = 'schedule-editor-actions';
  const confirm = actionButton('Confirm deletion');
  confirm.className = 'season-action season-action-confirm';
  const cancel = actionButton('Cancel');
  cancel.className = 'season-action';
  const feedback = rowStatus();
  actions.append(confirm, cancel);
  confirmation.append(question, actions, feedback);
  controls.append(remove);
  row.append(confirmation);

  remove.addEventListener('click', () => {
    listStatus.textContent = '';
    remove.hidden = true;
    confirmation.hidden = false;
    confirm.focus();
  });
  cancel.addEventListener('click', () => {
    confirmation.hidden = true;
    feedback.textContent = '';
    remove.hidden = false;
    remove.focus();
  });
  confirm.addEventListener('click', async () => {
    cancel.disabled = true;
    try {
      await save({ action: 'delete', id: season.id }, confirm, feedback);
    } finally {
      cancel.disabled = false;
    }
  });
}

function render() {
  const sorted = [...seasons].sort((a, b) => b.is_active - a.is_active || a.is_test - b.is_test);
  list.replaceChildren();
  for (const season of sorted) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const name = document.createElement('strong');
    name.textContent = season.name;
    const detail = document.createElement('p');
    detail.textContent = season.is_active ? 'Active · Opens by default' : season.is_test ? 'Staff only · Excluded from public schedules and standings' : 'Available in the public season picker';
    row.append(name, detail, renameControl(season));
    if (!season.is_active) {
      const controls = document.createElement('div');
      controls.className = 'season-actions';
      if (!season.is_test) {
        const button = actionButton('Make active');
        button.className = 'season-action season-action-active';
        button.addEventListener('click', () => save({ action: 'activate', id: season.id }, button, listStatus));
        controls.append(button);
      }
      row.append(controls);
      appendDelete(row, controls, season);
    }
    list.append(row);
  }
}

async function save(input, button, feedback = status) {
  if (saving) {
    feedback.textContent = 'A season change is in progress. Try again in a moment.';
    return;
  }
  const { action, id } = input;
  const name = seasons.find((item) => item.id === id)?.name;
  saving = true;
  button.disabled = true;
  submit.disabled = true;
  feedback.textContent = action === 'delete' ? 'Deleting season…' : 'Saving season…';
  try {
    const saved = await seasonRequest({ action: input });
    if (action === 'activate') {
      seasons = seasons.map((item) => item.id === saved.id ? saved : { ...item, is_active: 0 });
      listStatus.textContent = saved.name + ' is now active.';
    } else if (action === 'rename') {
      seasons = seasons.map((item) => item.id === saved.id ? saved : item);
      listStatus.textContent = 'Saved as ' + saved.name + '.';
    } else if (action === 'delete') {
      if (saved?.deleted !== true) throw new Error('Could not verify deletion. Refresh and try again.');
      seasons = seasons.filter((item) => item.id !== id);
      listStatus.textContent = name + ' deleted.';
    } else {
      seasons.push(saved);
      form.reset();
      status.textContent = saved.name + ' added.';
    }
    render();
    if (action !== 'create') listStatus.focus();
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    saving = false;
    button.disabled = false;
    submit.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  save({ action: 'create', name: form.elements.namedItem('name').value }, submit);
});

try {
  seasons = await seasonRequest({ staff: true });
  render();
  status.textContent = '';
  submit.disabled = false;
} catch (error) {
  status.textContent = error.message;
}
