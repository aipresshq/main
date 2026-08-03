export function initEditionDate() {
  const editionDate = document.querySelector<HTMLElement>('.edition-date');
  if (!editionDate) return;

  editionDate.textContent = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}
