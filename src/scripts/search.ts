interface PagefindEntry {
  data: () => Promise<{
    url?: string;
    excerpt?: string;
    meta?: { title?: string };
  }>;
}

interface PagefindModule {
  init: () => Promise<void>;
  search: (query: string) => Promise<{ results: PagefindEntry[] }>;
}

const PAGEFIND_URL = '/pagefind/pagefind.js';
const RESULT_LIMIT = 8;
const RECENT_SEARCHES_KEY = 'ai-snap-recent-searches';
let pagefindPromise: Promise<PagefindModule> | undefined;

export function normalizeResultUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

export function appendSafeExcerpt(container: HTMLElement, excerpt: string | undefined) {
  if (!excerpt) return;

  const parsed = new DOMParser().parseFromString(`<div>${excerpt}</div>`, 'text/html').body
    .firstElementChild;

  if (!parsed) return;

  parsed.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      container.append(document.createTextNode(node.textContent ?? ''));
      return;
    }

    if (node instanceof HTMLElement && node.tagName === 'MARK') {
      const mark = document.createElement('mark');
      mark.textContent = node.textContent ?? '';
      container.append(mark);
      return;
    }

    // Pagefind currently emits plain text and <mark>. Treat any unexpected
    // element as text rather than allowing response HTML into the page.
    container.append(document.createTextNode(node.textContent ?? ''));
  });
}

export function createResultsHeader(count: string): HTMLDivElement {
  const header = document.createElement('div');
  header.className = 'search-results-head';
  header.setAttribute('role', 'presentation');

  const label = document.createElement('span');
  label.textContent = 'Search results';
  const resultCount = document.createElement('span');
  resultCount.className = 'search-results-count';
  resultCount.textContent = count;
  header.append(label, resultCount);
  return header;
}

export function createStatus(message: string): HTMLParagraphElement {
  const status = document.createElement('p');
  status.className = 'search-status';
  status.textContent = message;
  return status;
}

export function createSearchResult(
  entry: Awaited<ReturnType<PagefindEntry['data']>>,
  index: number,
): HTMLAnchorElement | undefined {
  const url = normalizeResultUrl(entry.url);
  if (!url) return undefined;

  const link = document.createElement('a');
  link.id = `search-result-${index}`;
  link.className = 'search-result';
  link.href = url;
  link.setAttribute('role', 'option');
  link.setAttribute('aria-selected', 'false');

  const resultIndex = document.createElement('span');
  resultIndex.className = 'search-result-index';
  resultIndex.setAttribute('aria-hidden', 'true');
  resultIndex.textContent = String(index + 1).padStart(2, '0');

  const copy = document.createElement('span');
  copy.className = 'search-result-copy';
  const title = document.createElement('strong');
  title.textContent = entry.meta?.title ?? url;
  const excerpt = document.createElement('span');
  excerpt.className = 'search-result-excerpt';
  appendSafeExcerpt(excerpt, entry.excerpt);
  copy.append(title, excerpt);
  link.append(resultIndex, copy);
  return link;
}

export function loadPagefind() {
  if (!pagefindPromise) {
    pagefindPromise = import(/* @vite-ignore */ PAGEFIND_URL).then(async (module) => {
      const pagefind = module as unknown as PagefindModule;
      await pagefind.init();
      return pagefind;
    });
  }
  return pagefindPromise;
}

function readRecentSearches(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((query): query is string => typeof query === 'string').slice(0, 5);
  } catch {
    return [];
  }
}

export function rememberRecentSearch(query: string) {
  const normalized = query.trim().replace(/\s+/g, ' ');
  if (!normalized) return;

  try {
    const next = [normalized, ...readRecentSearches().filter((item) => item !== normalized)].slice(
      0,
      5,
    );
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Recent searches are a convenience and should never block searching.
  }
}

function renderRecentSearches(results: HTMLElement) {
  const recent = readRecentSearches();
  if (recent.length === 0) {
    results.replaceChildren();
    return;
  }

  const links = recent.map((query, index) => {
    const link = document.createElement('a');
    link.id = `search-result-${index}`;
    link.className = 'search-recent';
    link.href = `/search/?q=${encodeURIComponent(query)}`;
    link.setAttribute('role', 'option');
    link.setAttribute('aria-selected', 'false');
    link.textContent = query;
    return link;
  });

  results.replaceChildren(createResultsHeader('Recent searches'), ...links);
}

