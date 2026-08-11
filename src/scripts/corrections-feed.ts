interface Correction {
  postTitle: string;
  postUrl: string | null;
  description: string;
  correctedAt: string;
}

function formatCorrectionDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

function renderCorrection(correction: Correction): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'corrections-item';

  const time = document.createElement('time');
  time.dateTime = correction.correctedAt;
  time.textContent = formatCorrectionDate(correction.correctedAt);

  const title = document.createElement('p');
  title.className = 'corrections-item-title';
  if (correction.postUrl) {
    const link = document.createElement('a');
    link.href = correction.postUrl;
    link.textContent = correction.postTitle;
    title.append(link);
  } else {
    title.textContent = correction.postTitle;
  }

  const description = document.createElement('p');
  description.className = 'corrections-item-description';
  description.textContent = correction.description;

  item.append(time, title, description);
  return item;
}

export function initCorrectionsFeed(): void {
  const container = document.querySelector<HTMLElement>('[data-corrections-feed]');
  const status = container?.querySelector<HTMLElement>('[data-corrections-status]');
  if (!container || !status) return;

  fetch('/api/corrections')
    .then((response) => {
      if (!response.ok) throw new Error('corrections request failed');
      return response.json();
    })
    .then((body: { corrections?: Correction[] }) => {
      const corrections = Array.isArray(body.corrections) ? body.corrections : [];
      if (corrections.length === 0) {
        status.textContent = 'No corrections have been issued.';
        return;
      }
      status.remove();
      const list = document.createElement('ul');
      list.className = 'corrections-list';
      for (const correction of corrections) {
        list.append(renderCorrection(correction));
      }
      container.append(list);
    })
    .catch(() => {
      status.textContent = 'Corrections could not be loaded right now.';
    });
}
