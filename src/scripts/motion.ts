const motionSelector = [
  '.section',
  '.band',
  '.latest-section',
  '.newsroom-section',
  '.category-front > .category-intro',
  '.category-front > .category-featured',
  '.category-front > .category-layout',
  '.author-profile',
  '.desk-index',
  '.related-news',
  '.desk-showcase',
  '.briefing-board',
  '.story-timeline',
  '.topic-directory',
  '.article-header',
  '.article-figure',
  '.article-measure',
  '.article-sidebar',
  '.article-endcap',
  '.suggested-reads',
].join(',');

function markMotionTargets(scope: ParentNode, observer?: IntersectionObserver) {
  const targets: HTMLElement[] = [];

  if (scope instanceof HTMLElement && scope.matches(motionSelector)) {
    targets.push(scope);
  }

  scope.querySelectorAll<HTMLElement>(motionSelector).forEach((element) => targets.push(element));

  targets.forEach((element, index) => {
    if (element.dataset.motion) return;

    element.dataset.motion = 'pending';
    element.style.setProperty('--motion-delay', `${Math.min(index * 45, 360)}ms`);

    if (observer) {
      observer.observe(element);
    } else {
      element.dataset.motion = 'visible';
    }
  });
}

export function initMotion() {
  if (document.documentElement.dataset.motionInitialized === 'true') return;
  document.documentElement.dataset.motionInitialized = 'true';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const primaryBar = document.querySelector<HTMLElement>('.primary-bar');

  const syncHeaderState = () => {
    primaryBar?.classList.toggle('is-scrolled', window.scrollY > 10);
  };

  syncHeaderState();
  window.addEventListener('scroll', syncHeaderState, { passive: true });

  if (reducedMotion.matches) return;

  document.documentElement.classList.add('motion-ready');

  const revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries, observer) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              const element = entry.target as HTMLElement;
              element.dataset.motion = 'visible';
              observer.unobserve(element);
            });
          },
          { rootMargin: '0px 0px -8% 0px', threshold: 0.04 },
        )
      : undefined;

  markMotionTargets(document, revealObserver);

  if (!revealObserver) return;

  const mutationObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) markMotionTargets(node, revealObserver);
      });
    });
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}
