// Small UI helpers shared by every page: toasts and a confirm dialog (no window.confirm,
// which blocks the page and can't be styled).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, { action, onAction, ms = 4200, tone } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast${tone === 'bad' ? ' bad' : ''}`;
  t.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').addEventListener('click', () => { onAction(); t.remove(); });
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Resolves true when the person confirms. */
export function confirmDialog({ title, body, confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'confirm';
    d.setAttribute('aria-labelledby', 'confirm-title');
    d.innerHTML = `<h2 id="confirm-title">${esc(title)}</h2><p>${esc(body)}</p>
      <div class="actions"><button type="button" class="btn line" value="cancel">${esc(cancel)}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(confirm)}</button></div>`;
    document.body.append(d);
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) done(b.value === 'ok');
      else if (e.target === d) done(false);
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    d.showModal();
    d.querySelector('[value="cancel"]').focus();
  });
}
