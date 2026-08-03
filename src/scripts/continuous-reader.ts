interface ArticleFragmentCandidate<T> {
  article: T;
  postId: string | undefined;
  postUrl: string | undefined;
  documentTitle: string | undefined;
}

export function validateArticleFragmentCandidates<T>(
  candidates: readonly ArticleFragmentCandidate<T>[],
): T | undefined {
  if (candidates.length !== 1) return undefined;

  const candidate = candidates[0];
  if (!candidate.postId?.trim() || !candidate.postUrl?.trim() || !candidate.documentTitle?.trim()) {
    return undefined;
  }

  return candidate.article;
}

export function parseArticleFragment(html: string): HTMLElement | undefined {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const candidates = [...document.querySelectorAll<HTMLElement>('[data-continuous-article]')].map(
    (article) => ({
      article,
      postId: article.dataset.postId,
      postUrl: article.dataset.postUrl,
      documentTitle: article.dataset.documentTitle,
    }),
  );

  return validateArticleFragmentCandidates(candidates);
}

type ContinuousReaderPageTransition = 'pagehide' | 'pageshow';

interface ContinuousReaderLifecycleActions {
  restore: () => void;
  cleanup: () => void;
}

export function handleContinuousReaderPageTransition(
  transition: ContinuousReaderPageTransition,
  persisted: boolean,
  actions: ContinuousReaderLifecycleActions,
): void {
  if (transition === 'pagehide') {
    if (!persisted) actions.cleanup();
    return;
  }

  if (persisted) actions.restore();
}

interface ContinuousLoadState {
  loading: boolean;
  failed: boolean;
  cleanedUp: boolean;
  terminal: boolean;
}

export function canStartContinuousLoad(
  nextFragment: string | undefined,
  state: ContinuousLoadState,
): boolean {
  return (
    Boolean(nextFragment?.trim()) &&
    !state.loading &&
    !state.failed &&
    !state.cleanedUp &&
    !state.terminal
  );
}

export function initContinuousReader(root: HTMLElement): (() => void) | undefined {
  if (typeof IntersectionObserver === 'undefined') return undefined;

  const transition = root.querySelector<HTMLElement>('.continuous-transition');
  const nextLink = root.querySelector<HTMLAnchorElement>('.continuous-next-link');
  const sentinel = root.querySelector<HTMLElement>('.continuous-sentinel');
  const status = root.querySelector<HTMLElement>('.continuous-status');

  if (!transition || !nextLink || !sentinel || !status) return undefined;

  const initialTitle = document.title;
  const loadedIds = new Set(
    [...root.querySelectorAll<HTMLElement>('[data-post-id]')]
      .map((element) => element.dataset.postId?.trim())
      .filter((postId): postId is string => Boolean(postId)),
  );
  const articlesInBand = new Set<HTMLElement>();
  let activeUrl = window.location.pathname;
  let loading = false;
  let failed = false;
  let abortController: AbortController | undefined;
  let cleanedUp = false;
  let terminal = false;

  const syncActiveArticle = () => {
    const activationLine = window.innerHeight * 0.28;
    let nearest: HTMLElement | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const article of articlesInBand) {
      const bounds = article.getBoundingClientRect();
      const distance =
        activationLine < bounds.top
          ? bounds.top - activationLine
          : activationLine > bounds.bottom
            ? activationLine - bounds.bottom
            : 0;
      const topDistance = Math.abs(bounds.top - activationLine);
      const nearestTopDistance = nearest
        ? Math.abs(nearest.getBoundingClientRect().top - activationLine)
        : Number.POSITIVE_INFINITY;

      if (
        distance < nearestDistance ||
        (distance === nearestDistance && topDistance < nearestTopDistance)
      ) {
        nearest = article;
        nearestDistance = distance;
      }
    }

    const postUrl = nearest?.dataset.postUrl?.trim();
    if (!nearest || !postUrl || postUrl === activeUrl) return;

    const container = nearest.closest<HTMLElement>('[data-continuous-article]');
    const documentTitle = container?.dataset.documentTitle?.trim() || initialTitle;
    history.replaceState(history.state, '', postUrl);
    document.title = documentTitle;
    activeUrl = postUrl;
  };

  const articleObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const article = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          articlesInBand.add(article);
        } else {
          articlesInBand.delete(article);
        }
      }

      syncActiveArticle();
    },
    { rootMargin: '-28% 0px -62% 0px' },
  );

  for (const article of root.querySelectorAll<HTMLElement>('.article')) {
    articleObserver.observe(article);
  }

  const loadNextArticle = async () => {
    const nextFragment = sentinel.dataset.nextFragment?.trim();
    if (
      !nextFragment ||
      !canStartContinuousLoad(nextFragment, { loading, failed, cleanedUp, terminal })
    )
      return;

    loading = true;
    root.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    abortController = controller;

    try {
      const response = await fetch(nextFragment, { signal: controller.signal });
      if (!response.ok) throw new Error(`Fragment request failed with ${response.status}`);

      const fragmentHtml = await response.text();
      if (cleanedUp || terminal || controller.signal.aborted) return;

      const articleSection = parseArticleFragment(fragmentHtml);
      if (!articleSection) throw new Error('Fragment parsing failed');

      const postId = articleSection.dataset.postId!.trim();
      if (loadedIds.has(postId))
        throw new Error(`Fragment loading failed: duplicate post ${postId}`);

      transition.before(articleSection);
      loadedIds.add(postId);

      const article = articleSection.querySelector<HTMLElement>('.article');
      if (article) articleObserver.observe(article);

      const headline =
        articleSection.querySelector<HTMLElement>('.article-title')?.textContent?.trim() ||
        articleSection.dataset.documentTitle!.trim();
      const followingFragment = articleSection.dataset.nextFragment?.trim();
      const followingUrl = articleSection.dataset.nextUrl?.trim();

      if (followingFragment && followingUrl) {
        nextLink.setAttribute('href', followingUrl);
        nextLink.textContent =
          articleSection.dataset.nextTitle?.trim() || 'Continue to the next story';
        sentinel.dataset.nextFragment = followingFragment;
        status.textContent = `Loaded ${headline}.`;
      } else {
        terminal = true;
        disarmSentinel();
        status.textContent = "You've reached the end.";
        transition.remove();
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        failed = true;
      }
    } finally {
      loading = false;
      root.setAttribute('aria-busy', 'false');
      if (abortController === controller) abortController = undefined;
    }
  };

  const sentinelObserver = new IntersectionObserver(
    (entries) => {
      if (cleanedUp || terminal) return;
      if (entries.some((entry) => entry.isIntersecting)) void loadNextArticle();
    },
    { rootMargin: '800px 0px' },
  );

  const disarmSentinel = () => {
    delete sentinel.dataset.nextFragment;
    sentinelObserver.takeRecords();
    sentinelObserver.disconnect();
  };

  sentinelObserver.observe(sentinel);

  const restore = () => {
    if (cleanedUp || terminal) return;
    syncActiveArticle();

    const bounds = sentinel.getBoundingClientRect();
    if (bounds.top <= window.innerHeight + 800 && bounds.bottom >= -800) {
      void loadNextArticle();
    }
  };

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    abortController?.abort();
    disarmSentinel();
    articleObserver.disconnect();
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };

  const lifecycleActions = { restore, cleanup };
  function onPageHide(event: PageTransitionEvent) {
    handleContinuousReaderPageTransition('pagehide', event.persisted, lifecycleActions);
  }
  function onPageShow(event: PageTransitionEvent) {
    handleContinuousReaderPageTransition('pageshow', event.persisted, lifecycleActions);
  }

  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  return cleanup;
}
