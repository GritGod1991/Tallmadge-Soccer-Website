import { divisionRequest, leagueLabels, populateDivisionSelect, sortedDivisions } from './division-data.js';

const form = document.querySelector('#division-editor');
const list = document.querySelector('#division-list');
const empty = document.querySelector('#division-empty');
const leagueFilter = document.querySelector('#division-league-filter');
const divisionFilter = document.querySelector('#division-name-filter');
const status = document.querySelector('#division-status');
const listStatus = document.querySelector('#division-list-status');
const submit = form.querySelector('button');
let divisions = [];
let saving = false;

function leagueDivisions() {
  return divisions.filter((item) => !leagueFilter.value || item.league === leagueFilter.value);
}

function updateDivisionFilter(selected = divisionFilter.value) {
  const available = leagueDivisions();
  divisionFilter.replaceChildren(new Option('All divisions', ''));
  populateDivisionSelect(divisionFilter, available);
  divisionFilter.value = available.some(({ name }) => name === selected) ? selected : '';
  divisionFilter.disabled = available.length === 0;
  render();
}

function render() {
  const matching = leagueDivisions().filter(({ name }) => !divisionFilter.value || name === divisionFilter.value);
  const sorted = Object.keys(leagueLabels).flatMap((league) => sortedDivisions(matching, league));
  list.replaceChildren();
  for (const item of sorted) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const detail = document.createElement('p');
    detail.textContent = leagueLabels[item.league];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link';
    button.textContent = 'Delete division';
    button.setAttribute('aria-label', 'Delete ' + name.textContent);
    const confirmation = document.createElement('div');
    confirmation.hidden = true;
    const question = document.createElement('p');
    question.textContent = 'Delete ' + name.textContent + ' from ' + detail.textContent + '?';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'link';
    confirm.textContent = 'Confirm deletion';
    confirm.setAttribute('aria-label', 'Confirm deletion of ' + name.textContent);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'link';
    cancel.textContent = 'Cancel';
    const feedback = document.createElement('p');
    feedback.setAttribute('role', 'status');
    const actions = document.createElement('div');
    actions.className = 'division-delete-actions';
    actions.append(confirm, cancel);
    confirmation.append(question, actions, feedback);

    button.addEventListener('click', () => {
      listStatus.textContent = '';
      button.hidden = true;
      confirmation.hidden = false;
      confirm.focus();
    });
    cancel.addEventListener('click', () => {
      confirmation.hidden = true;
      feedback.textContent = '';
      button.hidden = false;
      button.focus();
    });
    confirm.addEventListener('click', async () => {
      if (saving) {
        feedback.textContent = 'A division change is in progress. Try again in a moment.';
        return;
      }
      cancel.disabled = true;
      try {
        await save('DELETE', item, confirm, feedback);
      } finally {
        cancel.disabled = false;
      }
    });
    row.append(name, detail);
    row.append(renameEditor(item));
    row.append(button, confirmation);
    list.append(row);
  }
  empty.hidden = sorted.length > 0;
  empty.textContent = divisions.length ? 'No divisions match these filters.' : 'No divisions have been added yet.';
}

leagueFilter.addEventListener('change', () => updateDivisionFilter());
divisionFilter.addEventListener('change', render);

function renameEditor(item) {
  const editor = document.createElement('details');
  editor.className = 'division-rename';
  const toggle = document.createElement('summary');
  toggle.className = 'link';
  toggle.textContent = 'Edit name';
  toggle.setAttribute('aria-label', 'Edit name for ' + item.name);

  const rename = document.createElement('form');
  const label = document.createElement('label');
  label.textContent = 'Division name';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = item.name;
  input.required = true;
  input.maxLength = 60;
  label.append(input);
  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.className = 'link';
  apply.textContent = 'Save name';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'link';
  cancel.textContent = 'Cancel';
  const actions = document.createElement('div');
  actions.className = 'schedule-editor-actions';
  actions.append(apply, cancel);
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'status');
  rename.append(label, actions, feedback);
  editor.append(toggle, rename);

  cancel.addEventListener('click', () => {
    input.value = item.name;
    feedback.textContent = '';
    editor.open = false;
    toggle.focus();
  });
  rename.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) {
      feedback.textContent = 'A division change is in progress. Try again in a moment.';
      return;
    }
    input.disabled = true;
    cancel.disabled = true;
    try {
      await save('PATCH', { ...item, newName: input.value }, apply, feedback);
    } finally {
      input.disabled = false;
      cancel.disabled = false;
    }
  });
  return editor;
}

async function save(method, item, button, feedback = status) {
  if (saving) return;
  saving = true;
  button.disabled = true;
  submit.disabled = true;
  leagueFilter.disabled = true;
  divisionFilter.disabled = true;
  feedback.textContent = { POST: 'Adding division…', PATCH: 'Saving name…', DELETE: 'Deleting division…' }[method];
  try {
    const result = await divisionRequest(method, item);
    if (method === 'POST') {
      divisions.push(result);
      form.reset();
    } else if (method === 'PATCH') {
      divisions = divisions.map((entry) => entry.name === item.name ? result : entry);
    } else {
      if (!result.deleted) throw new Error('Could not verify that the division was deleted. Refresh and try again.');
      divisions = divisions.filter(({ name }) => name !== item.name);
    }
    const selected = divisionFilter.value;
    updateDivisionFilter(method === 'PATCH' && selected === item.name ? result.name : selected);
    if (method === 'POST') status.textContent = result.name + ' added.';
    else {
      listStatus.textContent = method === 'PATCH' ? 'Saved as ' + result.name + '.' : item.name + ' deleted.';
      listStatus.focus();
    }
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    saving = false;
    button.disabled = false;
    submit.disabled = false;
    leagueFilter.disabled = false;
    divisionFilter.disabled = leagueDivisions().length === 0;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  save('POST', Object.fromEntries(new FormData(form)), submit);
});

try {
  divisions = await divisionRequest();
  leagueFilter.disabled = false;
  updateDivisionFilter();
  status.textContent = '';
  submit.disabled = false;
} catch (error) {
  status.textContent = error.message;
}
