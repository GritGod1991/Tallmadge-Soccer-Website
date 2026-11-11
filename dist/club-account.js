const clubForm = document.querySelector('#club-account-form');
const clubMessage = document.querySelector('#club-account-message');
const clubSession = document.querySelector('#club-account-session');
const clubSignOut = document.querySelector('#club-account-signout');
let clubConfig;
const confirmation = new URLSearchParams(location.hash.slice(1));
if (confirmation.has('access_token') || confirmation.has('error_code')) {
  history.replaceState(null, '', location.pathname + location.search);
  clubMessage.textContent = confirmation.has('error_code')
    ? 'The verification link could not be used. Try signing in or requesting a new account email.'
    : 'Email verification completed. Sign in with your club account.';
}

async function accountRequest(data) {
  const response = await fetch('/api/club-account', data ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Account request failed.');
  return result;
}

function showClubSession(email) {
  clubForm.hidden = Boolean(email);
  if (!clubSession) return;
  clubSession.hidden = !email;
  document.querySelector('#club-account-email').textContent = email ?? '';
}

clubForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = clubForm.querySelector('button');
  submit.disabled = true;
  const form = new FormData(clubForm);
  try {
    const signup = clubForm.dataset.action === 'signup';
    const credentials = { email: form.get('email').trim(), password: form.get('password') };
    if (signup) {
      const firstName = form.get('firstName').trim();
      const lastName = form.get('lastName').trim();
      if (!firstName || !lastName) throw new Error('Enter your first and last name.');
      credentials.data = { first_name: firstName, last_name: lastName };
    }
    const url = new URL(clubConfig.issuer + (signup ? '/signup' : '/token'));
    if (signup) url.searchParams.set('redirect_to', location.origin + '/sign-in.html');
    else url.searchParams.set('grant_type', 'password');
    const response = await fetch(url, {
      method: 'POST',
      headers: { apikey: clubConfig.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const result = await response.json();
    if (!response.ok) {
      const message = result.error_code === 'email_not_confirmed'
        ? 'Verify your email before signing in.'
        : signup ? 'Could not create the account. Check the email, password, and verification email settings.'
          : 'Email or password was not accepted.';
      throw new Error(response.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : message);
    }
    if (signup) {
      clubMessage.textContent = 'Check your inbox for a verification link, then return to Sign In.';
    } else {
      if (!result.user?.email_confirmed_at) throw new Error('Verify your email before signing in.');
      sessionStorage.removeItem(clubTabSession);
      const accepted = await accountRequest({ action: 'session', token: result.access_token });
      let session = await readClubSession();
      if (session.email !== accepted.email) {
        // Embedded browsers can block the session cookie. Use this tab only.
        sessionStorage.setItem(clubTabSession, result.access_token);
        session = await readClubSession();
      }
      if (session.email !== accepted.email) {
        sessionStorage.removeItem(clubTabSession);
        throw new Error('Sign-in was accepted, but this browser could not keep your session. Open the site in a regular browser tab and try again.');
      }
      location.replace('/account.html');
    }
    clubForm.reset();
  } catch (error) {
    clubMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

clubSignOut?.addEventListener('click', async () => {
  try {
    await accountRequest({ action: 'signout' });
    sessionStorage.removeItem(clubTabSession);
    showClubSession(null);
    await renderPreviewSession();
    clubMessage.textContent = 'Signed out of Tallmadge Soccer.';
  } catch (error) {
    clubMessage.textContent = error.message;
  }
});

readClubSession().then((config) => {
  clubConfig = config;
  showClubSession(clubSession ? config.email : null);
}).catch((error) => {
  clubMessage.textContent = error.message;
});
