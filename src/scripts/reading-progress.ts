// The continuous reader can have more than one .article on the page at
// once, so progress must be measured against whichever article is
// currently being read, not the whole document's scroll range - otherwise
// the bar undershoots 100% at an article's end and never resets for the
// next one.
function findActiveArticle(): HTMLElement | undefined {
  const articles = [...document.querySelectorAll<HTMLElement>('.article')];
  if (articles.length === 0) return undefined;

  const referenceY = window.innerHeight * 0.5;
  let active: HTMLElement | undefined;
  let activeDistance = Number.POSITIVE_INFINITY;

  for (const article of articles) {
    const rect = article.getBoundingClientRect();
    const distance =
      referenceY < rect.top
        ? rect.top - referenceY
        : referenceY > rect.bottom
          ? referenceY - rect.bottom
          : 0;
    if (distance < activeDistance) {
      activeDistance = distance;
      active = article;
    }
  }

  return active;
}

export function initReadingProgress() {
  const progressBar = document.querySelector<HTMLElement>('[data-reading-progress]');
  if (!progressBar || !document.querySelector('.article')) return;

  let ticking = false;

  const updateProgress = () => {
    ticking = false;
    const article = findActiveArticle();
    if (!article) {
      progressBar.style.setProperty('--reading-progress', '0');
      return;
    }

    const rect = article.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    const progress = scrollable > 0 ? -rect.top / scrollable : rect.top <= 0 ? 1 : 0;
    progressBar.style.setProperty('--reading-progress', String(Math.min(1, Math.max(0, progress))));
  };

  const requestProgressUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateProgress);
  };

  window.addEventListener('scroll', requestProgressUpdate, { passive: true });
  window.addEventListener('resize', requestProgressUpdate);

  if ('ResizeObserver' in window) {
    new ResizeObserver(requestProgressUpdate).observe(document.body);
  }

  updateProgress();
}
