import {
  createResultsHeader,
  createSearchResult,
  createStatus,
  loadPagefind,
  rememberRecentSearch,
} from './search';

function setActiveResult(input: HTMLInputElement, results: HTMLElement, index: number) {
  const links = [...results.querySelectorAll<HTMLAnchorElement>('a[role="option"]')];
  if (links.length === 0) return;

  const activeIndex = (index + links.length) % links.length;
  links.forEach((link, linkIndex) => {
    const active = linkIndex === activeIndex;
    link.classList.toggle('is-active', active);
    link.setAttribute('aria-selected', String(active));
  });
  input.setAttribute('aria-activedescendant', links[activeIndex].id);
  links[activeIndex].scrollIntoView({ block: 'nearest' });
  return activeIndex;
}

export function initSearchPage() {
  const form = document.querySelector<HTMLFormElement>('[data-search-page-form]');
  const input = document.querySelector<HTMLInputElement>('[data-search-page-input]');
  const results = document.querySelector<HTMLElement>('[data-search-page-results]');
  if (!form || !input || !results) return;

  let activeIndex = -1;
  let requestId = 0;
  let debounceTimer: number | undefined;

  const render = async (rawQuery: string) => {
    const query = rawQuery.trim();
    const currentRequest = ++requestId;
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');

    if (!query) {
      results.replaceChildren(
        createResultsHeader('Search the edition'),
        createStatus('Enter a company, product, or question to find a story.'),
      );
      return;
    }

    results.setAttribute('aria-busy', 'true');
    results.replaceChildren(
      createResultsHeader('Searching'),
      createStatus('Looking through the edition...'),
    );

    try {
      const pagefind = await loadPagefind();
      const search = await pagefind.search(query);
      const entries = await Promise.all(search.results.slice(0, 30).map((result) => result.data()));
      if (currentRequest !== requestId) return;

      results.removeAttribute('aria-busy');
      const links = entries
        .map((entry, index) => {
          const link = createSearchResult(entry, index);
          if (link) link.id = `page-search-result-${index}`;
          return link;
        })
        .filter((link): link is HTMLAnchorElement => Boolean(link));

      if (links.length === 0) {
        results.replaceChildren(
          createResultsHeader('No matches'),
          createStatus(`No stories found for "${query}".`),
        );
        return;
      }

      results.replaceChildren(
        createResultsHeader(`${links.length} ${links.length === 1 ? 'story' : 'stories'}`),
        ...links,
      );
    } catch {
      if (currentRequest !== requestId) return;
      results.removeAttribute('aria-busy');
      results.replaceChildren(
        createResultsHeader('Unavailable'),
        createStatus('Search is temporarily unavailable. Try again in a moment.'),
      );
    }
  };

  const updateUrl = (query: string) => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    rememberRecentSearch(query);
    updateUrl(query);
    void render(query);
  });

  input.addEventListener('input', () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const query = input.value.trim();
      updateUrl(query);
      void render(query);
    }, 180);
  });

  input.addEventListener('keydown', (event) => {
    const links = [...results.querySelectorAll<HTMLAnchorElement>('a[role="option"]')];
    if (event.key === 'ArrowDown' && links.length > 0) {
      event.preventDefault();
      activeIndex = setActiveResult(input, results, activeIndex + 1) ?? activeIndex;
    } else if (event.key === 'ArrowUp' && links.length > 0) {
      event.preventDefault();
      activeIndex =
        setActiveResult(input, results, activeIndex < 0 ? links.length - 1 : activeIndex - 1) ??
        activeIndex;
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      links[activeIndex]?.click();
    }
  });

  const initialQuery = new URL(window.location.href).searchParams.get('q')?.trim() ?? '';
  input.value = initialQuery;
  void render(initialQuery);
}
