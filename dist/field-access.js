const form = document.querySelector('#field-access-form');
const message = document.querySelector('#field-access-message');
const list = document.querySelector('#field-access-list');
const save = form.querySelector('button');

async function requestAccess(options) {
  const response = await fetch('/api/field-publishers', options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Could not load field access.');
  return data;
}

function renderAccess(staff) {
  list.replaceChildren();
  for (const { email, role } of staff) {
    const row = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = email;
    const badge = document.createElement('span');
    badge.className = 'registration-badge reg-approved';
    badge.textContent = role;
    row.append(label, badge);
    list.append(row);
  }
  list.hidden = staff.length === 0;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  save.disabled = true;
  const data = new FormData(form);
  const role = data.get('role');
  try {
    await requestAccess({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.get('email'), role: role === 'remove' ? null : role }),
    });
    form.reset();
    message.textContent = 'Field publishing access saved.';
    try {
      renderAccess(await requestAccess());
    } catch {
      message.textContent = 'Access saved. Refresh to reload the staff list.';
    }
  } catch (error) {
    message.textContent = error.message;
  } finally {
    save.disabled = false;
  }
});

requestAccess().then((staff) => {
  renderAccess(staff);
  form.hidden = false;
  if (!staff.length) message.textContent = 'No staff publishing access has been assigned yet.';
}).catch((error) => {
  message.textContent = error.message;
});
