const STORAGE_KEY = 'ai-snap-saved-stories';
let volatileSavedStories: SavedStory[] = [];

interface SavedStory {
  id: string;
  title: string;
  url: string;
  savedAt: number;
}

function readSavedStories(): SavedStory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (story): story is SavedStory =>
        story &&
        typeof story.id === 'string' &&
        typeof story.title === 'string' &&
        typeof story.url === 'string' &&
        typeof story.savedAt === 'number',
    );
  } catch {
    return volatileSavedStories;
  }
}

function writeSavedStories(stories: SavedStory[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
  } catch {
    // Storage can be unavailable in private browsing, so retain the current
    // page's state in memory even when it cannot be persisted.
    volatileSavedStories = stories;
  }
  window.dispatchEvent(new CustomEvent('ai-snap:bookmarks-changed'));
}

function syncBookmarkButtons(stories: SavedStory[]) {
  const savedIds = new Set(stories.map((story) => story.id));
  document.querySelectorAll<HTMLElement>('[data-bookmark-toggle]').forEach((button) => {
    const isSaved = savedIds.has(button.dataset.bookmarkId ?? '');
    button.setAttribute('aria-pressed', String(isSaved));
    button.classList.toggle('is-saved', isSaved);
    const label = button.querySelector<HTMLElement>('[data-bookmark-label]');
    const nextLabel = isSaved ? 'Saved' : 'Save';
    if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
    button.setAttribute('title', isSaved ? 'Remove from saved stories' : 'Save for later');
  });
}

function renderSavedList(stories: SavedStory[]) {
  const list = document.querySelector<HTMLElement>('[data-saved-list]');
  const count = document.querySelector<HTMLElement>('[data-saved-count]');
  const summary = document.querySelector<HTMLElement>('[data-saved-summary]');
  if (!list || !count || !summary) return;

  count.textContent = String(stories.length);
  count.hidden = stories.length === 0;
  summary.textContent = `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`;
  list.replaceChildren();

  if (stories.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'saved-empty';
    empty.textContent = 'Save a story and it will appear here.';
    list.append(empty);
    return;
  }

  stories.forEach((story) => {
    const item = document.createElement('div');
    item.className = 'saved-item';

    const link = document.createElement('a');
    link.href = story.url;
    link.textContent = story.title;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'saved-item-remove';
    remove.dataset.bookmarkRemove = story.id;
    remove.setAttribute('aria-label', `Remove ${story.title} from saved stories`);
    remove.textContent = '×';

    item.append(link, remove);
    list.append(item);
  });
}

function syncSavedUi() {
  const stories = readSavedStories();
  syncBookmarkButtons(stories);
  renderSavedList(stories);
}

export function initBookmarks() {
  if (document.documentElement.dataset.bookmarksInitialized === 'true') return;
  document.documentElement.dataset.bookmarksInitialized = 'true';

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : undefined;
    const removeButton = target?.closest<HTMLElement>('[data-bookmark-remove]');
    if (removeButton) {
      event.preventDefault();
      const next = readSavedStories().filter(
        (story) => story.id !== removeButton.dataset.bookmarkRemove,
      );
      writeSavedStories(next);
      syncSavedUi();
      return;
    }

    const button = target?.closest<HTMLElement>('[data-bookmark-toggle]');
    if (!button) return;

    event.preventDefault();
    const id = button.dataset.bookmarkId;
    const title = button.dataset.bookmarkTitle;
    const url = button.dataset.bookmarkUrl;
    if (!id || !title || !url) return;

    const stories = readSavedStories();
    const isSaved = stories.some((story) => story.id === id);
    const next = isSaved
      ? stories.filter((story) => story.id !== id)
      : [{ id, title, url, savedAt: Date.now() }, ...stories];
    writeSavedStories(next);
    syncSavedUi();
  });

  window.addEventListener('storage', syncSavedUi);
  window.addEventListener('ai-snap:bookmarks-changed', syncSavedUi);

  const observer = new MutationObserver(() => syncBookmarkButtons(readSavedStories()));
  observer.observe(document.body, { childList: true, subtree: true });
  syncSavedUi();
}
