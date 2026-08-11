export function initContactForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
  const status = document.querySelector<HTMLElement>('[data-contact-status]');
  const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || !status || !submitButton) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    for (const node of form.querySelectorAll<HTMLElement>('[data-error]')) {
      node.textContent = '';
    }
    status.classList.remove('is-error');

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      topic: String(formData.get('topic') ?? ''),
      message: String(formData.get('message') ?? ''),
    };

    submitButton.disabled = true;
    status.textContent = 'Sending…';

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (body.errors) {
          for (const [field, message] of Object.entries(body.errors)) {
            const node = form.querySelector<HTMLElement>(`[data-error="${field}"]`);
            if (node) node.textContent = String(message);
          }
        }
        status.textContent = body.error || 'Something went wrong. Please try again.';
        status.classList.add('is-error');
        return;
      }

      form.reset();
      status.textContent = "Message sent — we'll get back to you soon.";
    } catch {
      status.textContent = 'Network error. Please try again.';
      status.classList.add('is-error');
    } finally {
      submitButton.disabled = false;
    }
  });
}
