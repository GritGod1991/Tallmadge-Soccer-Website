import { setupSeasonPicker } from './season-data.js';
import { formatKickoff, gameFieldLabel } from './schedule-data.js';

const form = document.querySelector('#live-score-editor');
const picker = form.elements.namedItem('game');
const fields = form.querySelector('fieldset');
const status = document.querySelector('#live-score-status');
const matchup = document.querySelector('#live-score-matchup');
const gameTitle = document.querySelector('#live-score-game-title');
const gameDetails = document.querySelector('#live-score-game-details');
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const sides = ['home', 'away'].map((side) => ({
  label: document.querySelector('#live-score-' + side + '-label'),
  input: form.elements.namedItem(side),
}));
let games = [];
let saving = false;
let selectedSeason;

async function scoresRequest(game) {
  const token = sessionStorage.getItem('tallmadge-club-tab-session');
  const headers = token ? { 'X-Tallmadge-Club-Session': token } : {};
  const response = await fetch('/api/scores' + (game ? '' : '?' + new URLSearchParams({ season: selectedSeason.id })), game ? {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(game),
  } : { cache: 'no-store', headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Could not load or save scores.');
  return data;
}

function selectedGame() {
  return games.find((game) => game.id === picker.value);
}

function showScore() {
  const game = selectedGame();
  fields.disabled = !game;
  matchup.hidden = !game;
  if (game) {
    gameTitle.textContent = matchupTitle(game);
    gameDetails.textContent = kickoffDetails(game) + ' · ' + gameFieldLabel(game);
  }
  for (const [index, side] of sides.entries()) {
    side.label.textContent = index === 0 ? game?.home ?? 'Home team' : game?.away ?? 'Away team';
    side.input.value = game?.score?.[index] ?? '';
  }
}

function matchupTitle(game) {
  return game.home + ' vs. ' + game.away;
}

function kickoffDetails(game) {
  return game.division + ' · ' + dateFormat.format(new Date(game.date + 'T00:00:00Z')) +
    ' · ' + formatKickoff(game.time) + ' ET';
}

function gameOption(game) {
  return matchupTitle(game) + ' · ' + kickoffDetails(game) +
    (game.score ? ' · Final ' + game.score.join('–') : '');
}

picker.addEventListener('change', () => {
  showScore();
  status.textContent = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const game = selectedGame();
  if (saving || !game || sides.some((side) => side.input.value === '')) return;
  saving = true;
  fields.disabled = true;
  picker.disabled = true;
  status.textContent = 'Saving final score…';
  try {
    const saved = await scoresRequest({
      id: game.id, revision: game.revision, score: sides.map((side) => Number(side.input.value)),
    });
    games = games.map((item) => item.id === saved.id ? saved : item);
    picker.selectedOptions[0].textContent = gameOption(saved);
    showScore();
    status.textContent = 'Final score saved to the schedule and standings.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saving = false;
    fields.disabled = false;
    picker.disabled = false;
  }
});

async function loadGames() {
  try {
    selectedSeason = await setupSeasonPicker(document.querySelector('#season-picker'), { staff: true });
    games = await scoresRequest();
    for (const game of games) picker.add(new Option(gameOption(game), game.id));
    picker.disabled = games.length === 0;
    status.textContent = games.length ? '' : 'No saved Classic Travel games are available for your teams.';
  } catch (error) {
    status.textContent = error.message;
  }
}

loadGames();
