import { divisions } from './rec-divisions.js';
import { sampleGames } from './travel-sample-games.js';

const gameDays = document.querySelector('#concession-days');
const loadMessage = document.querySelector('#concession-load');
const dayTemplate = document.querySelector('#concession-day');
const slotTemplate = document.querySelector('#concession-slot');
const shiftKey = 'tallmadge-demo-concession-shifts';
const profiles = [
  { id: 'jamie', name: 'Jamie Carter', role: 'Concession' },
  { id: 'alex', name: 'Alex Bennett', role: 'Concession' },
  { id: 'morgan', name: 'Morgan Ellis', role: 'Concession' },
].filter((profile) => profile.role === 'Concession');
const defaultShifts = [
  { start: '12:00', end: '14:00', profile: '' },
  { start: '14:00', end: '16:00', profile: '' },
];
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' });

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function getGameDays() {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York' }).format(new Date());
  const days = new Map();
  function add(date, program, count = 1) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return;
    const day = days.get(date) ?? { rec: 0, travel: 0 };
    day[program] += count;
    days.set(date, day);
  }
  for (const game of sampleGames) {
    if (!game.score) add(game.date, 'travel', 6);
  }
  let recAvailable = true;
  try {
    const response = await fetch('/rec-division.html');
    if (!response.ok) throw new Error('Rec schedule unavailable');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    for (const time of doc.querySelectorAll('[data-rec-panel="schedule"] time[datetime]')) {
      add(time.dateTime, 'rec', divisions.size);
    }
  } catch {
    recAvailable = false;
  }
  const drafts = readStorage('tallmadge-demo-game-drafts', []);
  if (Array.isArray(drafts)) {
    for (const game of drafts) {
      if ([...divisions.values()].includes(game?.division)) add(game.date, 'rec');
      else if (/^U(?:9|1[0-4])$/.test(game?.division)) add(game.date, 'travel');
    }
  }
  return { days: [...days].sort(([a], [b]) => a.localeCompare(b)), recAvailable };
}

function renderDay(date, counts) {
  const card = dayTemplate.content.cloneNode(true);
  const time = card.querySelector('time');
  time.dateTime = date;
  time.textContent = dateFormat.format(new Date(date));
  card.querySelector('.concession-game-count').textContent = [
    counts.rec ? `${counts.rec} Rec` : '',
    counts.travel ? `${counts.travel} Travel` : '',
  ].filter(Boolean).join(' · ');
  const saved = readStorage(shiftKey, {})[date];
  const form = card.querySelector('form');
  const slots = card.querySelector('.concession-slots');
  const result = card.querySelector('.concession-result');
  const inputs = defaultShifts.map((defaults, index) => {
    const shift = saved?.[index] ?? defaults;
    const slot = slotTemplate.content.cloneNode(true);
    slot.querySelector('legend').textContent = `Shift ${index + 1}`;
    const [start, end] = slot.querySelectorAll('input');
    const select = slot.querySelector('select');
    for (const profile of profiles) select.add(new Option(profile.name, profile.id));
    start.value = shift.start;
    end.value = shift.end;
    select.value = profiles.some((profile) => profile.id === shift.profile) ? shift.profile : '';
    slots.append(slot);
    return { start, end, select };
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const shifts = inputs.map(({ start, end, select }) => ({ start: start.value, end: end.value, profile: select.value }));
    if (shifts.some((shift) => shift.start >= shift.end)) {
      result.textContent = 'Each shift must end after it starts.';
      return;
    }
    if (shifts[0].end > shifts[1].start) {
      result.textContent = 'The two shifts must be in order and cannot overlap.';
      return;
    }
    try {
      localStorage.setItem(shiftKey, JSON.stringify({ ...readStorage(shiftKey, {}), [date]: shifts }));
      result.textContent = 'Shifts saved in this browser.';
    } catch {
      result.textContent = 'Could not save these shifts.';
    }
  });
  return card;
}

const { days, recAvailable } = await getGameDays();
loadMessage.textContent = recAvailable ? (days.length ? '' : 'No upcoming game days.') : 'Rec sample games could not load.';
if (days.length) {
  const picker = document.querySelector('#concession-picker');
  const dateSelect = document.querySelector('#concession-date');
  const countsByDate = new Map(days);
  for (const [date] of days) {
    dateSelect.add(new Option(dateFormat.format(new Date(date)), date));
  }
  function showSelectedDay() {
    const date = dateSelect.value;
    gameDays.replaceChildren(renderDay(date, countsByDate.get(date)));
  }
  dateSelect.addEventListener('change', showSelectedDay);
  picker.hidden = false;
  showSelectedDay();
}
