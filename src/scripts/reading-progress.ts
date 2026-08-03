export function initReadingProgress() {
  const progressBar = document.querySelector<HTMLElement>('[data-reading-progress]');
  if (!progressBar || !document.querySelector('.article')) return;

  let ticking = false;

  const updateProgress = () => {
    ticking = false;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
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
