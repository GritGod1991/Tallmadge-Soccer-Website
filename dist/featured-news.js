const feature = {
  record: '8–0–0',
  season: 'Fall 2026',
  category: 'Season recap',
  title: 'U10 Boys finish undefeated',
  summary: 'Tallmadge celebrates an 8–0–0 season and a division title.',
  paragraphs: [
    'Tallmadge’s U10 Boys closed out the fall season with eight wins, zero losses, and zero draws to take the division title.',
    'Tallmadge Soccer celebrated Coach Ryan Whitmore and the team as the club’s first undefeated division champions.',
  ],
};

const card = document.querySelector('[data-featured-news]');
const summary = card.dataset.featuredNews === 'summary';
card.querySelector('.score-art strong').textContent = feature.record;
card.querySelector('.score-art small').textContent = feature.season.toUpperCase();
card.querySelector('.kicker').textContent = summary ? feature.category : feature.category + ' · ' + feature.season;
card.querySelector(summary ? 'h3 a' : 'h3').textContent = feature.title;
card.querySelectorAll('.story p').forEach((paragraph, index) => {
  paragraph.textContent = summary ? feature.summary : feature.paragraphs[index];
});

const categoryLabels = { result: 'Game result', standings: 'Team standings update', field: 'Field update' };
try {
  const response = await fetch('/api/news', { cache: 'no-store' });
  if (response.ok) {
    const published = await response.json();
    if (summary && published.length) {
      const latest = published[0];
      card.querySelector('.score-art strong').textContent = 'NEWS';
      card.querySelector('.score-art small').textContent = 'TALLMADGE SOCCER';
      card.querySelector('.kicker').textContent = categoryLabels[latest.kind];
      const link = card.querySelector('h3 a');
      link.href = '/news.html#news-' + latest.id;
      link.textContent = latest.headline;
      card.querySelector('.story p').textContent = latest.body;
      const updates = document.querySelector('#home-news-links');
      for (const item of published.slice(1, 3)) {
        const row = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'story-link';
        link.href = '/news.html#news-' + item.id;
        link.textContent = item.headline;
        row.append(link);
        updates.append(row);
      }
      updates.hidden = published.length < 2;
    } else if (!summary && published.length) {
      const feed = document.querySelector('#published-club-news');
      for (const item of published) {
        const article = document.createElement('article');
        article.id = 'news-' + item.id;
        article.className = 'news-card';
        const story = document.createElement('div');
        story.className = 'story';
        const label = document.createElement('div');
        label.className = 'kicker';
        label.textContent = categoryLabels[item.kind];
        const heading = document.createElement('h3');
        heading.textContent = item.headline;
        const body = document.createElement('p');
        body.textContent = item.body;
        story.append(label, heading, body);
        if (item.kind === 'field') {
          const fields = document.createElement('a');
          fields.href = '/field-status.html';
          fields.className = 'link';
          fields.textContent = 'Current field status';
          story.append(fields);
        }
        article.append(story);
        feed.append(article);
      }
      feed.hidden = false;
      if (location.hash.startsWith('#news-')) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  }
} catch {
  // The existing club recap remains available if the live news feed is unavailable.
}
