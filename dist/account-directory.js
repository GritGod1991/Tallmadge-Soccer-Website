const directory = document.querySelector('#account-profiles');
const filter = document.querySelector('#account-role-filter');
const count = document.querySelector('#account-count');
const empty = document.querySelector('#account-empty');
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' });
let accounts = [];
const emailCounts = new Map();
const roleOptions = Array.from(filter.options, (option) => option.value)
  .filter((value) => value && value !== 'Unassigned');

async function directoryRequest(body) {
  const token = sessionStorage.getItem(clubTabSession);
  const headers = token ? { 'X-Tallmadge-Club-Session': token } : {};
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/club-accounts', {
    cache: 'no-store', headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not update club accounts.');
  return result;
}

function renderAccountStatus(badge, account) {
  const deleted = account.authStatus === 'deleted';
  badge.className = 'registration-badge ' + (deleted ? 'reg-neutral' : account.is_active ? 'reg-approved' : 'reg-neutral');
  badge.textContent = deleted ? 'Deleted in Supabase' : account.is_active ? 'Active' : 'Inactive';
}

function accountCard(account) {
  const card = document.createElement('details');
  card.className = 'registration-application';
  const summary = document.createElement('summary');
  const label = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = [account.first_name, account.last_name].filter(Boolean).join(' ') || account.email;
  const roles = document.createElement('span');
  roles.className = 'account-role-badges';
  renderRoleBadges(roles, account.roles);
  const status = document.createElement('span');
  renderAccountStatus(status, account);
  label.append(name, roles);
  if (emailCounts.get(account.email) > 1 && account.authStatus !== 'deleted') {
    const identity = document.createElement('small');
    identity.className = 'registration-badge reg-neutral';
    identity.textContent = account.authStatus === 'current' ? 'Current Supabase user' : 'Duplicate email';
    label.append(identity);
  }
  summary.append(label, status);
  const details = document.createElement('dl');
  for (const [title, value] of [
    ['Email', account.email],
    ['Supabase user ID', account.user_id],
    ['First recorded', dateFormat.format(new Date(account.first_seen_at.replace(' ', 'T') + 'Z'))],
  ]) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = title;
    const detail = document.createElement('dd');
    detail.textContent = value;
    row.append(term, detail);
    details.append(row);
  }
  card.append(summary, details);
  if (account.editable) card.append(accountEditor(account, roles, status));
  return card;
}

function renderRoleBadges(container, roles) {
  container.replaceChildren();
  for (const role of roles.length ? roles : ['Unassigned']) {
    const badge = document.createElement('small');
    badge.className = 'account-role ' + (role === 'Unassigned' ? 'reg-neutral' : 'role-' + role.toLowerCase().replaceAll(' ', '-'));
    badge.textContent = role;
    container.append(badge);
  }
}

function matchesRole(account) {
  return !filter.value || (filter.value === 'Unassigned' ? !account.roles.length : account.roles.includes(filter.value));
}

let clubTeamOptions = [];
const teamScopedRoles = ['Head Coach', 'Assistant Coach', 'Score Keeper'];
const hasTeamScope = (roles) => roles.some((role) => teamScopedRoles.includes(role));

