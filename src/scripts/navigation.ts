function initSidebarModules() {
  const sidebarQuery = window.matchMedia('(max-width: 780px)');
  const sidebarModules = document.querySelectorAll<HTMLElement>('[data-mobile-sidebar]');

  const syncSidebarModules = () => {
    sidebarModules.forEach((module) => {
      if (sidebarQuery.matches) {
        module.removeAttribute('open');
      } else {
        module.setAttribute('open', '');
      }
    });
  };

  syncSidebarModules();
  sidebarQuery.addEventListener('change', syncSidebarModules);
}

function initDismissibleMenus() {
  const categoryMenu = document.querySelector<HTMLDetailsElement>('.category-menu');
  const savedMenu = document.querySelector<HTMLDetailsElement>('.saved-menu');
  const menus = [categoryMenu, savedMenu].filter((menu): menu is HTMLDetailsElement =>
    Boolean(menu),
  );

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    menus.forEach((menu) => {
      if (!menu.contains(target)) menu.removeAttribute('open');
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    const openMenu = menus.find((menu) => menu.hasAttribute('open'));
    if (!openMenu) return;

    event.preventDefault();
    openMenu.removeAttribute('open');
    openMenu.querySelector('summary')?.focus();
  };

  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
}

export function initNavigation() {
  if (document.documentElement.dataset.navigationInitialized === 'true') return;
  document.documentElement.dataset.navigationInitialized = 'true';

  initSidebarModules();
  initDismissibleMenus();
}
