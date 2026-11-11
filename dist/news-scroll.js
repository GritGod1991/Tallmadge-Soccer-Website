const feed = document.querySelector('.news-scroll');
const track = document.querySelector('.news-scroll-track');
const thumb = track.firstElementChild;

feed.parentElement.classList.add('has-scroll-indicator');

function updateScrollIndicator() {
  const scrollRange = feed.scrollHeight - feed.clientHeight;
  track.hidden = scrollRange <= 0;
  if (track.hidden) return;

  const trackHeight = track.clientHeight;
  const thumbHeight = Math.max(24, trackHeight * feed.clientHeight / feed.scrollHeight);
  const progress = Math.max(0, Math.min(1, feed.scrollTop / scrollRange));
  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${progress * (trackHeight - thumbHeight)}px)`;
}

feed.addEventListener('scroll', updateScrollIndicator, { passive: true });
const observer = new ResizeObserver(updateScrollIndicator);
observer.observe(feed);
for (const storyGroup of feed.children) observer.observe(storyGroup);
updateScrollIndicator();
