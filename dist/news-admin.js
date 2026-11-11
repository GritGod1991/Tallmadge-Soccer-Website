import { readNews, saveNews } from './demo-news.js';

const form = document.querySelector('#news-editor');
const titleInput = form?.elements.namedItem('title');
const bodyInput = form?.elements.namedItem('body');
const heading = document.querySelector('#news-editor-title');
const message = document.querySelector('#news-admin-message');
const cancel = document.querySelector('#news-edit-cancel');
let editingId = null;

function resetEditor() {
  form.reset();
  editingId = null;
  heading.textContent = 'Add News';
  cancel.hidden = true;
  document.querySelector('#news-page-title').textContent = 'Add News';
  document.title = 'Add News | Tallmadge Soccer';
  history.replaceState(null, '', '/add-news.html');
}

function commit(news, confirmation) {
  try {
    saveNews(news);
  } catch {
    message.textContent = 'Could not save the change in this browser.';
    return false;
  }
  render();
  message.textContent = confirmation;
  return true;
}

function action(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function card(story, pending) {
  const article = document.createElement('article');
  article.className = 'field-post news-admin-story';
  const title = document.createElement('h3');
  title.textContent = story.title;
  article.append(title);
  if (pending) {
    const byline = document.createElement('p');
    byline.textContent = [story.author, story.team].filter(Boolean).join(' · ');
    article.append(byline);
  }
  const body = document.createElement('p');
  body.className = 'news-admin-body';
  body.textContent = story.body;
  article.append(body);
  if (/^data:image\/(jpeg|png|webp);base64,/.test(story.image ?? '')) {
    const image = document.createElement('img');
    image.src = story.image;
    image.alt = 'Photo attached to the story';
    article.append(image);
  }
  const actions = document.createElement('div');
  actions.className = 'news-admin-nav';
  if (pending) {
    actions.append(action('Approve', () => review(story.id, true)), action('Reject', () => review(story.id, false)));
  } else {
    const edit = document.createElement('a');
    edit.className = 'link';
    edit.href = '/add-news.html?edit=' + encodeURIComponent(story.id);
    edit.textContent = 'Edit';
    actions.append(edit, action('Delete', () => {
      if (!confirm(`Delete “${story.title}” from this demo?`)) return;
      const news = readNews();
      commit({ ...news, stories: news.stories.filter((item) => item.id !== story.id) }, 'Story deleted from this browser’s demo.');
    }));
  }
  article.append(actions);
  return article;
}

function review(id, approve) {
  const news = readNews();
  const story = news.pending.find((item) => item.id === id);
  if (!story) return;
  if (!approve && !confirm(`Reject “${story.title}” and remove it from the demo queue?`)) return;
  commit({
    stories: approve ? [story, ...news.stories] : news.stories,
    pending: news.pending.filter((item) => item.id !== id),
  }, approve ? 'Submission approved and added to Previous News in this demo.' : 'Submission rejected.');
}

function render() {
  const news = readNews();
  for (const [id, stories, pending] of [
    ['news-review-list', news.pending, true],
    ['news-stories-list', news.stories, false],
  ]) {
    const list = document.getElementById(id);
    if (!list) continue;
    list.replaceChildren(...stories.map((story) => card(story, pending)));
    if (!stories.length) list.textContent = pending ? 'No submissions waiting for review.' : 'No news stories yet.';
  }
}

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  if (!title || !body) {
    message.textContent = 'Enter a headline and story.';
    return;
  }
  const news = readNews();
  if (editingId && !news.stories.some((story) => story.id === editingId)) {
    resetEditor();
    render();
    message.textContent = 'That story is no longer available.';
    return;
  }
  const stories = editingId
    ? news.stories.map((story) => story.id === editingId ? { ...story, title, body } : story)
    : [{ id: crypto.randomUUID(), title, body }, ...news.stories];
  if (commit({ ...news, stories }, 'Story saved in this browser’s demo.')) resetEditor();
});
cancel?.addEventListener('click', () => location.assign('/previous-news.html'));
if (form) {
  const requestedId = new URLSearchParams(location.search).get('edit');
  if (requestedId) {
    const story = readNews().stories.find((item) => item.id === requestedId);
    if (story) {
      editingId = story.id;
      titleInput.value = story.title;
      bodyInput.value = story.body;
      heading.textContent = 'Edit story';
      document.querySelector('#news-page-title').textContent = 'Edit News';
      document.title = 'Edit News | Tallmadge Soccer';
      cancel.hidden = false;
    } else {
      message.textContent = 'That story is no longer available.';
    }
  }
}
render();
