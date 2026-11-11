const originalStories = [
  {
    "id": "original-0",
    "title": "U10 Boys finish undefeated",
    "body": "Tallmadge’s U10 Boys closed out the fall season with eight wins, zero losses, and zero draws to take the division title.\n\nTallmadge Soccer celebrated Coach Ryan Whitmore and the team as the club’s first undefeated division champions."
  },
  {
    "id": "original-1",
    "title": "Players work on their finishing",
    "body": "Tallmadge’s striking clinic brought U10 through U14 players together to practice shooting and finishing."
  },
  {
    "id": "original-2",
    "title": "Fall travel tryouts wrap up",
    "body": "Tallmadge held fall travel tryouts in October and posted team rosters after evaluations."
  }
];
const key = 'tallmadge-demo-news';

export function readNews() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved?.stories) && Array.isArray(saved?.pending)) return saved;
  } catch {
    // Fall back to the original sample stories.
  }
  return { stories: originalStories, pending: [] };
}

export function saveNews(news) {
  localStorage.setItem(key, JSON.stringify(news));
}