function accountEditor(account, badges, statusBadge) {
  const form = document.querySelector('#account-edit-template').content.firstElementChild.cloneNode(true);
  const choices = form.querySelector('.account-role-choices');
  const state = form.elements.namedItem('state');
  const picker = form.elements.namedItem('assignmentTeam');
  const addTeam = form.querySelector('[data-add-assignment]');
  const assignmentList = form.querySelector('[data-team-assignments]');
  let assignments = [...(account.scheduleTeams ?? [])];
  const assignmentGroup = form.querySelector('[data-head-coach-teams]');
  const save = form.querySelector('[type="submit"]');
  const remove = form.querySelector('.account-delete');
  remove.hidden = !account.deletable;
  const message = form.querySelector('[role="status"]');
  for (const value of roleOptions) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'roles';
    checkbox.value = value;
    checkbox.checked = account.roles.includes(value);
    label.append(checkbox, value);
    choices.append(label);
  }
  function renderAssignments() {
    picker.replaceChildren(new Option(clubTeamOptions.length ? 'Choose a club team' : 'No club teams available', ''));
    for (const team of clubTeamOptions) {
      const alreadyAssigned = assignments.some((item) => item.teamId === team.id ||
        (!item.teamId && item.division === team.division && item.team.toLowerCase() === team.name.toLowerCase()));
      if (!alreadyAssigned) picker.add(new Option(team.division + ' · ' + team.name, team.id));
    }
    addTeam.disabled = true;
    assignmentList.replaceChildren();
    for (const [index, item] of assignments.entries()) {
      const current = clubTeamOptions.find((team) => team.id === item.teamId);
      const row = document.createElement('li');
      row.textContent = (current?.division ?? item.division) + ' · ' + (current?.name ?? item.team) + ' ';
      const removeTeam = document.createElement('button');
      removeTeam.type = 'button';
      removeTeam.className = 'link';
      removeTeam.textContent = 'Remove';
      removeTeam.setAttribute('aria-label', 'Remove ' + (current?.name ?? item.team));
      removeTeam.addEventListener('click', () => {
        assignments.splice(index, 1);
        renderAssignments();
      });
      row.append(removeTeam);
      assignmentList.append(row);
    }
  }
  picker.addEventListener('change', () => { addTeam.disabled = !picker.value; });
  addTeam.addEventListener('click', () => {
    if (!picker.value) return;
    if (assignments.length >= 20) {
      message.textContent = 'An account can have up to 20 team assignments.';
      return;
    }
    const team = clubTeamOptions.find((item) => item.id === picker.value);
    if (!team) return;
    assignments.push({ teamId: team.id, division: team.division, team: team.name });
    renderAssignments();
  });
  renderAssignments();
  function showAssignments() {
    const scoped = hasTeamScope(new FormData(form).getAll('roles'));
    assignmentGroup.hidden = !scoped;
    picker.disabled = !scoped;
  }
  choices.addEventListener('change', showAssignments);
  showAssignments();
  state.value = account.is_active ? 'active' : 'inactive';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    remove.disabled = true;
    message.textContent = 'Saving…';
    try {
      const roles = new FormData(form).getAll('roles');
      const scheduleTeams = hasTeamScope(roles) ? assignments : [];
      const saved = await directoryRequest({ userId: account.user_id, roles, active: state.value === 'active', scheduleTeams });
      assignments = saved.scheduleTeams;
      renderAssignments();
      Object.assign(account, saved);
      renderRoleBadges(badges, account.roles);
      renderAccountStatus(statusBadge, account);
      message.textContent = 'Account changes saved.';
      if (!matchesRole(account)) updateDirectory();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      save.disabled = false;
      remove.disabled = false;
    }
  });
  remove.addEventListener('click', async () => {
    if (!window.confirm(`Permanently delete ${account.email}? This removes their sign-in, club profile, and assigned roles.`)) return;
    save.disabled = true;
    remove.disabled = true;
    message.textContent = 'Deleting account…';
    try {
      await directoryRequest({ action: 'delete', userId: account.user_id });
      accounts = accounts.filter((entry) => entry.user_id !== account.user_id);
      updateDirectory();
      const feedback = document.querySelector('#account-directory-message');
      feedback.hidden = false;
      feedback.textContent = `Deleted ${account.email}.`;
    } catch (error) {
      message.textContent = error.message;
      save.disabled = false;
      remove.disabled = false;
    }
  });
  return form;
}

function updateDirectory() {
  emailCounts.clear();
  for (const account of accounts) emailCounts.set(account.email, (emailCounts.get(account.email) ?? 0) + 1);
  const visible = accounts.filter(matchesRole);
  directory.replaceChildren(...visible.map(accountCard));
  count.textContent = `${visible.length} ${visible.length === 1 ? 'account' : 'accounts'}`;
  empty.textContent = filter.value ? 'No club accounts match this role.' : 'No club accounts have signed in yet.';
  empty.hidden = visible.length > 0;
}

filter.addEventListener('change', updateDirectory);
const directoryAccess = document.querySelector('#account-directory-access');
Promise.all([
  directoryRequest({ action: 'sync' }),
  fetch('/api/teams', { cache: 'no-store' }).then((response) => response.ok ? response.json() : []).catch(() => []),
]).then(([data, teams]) => {
  accounts = data;
  clubTeamOptions = teams;
  document.querySelector('#account-auth-status-note').hidden = !accounts.some((account) => account.authStatus === 'unknown');
  directoryAccess.hidden = true;
  document.querySelector('#account-directory-content').hidden = false;
  document.querySelector('#account-directory-tools').hidden = false;
  updateDirectory();
}).catch((error) => {
  directoryAccess.textContent = error.message;
});
