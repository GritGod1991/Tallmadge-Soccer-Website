const editor = document.querySelector('#schedule-editor');
const draftsList = document.querySelector('#schedule-drafts');
const editorTitle = document.querySelector('#schedule-editor-title');
const editorStatus = document.querySelector('#schedule-editor-status');
const emptyDrafts = document.querySelector('#schedule-drafts-empty');
const cancelEdit = document.querySelector('#cancel-game-edit');
const scope = document.querySelector('#schedule-scope');
const scopeNote = document.querySelector('#schedule-scope-note');
const divisionInput = editor.elements.namedItem('division');
const sampleAssignment = { division: 'U10', team: 'Tallmadge U10' };
const draftKey = 'tallmadge-demo-game-drafts';
const fields = ['division', 'home', 'away', 'date', 'time', 'field'];
let editingId = null;

function readDrafts() {
  try {
    const drafts = JSON.parse(localStorage.getItem(draftKey) ?? '[]');
    return Array.isArray(drafts) ? drafts.filter((draft) =>
      typeof draft?.id === 'string' && fields.every((field) => typeof draft[field] === 'string')) : [];
  } catch {
    return [];
  }
}

function canEditGame(game) {
  if (scope.value !== 'coach') return true;
  const assignedName = sampleAssignment.team.toLowerCase();
  return game.division === sampleAssignment.division &&
    [game.home, game.away].some((team) => team.trim().toLowerCase() === assignedName);
}

function resetEditor() {
  editingId = null;
  editor.reset();
  const coachView = scope.value === 'coach';
  divisionInput.disabled = coachView;
  scopeNote.hidden = !coachView;
  if (coachView) divisionInput.value = sampleAssignment.division;
  editorTitle.textContent = 'Add a game';
  cancelEdit.hidden = true;
}

function renderDrafts() {
  const drafts = readDrafts().filter(canEditGame).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  emptyDrafts.hidden = drafts.length > 0;
  draftsList.replaceChildren();
  for (const draft of drafts) {
    const row = document.createElement('li');
    row.className = 'field-post schedule-draft';
    const match = document.createElement('strong');
    match.textContent = `${draft.home} vs. ${draft.away}`;
    const details = document.createElement('p');
    const date = new Date(`${draft.date}T${draft.time}`);
    const kickoff = Number.isNaN(date.getTime()) ? 'Kickoff TBA' :
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    details.textContent = `${draft.division} · ${kickoff} · ${draft.field}`;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link';
    edit.textContent = 'Edit game';
    edit.addEventListener('click', () => {
      editingId = draft.id;
      for (const field of fields) editor.elements.namedItem(field).value = draft[field];
      editorTitle.textContent = 'Edit game draft';
      editorStatus.textContent = '';
      cancelEdit.hidden = false;
      editor.elements.namedItem(scope.value === 'coach' ? 'home' : 'division').focus();
    });
    row.append(match, details, edit);
    draftsList.append(row);
  }
}

editor.addEventListener('submit', (event) => {
  event.preventDefault();
  const game = Object.fromEntries(fields.map((field) => [field, editor.elements.namedItem(field).value.trim()]));
  if (fields.some((field) => !game[field])) {
    editorStatus.textContent = 'Fill in every game detail.';
    return;
  }
  if (game.home.toLowerCase() === game.away.toLowerCase()) {
    editorStatus.textContent = 'Choose two different team names.';
    return;
  }

  const drafts = readDrafts();
  const original = drafts.find((draft) => draft.id === editingId);
  if (!canEditGame(game) || (editingId && (!original || !canEditGame(original)))) {
    editorStatus.textContent = 'In the Head Coach preview, you can only save games involving Tallmadge U10.';
    return;
  }
  const id = editingId ?? crypto.randomUUID();
  try {
    localStorage.setItem(draftKey, JSON.stringify([...drafts.filter((draft) => draft.id !== id), { id, ...game }]));
  } catch {
    editorStatus.textContent = 'Could not save the draft in this browser.';
    return;
  }
  resetEditor();
  renderDrafts();
  editorStatus.textContent = 'Game draft saved in this browser.';
});
cancelEdit.addEventListener('click', () => {
  resetEditor();
  editorStatus.textContent = 'Edit canceled.';
  editor.elements.namedItem(scope.value === 'coach' ? 'home' : 'division').focus();
});
scope.addEventListener('change', () => {
  resetEditor();
  editorStatus.textContent = '';
  renderDrafts();
});
resetEditor();
renderDrafts();
