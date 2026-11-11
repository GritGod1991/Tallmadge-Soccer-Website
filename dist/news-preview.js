import { readNews, saveNews } from './demo-news.js';

const photo = document.querySelector('#news-photo');
const preview = document.querySelector('#photo-preview');
const remove = document.querySelector('#remove-photo');
const status = document.querySelector('#photo-status');
let photoUrl;

function clearPreview() {
  if (photoUrl) {
    URL.revokeObjectURL(photoUrl);
    photoUrl = undefined;
  }
  preview.hidden = true;
  preview.removeAttribute('src');
  remove.hidden = true;
  status.textContent = '';
}

photo.addEventListener('change', () => {
  clearPreview();
  const selected = photo.files[0];
  if (!selected) return;

  if (!selected.type.startsWith('image/')) {
    photo.value = '';
    status.textContent = 'Choose an image file.';
    return;
  }

  photoUrl = URL.createObjectURL(selected);
  preview.src = photoUrl;
  remove.hidden = false;
});

preview.addEventListener('load', () => {
  preview.hidden = false;
});

preview.addEventListener('error', () => {
  preview.hidden = true;
  status.textContent = 'This image can’t be previewed here. Try a JPEG or PNG.';
});

remove.addEventListener('click', () => {
  photo.value = '';
  clearPreview();
  photo.focus();
});

const form = photo.form;
const submit = form.querySelector('[type="submit"]');
const result = document.querySelector('#submission-result');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const story = Object.fromEntries(['author', 'team', 'title', 'body'].map((field) => [field, data.get(field).trim()]));
  if (!story.author || !story.title || !story.body) {
    result.textContent = 'Enter your name, a headline, and a story.';
    return;
  }
  const file = photo.files[0];
  if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 500_000)) {
    result.textContent = 'Choose a JPEG, PNG, or WebP image under 500 KB.';
    return;
  }
  submit.disabled = true;
  try {
    if (file) {
      story.image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result));
        reader.addEventListener('error', reject);
        reader.readAsDataURL(file);
      });
    }
    const news = readNews();
    saveNews({ ...news, pending: [...news.pending, { ...story, id: crypto.randomUUID() }] });
    form.reset();
    clearPreview();
    result.textContent = 'Submission added to the demo review queue in this browser.';
  } catch {
    result.textContent = 'Could not save the submission. Try again without a photo.';
  } finally {
    submit.disabled = false;
  }
});
