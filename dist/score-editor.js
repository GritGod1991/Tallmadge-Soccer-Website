const form = document.querySelector('#score-editor');
const scope = document.querySelector('#score-scope');
const scopeNote = document.querySelector('#score-scope-note');
const gamePicker = document.querySelector('#score-game');
const fields = document.querySelector('#score-fields');
const homeScore = document.querySelector('#score-home');
const awayScore = document.querySelector('#score-away');
const message = document.querySelector('#score-status');
const scoreKey = 'tallmadge-demo-score-drafts';
const scopes = new Map([
  ['super-admin', null],
  ['admin', null],
  ['head-coach', ['U10']],
  ['assistant-coach', ['U10']],
  ['manager', null],
  ['score-keeper', ['U9', 'U10']],
]);
const samples = [
  { id: 'sample-u9', division: 'U9', date: '2027-04-17', home: 'Tallmadge U9', away: 'Sample United' },
  { id: 'sample-u10', division: 'U10', date: '2027-04-17', home: 'Sample Rangers', away: 'Tallmadge U10' },
  { id: 'sample-u12', division: 'U12', date: '2027-04-24', home: 'Tallmadge U12', away: 'Sample City' },
];

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function availableGames() {
  const drafts = readStorage('tallmadge-demo-game-drafts', []);
  const travelDrafts = Array.isArray(drafts) ? drafts.filter((game) =>
    /^(U9|U1[0-4])$/.test(game?.division) &&
    ['id', 'date', 'home', 'away'].every((key) => typeof game[key] === 'string')) : [];
  return [...samples, ...travelDrafts];
}

function allowed(game) {
  const assignments = scopes.get(scope.value);
  if (assignments === null) return true;
  const team = `tallmadge ${game.division.toLowerCase()}`;
  return Boolean(assignments?.includes(game.division) &&
    [game.home, game.away].some((name) => name.trim().toLowerCase() === team));
}

function selectedGame() {
  return availableGames().find((game) => game.id === gamePicker.value && allowed(game));
}

function renderGame() {
  const game = selectedGame();
  fields.disabled = !game;
  document.querySelector('#score-home-label').textContent = game?.home ?? 'Home team';
  document.querySelector('#score-away-label').textContent = game?.away ?? 'Away team';
  const draft = readStorage(scoreKey, {})[game?.id];
  homeScore.value = draft?.home ?? '';
  awayScore.value = draft?.away ?? '';
}

function renderScope() {
  const assignments = scopes.get(scope.value);
  scopeNote.textContent = assignments === null
    ? 'Club-wide access to Classic Travel games in this preview.'
    : `Assigned teams: ${assignments.map((division) => 'Tallmadge ' + division).join(', ')}.`;
  const games = availableGames().filter(allowed);
  gamePicker.replaceChildren(new Option(games.length ? 'Choose a game' : 'No eligible games', ''));
  for (const game of games) {
    gamePicker.add(new Option(`${game.division} · ${game.date} · ${game.home} vs. ${game.away}`, game.id));
  }
  message.textContent = '';
  renderGame();
}

scope.addEventListener('change', renderScope);
gamePicker.addEventListener('change', () => {
  message.textContent = '';
  renderGame();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const game = selectedGame();
  const scores = [homeScore.valueAsNumber, awayScore.valueAsNumber];
  if (!game || !scores.every((score) => Number.isSafeInteger(score) && score >= 0)) {
    message.textContent = 'Choose an eligible game and enter two whole, non-negative scores.';
    return;
  }
  try {
    localStorage.setItem(scoreKey, JSON.stringify({
      ...readStorage(scoreKey, {}),
      [game.id]: { home: scores[0], away: scores[1] },
    }));
    message.textContent = 'Score draft saved in this browser.';
  } catch {
    message.textContent = 'Could not save the score draft in this browser.';
  }
});
renderScope();
