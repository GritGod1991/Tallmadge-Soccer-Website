import { loadFieldStatuses, statusColors as colors } from './field-status-data.js';

function clubSessionHeaders() {
  const token = sessionStorage.getItem('tallmadge-club-tab-session');
  return token ? { 'X-Tallmadge-Club-Session': token } : {};
}

const form = document.querySelector('#field-editor');
const picker = form.elements.namedItem('field');
const status = form.elements.namedItem('status');
const notice = form.elements.namedItem('notice');
const map = form.elements.namedItem('map');
const controls = document.querySelector('#field-editor-fields');
const message = document.querySelector('#field-editor-status');
const list = document.querySelector('#field-drafts');
const empty = document.querySelector('#field-drafts-empty');
const key = 'tallmadge-demo-field-drafts';
let published = new Map();
let loaded = false;
let saving = false;
const fields = Array.from(picker.options).filter((option) => option.value);

function readDrafts() {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function showField() {
  const draft = readDrafts()[picker.value];
  controls.disabled = !loaded || !picker.value || saving;
  status.value = published.get(picker.value) ?? 'Unknown';
  notice.value = draft?.notice ?? '';
  map.value = draft?.map ?? '';
  message.textContent = '';
}

function renderStatuses() {
  list.replaceChildren();
  for (const field of fields) {
    const currentStatus = published.get(field.value);
    if (!currentStatus) continue;
    const row = document.createElement('li');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link';
    edit.textContent = field.textContent;
    edit.addEventListener('click', () => {
      if (saving) return;
      picker.value = field.value;
      showField();
      status.focus();
    });
    const badge = document.createElement('span');
    badge.className = `field-badge ${colors.get(currentStatus)}`;
    badge.textContent = currentStatus;
    row.append(edit, badge);
    list.append(row);
  }
  list.hidden = !list.childElementCount;
  empty.hidden = !list.hidden;
}

picker.addEventListener('change', showField);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const field = picker.value;
  const draft = { status: status.value, notice: notice.value.trim(), map: map.value.trim() };
  if (saving || !loaded || !fields.some((entry) => entry.value === field) || !colors.has(draft.status)) return;
  saving = true;
  controls.disabled = true;
  picker.disabled = true;
  message.textContent = 'Publishing field status…';
  try {
    const response = await fetch('/api/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clubSessionHeaders() },
      body: JSON.stringify({ field, status: draft.status }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.field !== field || result.status !== draft.status) {
      message.textContent = result?.error ?? 'Could not publish the field status.';
      return;
    }
    published.set(field, result.status);
    renderStatuses();
    try {
      localStorage.setItem(key, JSON.stringify({ ...readDrafts(), [field]: draft }));
      message.textContent = `Field ${field} is now ${result.status}. Notes saved in this browser.`;
    } catch {
      message.textContent = `Field ${field} is now ${result.status}. The browser could not save your notes.`;
    }
  } catch {
    message.textContent = 'Could not publish the field status. Check the connection and try again.';
  } finally {
    saving = false;
    controls.disabled = !picker.value;
    picker.disabled = false;
  }
});

async function initializeEditor() {
  const accessStatus = document.querySelector('#field-editor-access-status');
  try {
    const response = await fetch('/api/fields?view=editor', {
      cache: 'no-store', headers: clubSessionHeaders(),
    });
    const access = await response.json();
    if (!response.ok) {
      accessStatus.textContent = access.error ?? 'Could not check field publishing access.';
      return;
    }
    document.querySelector('#field-access-link').hidden = !access.canManageAccess;
  } catch {
    accessStatus.textContent = 'Could not check field publishing access. Refresh and try again.';
    return;
  }

  accessStatus.hidden = true;
  document.querySelector('#field-editor-workspace').hidden = false;
  try {
    published = await loadFieldStatuses();
    loaded = true;
    showField();
    renderStatuses();
  } catch {
    message.textContent = 'Could not load current statuses. Refresh before publishing changes.';
  }
}

initializeEditor();
