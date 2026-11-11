import { loadFieldStatuses, statusColors } from './field-status-data.js';

const viewport = document.querySelector('.map-viewport');
const canvas = document.querySelector('.map-canvas');
const select = document.querySelector('#map-field');
const info = document.querySelector('#map-field-info p');
const statusLink = document.querySelector('#map-status-link');
const zoomLabel = document.querySelector('#map-zoom');
const zoomOut = document.querySelector('[data-zoom="out"]');
const zoomIn = document.querySelector('[data-zoom="in"]');
const spots = Array.from(canvas.querySelectorAll('.map-spot'));
const pitches = canvas.querySelectorAll('.map-pitches polygon');
const minZoom = 1;
const maxZoom = 4;
let zoom = minZoom;
async function showFieldStatus(name) {
  statusLink.className = 'link';
  statusLink.removeAttribute('aria-label');
  statusLink.href = name ? `/field-status.html#field-${name}` : '/field-status.html';
  statusLink.textContent = name ? 'Loading status…' : 'Check Field Status';
  if (!name) return;

  let statuses;
  try {
    statuses = await loadFieldStatuses();
  } catch {
    if (select.value === name) statusLink.textContent = 'Status unavailable · View Field Status';
    return;
  }
  if (select.value !== name) return;

  const status = statuses.get(name) ?? 'Unknown';
  statusLink.className = `field-badge ${statusColors.get(status)}`;
  statusLink.textContent = status;
  statusLink.setAttribute('aria-label', `Field ${name}: ${status}. View field status`);
}

function setZoom(nextZoom) {
  const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / canvas.clientWidth;
  const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / canvas.clientHeight;
  zoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
  canvas.style.width = `${zoom * 100}%`;
  viewport.scrollLeft = zoom === minZoom ? 0 : centerX * canvas.clientWidth - viewport.clientWidth / 2;
  viewport.scrollTop = zoom === minZoom ? 0 : centerY * canvas.clientHeight - viewport.clientHeight / 2;
  zoomLabel.textContent = `${zoom * 100}%`;
  zoomOut.disabled = zoom === minZoom;
  zoomIn.disabled = zoom === maxZoom;
}

function selectField(name) {
  select.value = name;
  const spot = spots.find((button) => button.dataset.field === name);
  for (const button of spots) button.setAttribute('aria-pressed', String(button === spot));
  for (const pitch of pitches) pitch.classList.toggle('is-selected', pitch.dataset.field === name);
  const option = select.selectedOptions[0];
  info.textContent = spot
    ? `${option.textContent}: ${option.dataset.location}`
    : 'Select a field to see where it is in the complex.';
  showFieldStatus(spot ? name : '');
  return spot;
}

zoomOut.addEventListener('click', () => setZoom(zoom - 0.5));
zoomIn.addEventListener('click', () => setZoom(zoom + 0.5));
document.querySelector('[data-zoom="reset"]').addEventListener('click', () => setZoom(minZoom));
for (const spot of spots) spot.addEventListener('click', () => selectField(spot.dataset.field));
for (const pitch of pitches) pitch.addEventListener('click', () => selectField(pitch.dataset.field));
select.addEventListener('change', () => {
  const spot = selectField(select.value);
  if (!spot) return;
  viewport.scrollLeft = spot.offsetLeft - viewport.clientWidth / 2;
  viewport.scrollTop = spot.offsetTop - viewport.clientHeight / 2;
});
setZoom(minZoom);
