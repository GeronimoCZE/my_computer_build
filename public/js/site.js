// Runs on every page: colour theme, mobile nav, account menu, sign-in notices, table filters.
import { toast, confirmDialog } from './ui.js';
import { account } from './account.js';

const root = document.documentElement;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------------------------------------------------------------- theme */
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');

function applyThemedImages() {
  const t = currentTheme();
  for (const pic of $$('picture[data-themed]')) {
    const img = $('img', pic);
    // an explicit choice overrides the <source media> query
    for (const s of $$('source', pic)) s.media = root.dataset.theme ? 'not all' : '(prefers-color-scheme: dark)';
    if (root.dataset.theme && img.dataset[t]) img.src = img.dataset[t];
  }
}
function setTheme(t) {
  root.dataset.theme = t;
  try { localStorage.setItem('mcb.theme', t); } catch { /* private mode */ }
  applyThemedImages();
  updateThemeButton();
  document.dispatchEvent(new CustomEvent('mcb:theme', { detail: t }));
}
function updateThemeButton() {
  const label = currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  for (const b of $$('[data-theme-toggle]')) { b.setAttribute('aria-label', label); b.title = label; }
}
for (const b of $$('[data-theme-toggle]')) b.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
systemDark.addEventListener('change', () => {
  if (root.dataset.theme) return;
  updateThemeButton();
  document.dispatchEvent(new CustomEvent('mcb:theme', { detail: currentTheme() }));
});
applyThemedImages();
updateThemeButton();

/* ---------------------------------------------------------------- mobile nav */
const menuBtn = $('.nav-menu');
const links = $('#nav-links');
menuBtn?.addEventListener('click', () => {
  const open = !links.classList.contains('open');
  links.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
});

/* ---------------------------------------------------------------- account menu */
const acct = $('[data-account][data-signed-in]');
if (acct) {
  const btn = $('.avatar-btn', acct);
  const menu = $('.menu', acct);
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const open = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); $('[role="menuitem"]', menu)?.focus(); };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  document.addEventListener('click', (e) => { if (!acct.contains(e.target)) close(); });
  menu.addEventListener('keydown', (e) => {
    const items = $$('[role="menuitem"]', menu);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); btn.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  $('[data-signout]', menu).addEventListener('click', async () => {
    close();
    try { await account.signOut(); location.reload(); } catch { toast('Couldn’t sign out. Check your connection and try again.', { tone: 'bad' }); }
  });
  $('[data-delete-account]', menu).addEventListener('click', async () => {
    close();
    const ok = await confirmDialog({
      title: 'Delete your saved data?',
      body: 'This removes every build saved to your account from our server and signs you out. Share links you sent keep working. This can’t be undone.',
      confirm: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    try {
      await account.deleteData();
      try { sessionStorage.setItem('mcb.flash', 'Your saved data was deleted and you are signed out.'); } catch { /* storage blocked */ }
      location.reload();
    } catch { toast('Couldn’t delete your data just now. Please try again.', { tone: 'bad' }); }
  });
}

/* ---------------------------------------------------------------- notices */
// ?signin=… comes back from Google. The builder handles "ok" itself (it moves local builds over).
const params = new URLSearchParams(location.search);
const signin = params.get('signin');
if (signin) {
  window.mcbSignin = signin;
  params.delete('signin');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  const msg = {
    ok: 'You’re signed in. Builds you save now follow your Google account.',
    cancelled: 'Sign-in cancelled.',
    expired: 'That sign-in link expired. Please try again.',
    failed: 'Google sign-in didn’t work this time. Please try again.',
  }[signin];
  if (msg && !(signin === 'ok' && document.body.classList.contains('page-builder'))) {
    toast(msg, { tone: signin === 'ok' || signin === 'cancelled' ? undefined : 'bad', ms: 5000 });
  }
}
try {
  const flash = sessionStorage.getItem('mcb.flash');
  if (flash) { sessionStorage.removeItem('mcb.flash'); toast(flash, { ms: 5000 }); }
} catch { /* storage blocked */ }

/* ---------------------------------------------------------------- home */
// Old share links pointed at the root: send them to the builder.
if (location.pathname === '/' && /^#b=/.test(location.hash)) location.replace(`/build${location.hash}`);
const cont = $('[data-continue]');
if (cont) {
  try {
    const cur = JSON.parse(localStorage.getItem('mcb.current.v1') || 'null');
    const b = cur?.build;
    const n = b ? ['case', 'motherboard', 'cpu', 'cooler', 'ram', 'gpu', 'psu'].filter((k) => b[k]).length + (b.storage?.length || 0) : 0;
    if (n) {
      const a = document.createElement('a');
      a.href = '/build';
      a.textContent = `Continue “${cur.name || 'Untitled build'}”`;
      cont.append('Welcome back. ', a, `, ${n} part${n === 1 ? '' : 's'} so far.`);
      cont.hidden = false;
    }
  } catch { /* nothing saved */ }
}

/* ---------------------------------------------------------------- table filters */
for (const input of $$('input[data-filter]')) {
  const table = $(input.dataset.filter);
  const rows = $$('tbody tr', table);
  const empty = table.parentElement.querySelector('.table-empty');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const on = !q || r.dataset.q.includes(q) || r.textContent.toLowerCase().includes(q);
      r.hidden = !on;
      shown += on;
    }
    if (empty) empty.hidden = shown > 0;
  });
}
