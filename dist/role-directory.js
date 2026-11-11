const picker = document.querySelector('#role-picker');
const list = document.querySelector('#role-permissions');
const summary = document.querySelector('#role-scope');
const clubStaff = ['admin', 'manager'];
const rules = [
  { tool: 'Update Schedules', club: ['admin'], teams: ['head-coach'] },
  { tool: 'Enter Scores', club: clubStaff, teams: ['head-coach', 'assistant-coach', 'score-keeper'], note: 'Classic Travel only' },
  { tool: 'Manage Teams', club: clubStaff },
  { tool: 'Manage Rosters', club: clubStaff },
  { tool: 'Manage Coaches', club: clubStaff },
  { tool: 'Manage Fields', club: [...clubStaff, 'field-manager'] },
  { tool: 'Manage News' },
  { tool: 'Manage Registration' },
  { tool: 'Manage Concessions' },
  { tool: 'Manage Shop' },
  { tool: 'Manage Accounts' },
  { tool: 'Manage Roles' },
];
const badges = {
  club: ['Club-wide', 'reg-approved'],
  teams: ['Assigned teams', 'reg-review'],
  none: ['No access', 'reg-neutral'],
  pending: ['Pending decision', 'reg-waitlisted'],
};

function accessFor(rule, role) {
  if (role === 'super-admin' || rule.club?.includes(role)) return 'club';
  if (rule.teams?.includes(role)) return 'teams';
  return rule.club ? 'none' : 'pending';
}

function renderRole() {
  const role = picker.value;
  summary.textContent = `Showing permissions for ${picker.selectedOptions[0].textContent}.`;
  list.replaceChildren();
  for (const rule of rules) {
    const access = accessFor(rule, role);
    const row = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'role-tool-name';
    const name = document.createElement('strong');
    name.textContent = rule.tool;
    label.append(name);
    if (rule.note && (access === 'club' || access === 'teams')) {
      const note = document.createElement('small');
      note.textContent = rule.note;
      label.append(note);
    }
    const badge = document.createElement('span');
    const [text, color] = badges[access];
    badge.className = `registration-badge ${color}`;
    badge.textContent = text;
    row.append(label, badge);
    list.append(row);
  }
}

picker.addEventListener('change', renderRole);
renderRole();
