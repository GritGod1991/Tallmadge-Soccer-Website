const previewKey = 'tallmadge-demo-session';
const dashboard = document.querySelector('#preview-dashboard');
const signOut = document.querySelector('#preview-sign-out');
let clubEmail = null;
const clubTabSession = 'tallmadge-club-tab-session';
const recordedAccount = 'tallmadge-recorded-account';

async function recordCurrentAccount(email) {
  if (!email || sessionStorage.getItem(recordedAccount) === email) return;
  const token = sessionStorage.getItem(clubTabSession);
  try {
    const response = await fetch('/api/club-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Tallmadge-Club-Session': token } : {}) },
      body: JSON.stringify({ action: 'record-account' }),
    });
    if (response.ok) sessionStorage.setItem(recordedAccount, email);
  } catch {
    // Retry on the next page visit.
  }
}

async function readClubSession() {
  const token = sessionStorage.getItem(clubTabSession);
  const response = await fetch('/api/club-account', {
    cache: 'no-store',
    headers: token ? { 'X-Tallmadge-Club-Session': token } : {},
  });
  if (!response.ok) throw new Error('Could not check the club session.');
  const session = await response.json();
  if (!session.email && token) sessionStorage.removeItem(clubTabSession);
  return session;
}

async function renderPreviewSession() {
  let owner = false;
  let canUpdateSchedules = false;
  let canEnterScores = false;
  let canManageTeams = false;
  try {
    const session = await readClubSession();
    for (const link of document.querySelectorAll('[data-manage-club-accounts]')) link.hidden = !session.canManageAccounts;
    for (const link of document.querySelectorAll('[data-manage-club-fields]')) link.hidden = !session.canManageFields;
    for (const item of document.querySelectorAll('[data-club-role]')) {
      const roles = session.roles ?? [];
      item.textContent = roles.length ? 'Your club roles: ' + roles.join(', ') : 'No club roles have been assigned to your account yet.';
    }
    clubEmail = typeof session?.email === 'string' && session.email ? session.email : null;
    owner = Boolean(clubEmail && session.roles?.includes('Owner'));
    canUpdateSchedules = Boolean(clubEmail && session.canUpdateSchedules);
    canEnterScores = Boolean(clubEmail && session.canEnterScores);
    canManageTeams = Boolean(clubEmail && session.canManageTeams);
    const teams = session.scheduleTeams ?? [];
    for (const note of document.querySelectorAll('[data-schedule-teams]')) {
      note.hidden = !teams.length;
      note.textContent = teams.length ? 'Assigned teams: ' + teams.map(({ division, team }) => team + ' (' + division + ')').join(', ') : '';
    }
  } catch {
    clubEmail = null;
    for (const link of document.querySelectorAll('[data-manage-club-fields]')) link.hidden = true;
  }
  for (const link of document.querySelectorAll('[data-update-schedules]')) link.hidden = !canUpdateSchedules;
  for (const link of document.querySelectorAll('[data-enter-scores]')) link.hidden = !canEnterScores;
  for (const link of document.querySelectorAll('[data-manage-teams]')) link.hidden = !canManageTeams;
  await recordCurrentAccount(clubEmail);
  const demo = !clubEmail && sessionStorage.getItem(previewKey) === 'active';
  const active = Boolean(clubEmail) || demo;
  for (const item of document.querySelectorAll('[data-preview-signed-in]')) item.hidden = !active;
  for (const item of document.querySelectorAll('[data-preview-signed-out]')) item.hidden = active;
  const dashboardPath = clubEmail && !owner ? '/my-dashboard.html' : '/dashboard.html';
  for (const item of document.querySelectorAll('.account-menu-panel a[data-preview-signed-in], [data-account-dashboard]')) {
    item.href = dashboardPath;
  }

  if (dashboard) {
    const personal = dashboard.hasAttribute('data-account-page');
    const realOnly = dashboard.hasAttribute('data-real-account-only');
    if (realOnly && owner) {
      location.replace(dashboardPath);
      return;
    }
    const staffEditor = (dashboard.hasAttribute('data-schedule-editor') && canUpdateSchedules) ||
      (dashboard.hasAttribute('data-score-editor') && canEnterScores) ||
      ((dashboard.hasAttribute('data-team-editor') || dashboard.hasAttribute('data-roster-editor')) && canManageTeams);
    if (realOnly ? !clubEmail : personal ? !active : !(owner || demo || staffEditor)) {
      location.replace(!personal && clubEmail ? dashboardPath : personal ? '/sign-in.html?next=account' : '/sign-in.html');
      return;
    }
    for (const item of dashboard.querySelectorAll('[data-demo-account]')) item.hidden = Boolean(clubEmail);
    for (const item of dashboard.querySelectorAll('[data-real-account]')) item.hidden = !clubEmail;
    for (const item of dashboard.querySelectorAll('[data-club-email]')) item.textContent = clubEmail ?? '';
    dashboard.hidden = false;
  }
}

signOut?.addEventListener('click', async () => {
  if (clubEmail) {
    signOut.disabled = true;
    try {
      const response = await fetch('/api/club-account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signout' }),
      });
      if (!response.ok) throw new Error('Sign-out failed');
    } catch {
      signOut.textContent = 'Retry Sign Out';
      signOut.disabled = false;
      return;
    }
  }
  sessionStorage.removeItem(previewKey);
  sessionStorage.removeItem(clubTabSession);
  if (dashboard || clubEmail) location.replace('/sign-in.html');
  else {
    await renderPreviewSession();
    signOut.closest('details').open = false;
    signOut.closest('details').querySelector('summary').focus();
  }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) renderPreviewSession();
});
renderPreviewSession();
