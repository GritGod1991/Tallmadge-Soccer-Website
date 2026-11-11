import { leagueLabels } from './division-data.js';
import { formatKickoff, gameFieldLabel } from './schedule-data.js';

const carousel = document.querySelector('.home-games');
const track = carousel.querySelector('.home-games-slides');
const controls = carousel.querySelector('.home-games-controls');
const count = carousel.querySelector('.home-games-count');
const announcement = carousel.querySelector('.home-games-announcement');
const pause = carousel.querySelector('[data-game-action="pause"]');
const status = carousel.querySelector('.home-games-status');
const template = document.querySelector('#home-game-template');
const dateFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

function gameSlide(game, index) {
  const fragment = template.content.cloneNode(true);
  const slide = fragment.querySelector('.home-game');
  slide.hidden = index !== 0;
  const date = slide.querySelector('time');
  date.dateTime = game.date;
  date.textContent = dateFormat.format(new Date(game.date));
  slide.querySelector('.home-game-kickoff strong').textContent = formatKickoff(game.time) + ' ET';
  slide.querySelector('.kicker').textContent = [leagueLabels[game.league], game.division, game.seasonName].join(' · ');
  slide.querySelector('[data-home-team]').textContent = game.home;
  slide.querySelector('[data-away-team]').textContent = game.away;
  slide.querySelector('.home-game-field strong').textContent = gameFieldLabel(game);
  const teamId = game.homeTeamId && game.awayTeamId ? null : game.homeTeamId || game.awayTeamId;
  const params = new URLSearchParams({ season: game.seasonId });
  if (teamId) params.set('teamId', teamId);
  else params.set('division', game.division);
  const link = slide.querySelector('.home-game-bottom a');
  link.href = '/team-schedule.html?' + params;
  link.textContent = teamId ? 'Team schedule' : 'Division schedule';
  return slide;
}

const slides = [];
try {
  const response = await fetch('/api/upcoming-games', { cache: 'no-store' });
  if (!response.ok) throw new Error('Upcoming games are unavailable.');
  const games = await response.json();
  slides.push(...games.map(gameSlide));
  track.append(...slides);
  status.hidden = slides.length > 0;
  status.textContent = 'No upcoming games are posted yet.';
} catch {
  status.textContent = 'Upcoming games could not be loaded. Refresh to try again.';
}

let index = 0;
let timer;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let touchStart;

function showGame(step, announce = false) {
  slides[index].hidden = true;
  index = (index + step + slides.length) % slides.length;
  slides[index].hidden = false;
  count.textContent = `${index + 1} / ${slides.length}`;
  count.setAttribute('aria-label', `Game ${index + 1} of ${slides.length}`);
  if (announce) announcement.textContent = `Game ${index + 1} of ${slides.length}: ${slides[index].querySelector('h3').textContent}`;
}

function updateTimer() {
  clearInterval(timer);
  pause.textContent = playing ? 'Pause' : 'Play';
  if (playing && !document.hidden) timer = setInterval(() => showGame(1), 3000);
}

function manualStep(step) {
  playing = false;
  showGame(step, true);
  updateTimer();
}

if (slides.length > 1) {
  showGame(0);
  controls.hidden = false;
  carousel.querySelector('[data-game-action="previous"]').addEventListener('click', () => manualStep(-1));
  carousel.querySelector('[data-game-action="next"]').addEventListener('click', () => manualStep(1));
  pause.addEventListener('click', () => {
    playing = !playing;
    updateTimer();
  });
  carousel.addEventListener('focusin', (event) => {
    if (event.target === pause) return;
    playing = false;
    updateTimer();
  });
  track.addEventListener('touchstart', (event) => {
    touchStart = event.touches.length === 1 ? event.touches[0] : undefined;
  }, { passive: true });
  track.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const end = event.changedTouches[0];
    const dx = end.clientX - touchStart.clientX;
    const dy = end.clientY - touchStart.clientY;
    touchStart = undefined;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) manualStep(dx < 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener('visibilitychange', updateTimer);
  updateTimer();
}
