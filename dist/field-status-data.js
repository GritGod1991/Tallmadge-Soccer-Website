export const statusColors = new Map([
  ['Closed', 'field-closed'],
  ['Unknown', 'field-unknown'],
  ['Open', 'field-open'],
]);

export async function loadFieldStatuses() {
  const response = await fetch('/api/fields?view=all', { cache: 'no-store' });
  if (!response.ok) throw new Error('Field statuses unavailable');
  const fields = await response.json();
  if (!Array.isArray(fields)) throw new Error('Invalid field status response');
  return new Map(fields.filter((entry) => typeof entry?.field === 'string' && statusColors.has(entry.status))
    .map((entry) => [entry.field, entry.status]));
}