export function initSearch() {
  if (document.documentElement.dataset.searchInitialized === 'true') return;
  document.documentElement.dataset.searchInitialized = 'true';

  const input = document.querySelector<HTMLInputElement>('#search-input');
  const results = document.querySelector<HTMLElement>('#search-results');
  const searchBox = document.querySelector<HTMLElement>('[data-search-box]');
  if (!input || !results || !searchBox) return;

  let activeIndex = -1;
  let requestId = 0;
  let debounceTimer: number | undefined;

  const getResults = () => [...results.querySelectorAll<HTMLAnchorElement>('a[role="option"]')];

  const setOpen = (isOpen: boolean) => {
    searchBox.classList.toggle('is-open', isOpen);
    input.setAttribute('aria-expanded', String(isOpen));
    if (!isOpen) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    }
  };

  const setActiveResult = (index: number) => {
    const resultLinks = getResults();
    if (resultLinks.length === 0) return;

    activeIndex = (index + resultLinks.length) % resultLinks.length;
    resultLinks.forEach((result, resultIndex) => {
      const isActive = resultIndex === activeIndex;
      result.classList.toggle('is-active', isActive);
      result.setAttribute('aria-selected', String(isActive));
    });

    input.setAttribute('aria-activedescendant', `search-result-${activeIndex}`);
    resultLinks[activeIndex]?.scrollIntoView({ block: 'nearest' });
  };

  const openSearch = () => {
    input.focus();
    if (input.value.trim()) {
      setOpen(true);
      return;
    }

    renderRecentSearches(results);
    setOpen(!results.matches(':empty'));
  };

  const renderResults = async (query: string) => {
    const currentRequest = ++requestId;
    if (!query) {
      results.replaceChildren();
      results.removeAttribute('aria-busy');
      setOpen(false);
      return;
    }

    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');
    setOpen(true);
    results.setAttribute('aria-busy', 'true');
    results.replaceChildren(
      createResultsHeader('Searching'),
      createStatus('Looking through the edition...'),
    );

    try {
      const pagefind = await loadPagefind();
      const search = await pagefind.search(query);
      const entries = await Promise.all(
        search.results.slice(0, RESULT_LIMIT).map((result) => result.data()),
      );
      if (currentRequest !== requestId) return;

      results.removeAttribute('aria-busy');
      if (entries.length === 0) {
        results.replaceChildren(
          createResultsHeader('No matches'),
          createStatus(`No stories found for "${query}".`),
        );
        return;
      }

      const resultLinks = entries
        .map((entry, index) => createSearchResult(entry, index))
        .filter((result): result is HTMLAnchorElement => Boolean(result));
      results.replaceChildren(
        createResultsHeader(
          `${resultLinks.length} ${resultLinks.length === 1 ? 'story' : 'stories'}`,
        ),
        ...resultLinks,
      );
    } catch {
      if (currentRequest !== requestId) return;
      results.removeAttribute('aria-busy');
      results.replaceChildren(
        createResultsHeader('Unavailable'),
        createStatus('Search is temporarily unavailable.'),
      );
    }
  };

  input.addEventListener('focus', openSearch);
  input.addEventListener('input', (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void renderResults(target.value.trim()), 200);
  });

  input.addEventListener('keydown', (event) => {
    const resultLinks = getResults();
    if (event.key === 'ArrowDown' && resultLinks.length > 0) {
      event.preventDefault();
      setActiveResult(activeIndex + 1);
    } else if (event.key === 'ArrowUp' && resultLinks.length > 0) {
      event.preventDefault();
      setActiveResult(activeIndex < 0 ? resultLinks.length - 1 : activeIndex - 1);
    } else if (event.key === 'Home' && resultLinks.length > 0) {
      event.preventDefault();
      setActiveResult(0);
    } else if (event.key === 'End' && resultLinks.length > 0) {
      event.preventDefault();
      setActiveResult(resultLinks.length - 1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      resultLinks[activeIndex]?.click();
    } else if (event.key === 'Enter' && input.value.trim()) {
      event.preventDefault();
      rememberRecentSearch(input.value);
      window.location.assign(`/search/?q=${encodeURIComponent(input.value.trim())}`);
    } else if (event.key === 'Escape' && searchBox.classList.contains('is-open')) {
      event.preventDefault();
      setOpen(false);
      input.blur();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !searchBox.contains(event.target)) setOpen(false);
  });

  results.addEventListener('click', (event) => {
    const result = event.target instanceof Element ? event.target.closest('a.search-result') : null;
    if (result) rememberRecentSearch(input.value);
  });

  document.addEventListener('keydown', (event) => {
    const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    const isTypingElsewhere =
      event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName);

    if (isSearchShortcut) {
      event.preventDefault();
      openSearch();
    } else if (event.key === '/' && !isTypingElsewhere) {
      event.preventDefault();
      openSearch();
    }
  });
}
