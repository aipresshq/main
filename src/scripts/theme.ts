const STORAGE_KEY = 'ai-snap-theme';

interface ViewTransitionLike {
  ready: Promise<void>;
}

interface DocumentWithViewTransition {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
}

function syncThemeToggle(toggle: HTMLButtonElement) {
  const isDark = document.documentElement.dataset.theme === 'dark';
  toggle.setAttribute('aria-pressed', String(isDark));
  toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

function applyTheme(nextTheme: 'light' | 'dark') {
  document.documentElement.dataset.theme = nextTheme;

  try {
    localStorage.setItem(STORAGE_KEY, nextTheme);
  } catch {
    // Storage can be unavailable in private browsing. The current page can
    // still switch themes even when the preference cannot be persisted.
  }
}

export function initTheme() {
  if (document.documentElement.dataset.themeInitialized === 'true') return;
  document.documentElement.dataset.themeInitialized = 'true';

  const toggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!toggle) return;

  toggle.addEventListener('click', (event) => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    const apply = () => applyTheme(nextTheme);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const documentWithTransition = document as unknown as DocumentWithViewTransition;

    if (!documentWithTransition.startViewTransition || reduceMotion) {
      apply();
      syncThemeToggle(toggle);
      return;
    }

    // Keyboard activation reports clientX/clientY as zero in most browsers.
    // Use the button centre so the reveal still starts from the control.
    const rect = toggle.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = documentWithTransition.startViewTransition(apply);
    syncThemeToggle(toggle);
    void transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
          },
          {
            duration: 500,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {
        // The theme has already been applied. A failed visual transition is
        // non-blocking and should not create an unhandled promise rejection.
      });
  });

  syncThemeToggle(toggle);
}
