import { loadFieldStatuses, statusColors } from './field-status-data.js';

const note = document.querySelector('#field-status-note');
try {
  const statuses = await loadFieldStatuses();
  const rows = document.querySelectorAll('.field-status-list li[id^="field-"]');
  for (const row of rows) {
    const status = statuses.get(row.id.slice('field-'.length)) ?? 'Unknown';
    const badge = row.querySelector('.field-badge');
    badge.className = `field-badge ${statusColors.get(status)}`;
    badge.textContent = status;
  }
  note.textContent = statuses.size < rows.length ? 'Fields without a posted status show Unknown.' : '';
  note.hidden = !note.textContent;
} catch {
  note.textContent = 'Could not load current field statuses. Refresh to try again.';
}
