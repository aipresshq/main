// scrollTo rounds to the nearest device pixel, so a section that should land
// exactly on the threshold after a TOC click can settle a fraction of a
// pixel short of it. A strict <= comparison then excludes that section and
// the highlight snaps back to the previous link. This absorbs that
// sub-pixel gap without affecting anything a real scroll distance away.
const ACTIVE_SECTION_EPSILON = 2;

function getArticleOutlines() {
  return [...document.querySelectorAll<HTMLElement>('[data-article-toc]')];
}

function getArticleForOutline(outline: HTMLElement) {
  return outline.closest('.article-layout')?.querySelector<HTMLElement>('article[data-post-id]');
}

function getSectionForLink(article: HTMLElement, link: HTMLAnchorElement) {
  const targetId = link.dataset.tocTarget?.trim();
  if (!targetId) return undefined;

  return [...article.querySelectorAll<HTMLElement>('[id]')].find(
    (section) => section.id === targetId,
  );
}

function getScrollThreshold() {
  const primaryBar = document.querySelector<HTMLElement>('.primary-bar');
  return Math.max(96, (primaryBar?.getBoundingClientRect().height ?? 64) + 28);
}

function scrollToSection(section: HTMLElement) {
  const top = Math.max(
    0,
    window.scrollY + section.getBoundingClientRect().top - getScrollThreshold(),
  );
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';

  window.scrollTo({ top, behavior });
}

export function initArticleToc() {
  if (document.documentElement.dataset.articleTocInitialized === 'true') return;
  document.documentElement.dataset.articleTocInitialized = 'true';

  let frame = 0;
  const pendingScrolls = new WeakMap<
    HTMLElement,
    { section: HTMLElement; activeIndex: number; timeout: number }
  >();

  const setCurrentLink = (outline: HTMLElement, activeIndex: number) => {
    const links = [...outline.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];

    links.forEach((link, index) => {
      const isCurrent = index === activeIndex;
      link.classList.toggle('is-current', isCurrent);
      link.closest('li')?.classList.toggle('is-current', isCurrent);
      if (isCurrent) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const handleTocClick = (outline: HTMLElement, event: MouseEvent) => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;

    const link = eventTarget.closest<HTMLAnchorElement>('[data-toc-link]');
    if (!link || !outline.contains(link)) return;

    const article = getArticleForOutline(outline);
    const section = article ? getSectionForLink(article, link) : undefined;
    if (!section) return;

    event.preventDefault();

    if (window.location.hash !== `#${section.id}`) {
      window.history.pushState(window.history.state, '', `#${section.id}`);
    }

    const links = [...outline.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
    const activeIndex = links.indexOf(link);
    if (activeIndex >= 0) setCurrentLink(outline, activeIndex);

    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    if (activeIndex >= 0 && behavior === 'smooth') {
      const previous = pendingScrolls.get(outline);
      if (previous) window.clearTimeout(previous.timeout);
      const timeout = window.setTimeout(() => {
        pendingScrolls.delete(outline);
        schedule();
      }, 1800);
      pendingScrolls.set(outline, { section, activeIndex, timeout });
    }

    scrollToSection(section);

    const previousTabIndex = section.getAttribute('tabindex');
    if (previousTabIndex === null) section.setAttribute('tabindex', '-1');
    section.focus({ preventScroll: true });
    if (previousTabIndex === null) {
      window.setTimeout(() => {
        if (section.isConnected) section.removeAttribute('tabindex');
      }, 1200);
    }

    if (window.matchMedia('(max-width: 780px)').matches) {
      outline.querySelector<HTMLDetailsElement>('.article-toc')?.removeAttribute('open');
    }
  };

  const bindOutlines = () => {
    getArticleOutlines().forEach((outline) => {
      if (outline.dataset.articleTocBound === 'true') return;
      outline.dataset.articleTocBound = 'true';
      outline.addEventListener('click', (event) => handleTocClick(outline, event));
    });
  };

  const update = () => {
    frame = 0;
    bindOutlines();
    const threshold = getScrollThreshold();

    getArticleOutlines().forEach((outline) => {
      const article = getArticleForOutline(outline);
      if (!article) return;

      const links = [...outline.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
      const sections = links.map((link) => getSectionForLink(article, link));
      if (sections.length === 0) return;

      const pending = pendingScrolls.get(outline);
      if (pending) {
        if (!pending.section.isConnected) {
          window.clearTimeout(pending.timeout);
          pendingScrolls.delete(outline);
        } else {
          const targetTop = pending.section.getBoundingClientRect().top;
          const atBottom =
            window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
          const reachedTarget =
            Math.abs(targetTop - threshold) <= 12 || (atBottom && targetTop <= window.innerHeight);

          setCurrentLink(outline, pending.activeIndex);
          if (!reachedTarget) return;

          window.clearTimeout(pending.timeout);
          pendingScrolls.delete(outline);
        }
      }

      let activeIndex = 0;

      sections.forEach((section, index) => {
        if (section && section.getBoundingClientRect().top <= threshold + ACTIVE_SECTION_EPSILON) {
          activeIndex = index;
        }
      });

      setCurrentLink(outline, activeIndex);
    });
  };

  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  update();
}
