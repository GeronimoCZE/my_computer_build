// One SVG sprite for every page: UI icons plus a line glyph for each part category.
// Pages use <svg><use href="#i-name"/></svg>; the builder's JS uses the same ids.

const UI = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/>',
  save: '<path d="M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v8h14v-8"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"/>',
  panel: '<path d="M5 3h14v18H5zM9 7l6 6M9 12l3 3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18v.5"/>',
  stop: '<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  new: '<path d="M6 3h8l4 4v14H6zM12 10v7M8.5 13.5h7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  cart: '<path d="M3 4h2.5l2.2 11h10.6L20.5 8H6.6"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<path d="M8 8h12v12H8zM16 8V4H4v12h4"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-8h16v8h-3M7 14h10v7H7z"/>',
  out: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  cube: '<path d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9zM3.5 7.5 12 12.5l8.5-5M12 12.5v9"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0M12 17l4-5"/><circle cx="12" cy="17" r="1"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  google: '',
};

// Category glyphs: same 24 px grid and stroke as the UI set, drawn as simplified parts.
export const CAT_ICONS = {
  case: '<rect x="6.5" y="2.5" width="11" height="19" rx="1.5"/><path d="M9.5 6.5h5M9.5 9.5h5"/><circle cx="12" cy="17" r="1.6"/>',
  motherboard: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><rect x="7" y="6.5" width="6" height="6" rx=".5"/><path d="M16 6v7M18 6v7M6.5 16.5h11M6.5 18.5h7"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".5"/><path d="M9 2.5V6M12 2.5V6M15 2.5V6M9 18v3.5M12 18v3.5M15 18v3.5M2.5 9H6M2.5 12H6M2.5 15H6M18 9h3.5M18 12h3.5M18 15h3.5"/>',
  cooler: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="1.7"/><path d="M12 10.3c0-2.6.6-4.6 3-5.3M13.7 12c2.6 0 4.6.6 5.3 3M12 13.7c0 2.6-.6 4.6-3 5.3M10.3 12c-2.6 0-4.6-.6-5.3-3"/>',
  ram: '<rect x="2.5" y="6.5" width="19" height="9" rx="1"/><path d="M6 9.5h2.5v3H6zM10.75 9.5h2.5v3h-2.5zM15.5 9.5H18v3h-2.5zM4.5 15.5v3M7.5 15.5v3M10.5 15.5v3M14.5 15.5v3M17.5 15.5v3"/>',
  gpu: '<path d="M2.5 5.5v14"/><rect x="4.5" y="6.5" width="17" height="10" rx="1.5"/><circle cx="9.5" cy="11.5" r="2.8"/><circle cx="16.5" cy="11.5" r="2.8"/><path d="M7 16.5v3h8v-3"/>',
  storage: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><circle cx="12" cy="10" r="4.3"/><circle cx="12" cy="10" r=".8"/><path d="M8 17.5h5M16 17.5h.5"/>',
  psu: '<rect x="2.5" y="5" width="19" height="14" rx="1.5"/><circle cx="9.5" cy="12" r="4.3"/><path d="M9.5 7.7v8.6M5.2 12h8.6M18.3 8.5l-1.8 3.2h2.2l-1.8 3.3"/>',
};

const sym = (id, body) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`;

export const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${
  Object.entries(UI).filter(([, b]) => b).map(([k, b]) => sym(k, b)).join('')
}${Object.entries(CAT_ICONS).map(([k, b]) => sym(`cat-${k}`, b)).join('')}</svg>`;

export const icon = (id, cls = '') => `<svg class="ic${cls ? ` ${cls}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;

/** The brand mark: a PC tower with its lid lifting off. Body uses currentColor, the lid the accent. */
export const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M5 12 16 18.2V31L5 24.8z" fill="currentColor"/><path d="M27 12 16 18.2V31l11-6.2z" fill="currentColor" fill-opacity=".6"/><path d="M16 1 27 7.2 16 13.4 5 7.2z" class="mark-lid"/><path d="M5 7.2 16 13.4v2.4L5 9.6z" class="mark-lid-l"/><path d="M27 7.2 16 13.4v2.4l11-6.2z" class="mark-lid-r"/></svg>`;

/** Google's "G", in its own colours, as Google's sign-in branding guidelines ask. */
export const GOOGLE_G = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
