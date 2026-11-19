// Tiny HTML helpers for the server-rendered pages. Everything interpolated goes through esc().

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** USD with no decimals, the way the catalog stores estimates. */
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const usd = (v) => (v == null ? '—' : usdFmt.format(Math.round(v)));

/** JSON for a <script type="application/ld+json"> block, safe against </script> injection. */
export const jsonForScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export const monthName = (ym) => {
  const [y, mo] = String(ym).split('-').map(Number);
  return new Date(Date.UTC(y, (mo || 1) - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** The first candidate that fits in max characters (search results cut titles at about 60). */
export const fit = (candidates, max) => candidates.find((c) => c && c.length <= max) ?? candidates.at(-1);

/** Joins sentences in order, leaving out any that would take the text past max (meta descriptions: about 160). */
export const fitSentences = (sentences, max = 160) => sentences.reduce((acc, s) => {
  if (!s) return acc;
  if (!acc) return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  return acc.length + 1 + s.length <= max ? `${acc} ${s}` : acc;
}, '');
