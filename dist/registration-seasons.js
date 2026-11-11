const settings = document.querySelector('#registration-settings');
const picker = document.querySelector('#registration-select');
const opens = document.querySelector('#registration-opens');
const closes = document.querySelector('#registration-closes');
const message = document.querySelector('#registration-message');
const key = 'tallmadge-demo-registration-seasons';
const defaults = {
  published: 'spring',
  windows: {
    spring: { opens: '2027-01-18', closes: '2027-03-07' },
    fall: { opens: '2027-06-14', closes: '2027-08-01' },
  },
};
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});
const displayDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
});

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.windows?.spring && saved?.windows?.fall) return saved;
  } catch {
    // Use the demo defaults if no saved settings are available.
  }
  return defaults;
}

function renderSeason() {
  const state = readSettings();
  const season = picker.value;
  const windowDates = state.windows[season];
  opens.value = windowDates.opens;
  closes.value = windowDates.closes;
  document.querySelector('#registration-season').textContent = picker.selectedOptions[0].textContent + ' Registration';
  document.querySelector('#registration-publication').textContent = state.published === season ? 'Published in demo' : 'Draft in demo';
  const parts = Object.fromEntries(localDate.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const status = today < opens.value ? 'Scheduled' : today > closes.value ? 'Closed' : 'Open';
  const badge = document.querySelector('#registration-rec-status');
  badge.textContent = state.published === season ? status : 'Draft';
  badge.className = 'registration-badge ' + (state.published === season && status === 'Open' ? 'reg-approved' : 'reg-waitlisted');
  document.querySelector('#registration-window').textContent =
    displayDate.format(new Date(opens.value)) + ' – ' + displayDate.format(new Date(closes.value));
  const spring = season === 'spring';
  document.querySelector('#registration-spring-queue').hidden = !spring;
  document.querySelector('#registration-empty').hidden = spring;
  for (const [id, count] of [['total', 4], ['review-count', 2], ['approved-count', 1], ['waitlist-count', 1]]) {
    document.querySelector('#registration-' + id).textContent = spring ? count : 0;
  }
}

picker.addEventListener('change', () => {
  closes.setCustomValidity('');
  message.textContent = '';
  renderSeason();
});
for (const date of [opens, closes]) date.addEventListener('input', () => closes.setCustomValidity(''));
settings.addEventListener('submit', (event) => {
  event.preventDefault();
  if (closes.value < opens.value) {
    closes.setCustomValidity('Closing date must be on or after the opening date.');
    closes.reportValidity();
    return;
  }
  const state = readSettings();
  const season = picker.value;
  const publish = event.submitter?.value === 'publish';
  const next = {
    published: publish ? season : state.published,
    windows: { ...state.windows, [season]: { opens: opens.value, closes: closes.value } },
  };
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    message.textContent = 'Could not save the season settings in this browser.';
    return;
  }
  renderSeason();
  message.textContent = publish ? 'Season published in this demo.' : 'Registration dates saved in this demo.';
});
renderSeason();
