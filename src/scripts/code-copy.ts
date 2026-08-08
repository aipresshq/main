const INITIAL_LABEL = 'Copy';
const READY_ATTRIBUTE = 'data-code-copy-ready';

function createCopyButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy-button';
  button.dataset.codeCopy = 'true';
  button.setAttribute('aria-label', 'Copy code block');
  button.textContent = INITIAL_LABEL;
  return button;
}

function enhanceCodeBlock(pre: HTMLPreElement): void {
  if (pre.hasAttribute(READY_ATTRIBUTE)) return;

  const container = document.createElement('div');
  container.className = 'code-block';
  container.dataset.codeContainer = 'true';

  const toolbar = document.createElement('div');
  toolbar.className = 'code-block-toolbar';

  const label = document.createElement('span');
  label.className = 'code-block-label';
  label.textContent = 'Code';

  const button = createCopyButton();
  toolbar.append(label, button);

  pre.removeAttribute('data-code-block');
  pre.setAttribute(READY_ATTRIBUTE, '');
  pre.replaceWith(container);
  container.append(toolbar, pre);
}

export function enhanceCodeBlocks(root: ParentNode): void {
  root.querySelectorAll<HTMLPreElement>('.prose pre[data-code-block]').forEach(enhanceCodeBlock);
}

async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function resetButton(button: HTMLButtonElement): void {
  window.setTimeout(() => {
    button.disabled = false;
    button.textContent = INITIAL_LABEL;
  }, 2200);
}

export function initCodeCopy(): void {
  if (document.documentElement.dataset.codeCopyInitialized === 'true') return;
  document.documentElement.dataset.codeCopyInitialized = 'true';

  enhanceCodeBlocks(document);

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : undefined;
    const button = target?.closest<HTMLButtonElement>('[data-code-copy]');
    if (!button) return;

    const pre = button.closest<HTMLElement>('[data-code-container]')?.querySelector('pre');
    if (!pre) return;

    button.disabled = true;
    button.textContent = (await copyText(pre.textContent ?? '')) ? 'Copied' : 'Copy failed';
    resetButton(button);
  });

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element || node instanceof DocumentFragment) enhanceCodeBlocks(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
