// Privacy policy, cookie policy and terms of service. Operator details come from .env
// (OPERATOR_NAME, OPERATOR_COUNTRY, CONTACT_EMAIL, CREATOR_URL) so nothing personal is hard-coded.
import { esc } from './html.js';
import { renderPage, breadcrumbs } from './layout.js';

export const LEGAL_UPDATED = '2026-11-15';
const updated = new Date(`${LEGAL_UPDATED}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function contact(site) {
  if (site.contactEmail) return `email <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a>`;
  if (site.creator.url) return `use the contact details on <a href="${esc(site.creator.url)}">${esc(site.creator.name || site.creator.url)}</a>`;
  return 'use the contact details on the <a href="/about#contact">About page</a>';
}
const operator = (site) => (site.operator ? esc(site.operator) : 'the operator of this website');

function legalPage(ctx, { path, name, title, description, toc, html }) {
  const crumbs = breadcrumbs(ctx, [{ name, path }]);
  const body = `
<section class="page-head">
  <div class="wrap narrow">
    ${crumbs.html}
    <h1>${esc(title)}</h1>
    <p class="meta">Last updated ${updated}</p>
  </div>
</section>
<section class="section tight">
  <div class="wrap legal-grid">
    <nav class="toc" aria-label="On this page"><p class="eyebrow">On this page</p>${toc.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</nav>
    <div class="prose">${html}</div>
  </div>
</section>`;
  return renderPage(ctx, { title, description, jsonLd: [crumbs.ld], bodyClass: 'page-legal', body });
}

export function privacyPage(ctx) {
  const { site } = ctx;
  const toc = [['summary', 'Summary'], ['who', 'Who is responsible'], ['without-account', 'Using the site without an account'], ['google', 'Signing in with Google'], ['logs', 'Server logs and rate limits'], ['third-parties', 'Other services'], ['retention', 'How long data is kept'], ['rights', 'Your rights'], ['changes', 'Changes']];
  const html = `
<h2 id="summary">Summary</h2>
<ul>
  <li>You can use the whole builder without an account. Your builds then stay in your own browser and never reach the server.</li>
  <li>There is no analytics, no advertising and no tracking of any kind.</li>
  <li>If you sign in with Google, we receive your Google account ID, first name and profile picture, and store the builds you save so they follow you to other devices. We don’t receive your email address.</li>
  <li>You can delete everything stored about you at any time from the account menu.</li>
</ul>

<h2 id="who">Who is responsible</h2>
<p>This website is run by ${operator(site)}${site.country ? `, based in ${esc(site.country)}` : ''}, who is the data controller under the EU General Data Protection Regulation (GDPR). For anything about your data, ${contact(site)}.</p>

<h2 id="without-account">Using the site without an account</h2>
<p>The builder runs in your browser. Your current build, saved builds, settings (currency, resolution, colour theme) and ticked-off shopping list items are kept in your browser’s local storage. They are not sent to us. Clearing your browser’s site data removes them. Share links carry the build in the part of the address after the “#”, which browsers don’t send to the server.</p>
<p>When the builder calculates compatibility, prices, power or FPS, it does so in your browser. The server only sends the parts catalog and the pages.</p>

<h2 id="google">Signing in with Google</h2>
<p>Signing in is optional and uses Google’s standard “Sign in with Google” (OpenID Connect). We ask Google only for your basic profile. In return we receive:</p>
<ul>
  <li><b>Your Google account ID</b>, a number Google uses for your account. We store only a one-way hash of it, which can’t be turned back into the ID.</li>
  <li><b>Your first name and profile picture address</b>, shown in the account menu.</li>
</ul>
<p>These are kept in a signed cookie in your browser (see the <a href="/cookies">cookie policy</a>). On the server we store the builds you save while signed in: their names, the parts, and a short summary (totals and the main parts), filed under the hashed ID.</p>
<p>The legal basis is performance of a contract (GDPR Art. 6(1)(b)): you ask us to keep your builds, and we can’t without knowing which account they belong to. Your profile picture loads from Google’s servers, so Google sees that request as it does on any site showing your Google picture. Google’s handling of your data is covered by <a href="https://policies.google.com/privacy" rel="noopener">Google’s privacy policy</a>.</p>
<p>When you first sign in, builds saved in that browser are moved to your account so you don’t lose them.</p>

<h2 id="logs">Server logs and rate limits</h2>
<p>To protect the site from abuse, the server counts requests per visitor for a few minutes at a time. It uses your IP address (or, when you’re signed in, your hashed account ID) for this, keeps the counts in memory only and forgets them within minutes. The legal basis is our legitimate interest in keeping the service available (Art. 6(1)(f)). The server doesn’t write your IP address to its logs. Our hosting provider or reverse proxy may keep standard connection logs for security, normally for no longer than 14 days.</p>

<h2 id="third-parties">Other services</h2>
<ul>
  <li><b>Google</b> provides sign-in, as described above, only if you use it.</li>
  <li><b>eBay and Best Buy</b>: the shopping list and some prices link to their sites. Nothing is sent to them until you click a link, and then their own privacy policies apply.${site.url ? '' : ''}</li>
  <li><b>Fonts and code</b> are served from this website. Nothing loads from a third-party content network.</li>
</ul>
<p>We don’t sell, rent or share your data with anyone else, and we don’t use it for advertising.</p>

<h2 id="retention">How long data is kept</h2>
<ul>
  <li>Builds saved to your account: until you delete them, or delete your saved data from the account menu. Accounts with no sign-in for 24 months may be removed.</li>
  <li>The sign-in cookie: 30 days, or until you sign out.</li>
  <li>Rate-limit counters: a few minutes, in memory.</li>
  <li>Data in your browser: until you clear it.</li>
</ul>

<h2 id="rights">Your rights</h2>
<p>Under the GDPR you can ask to see the data we hold about you, have it corrected or deleted, receive a copy in a portable format, restrict or object to its processing, and withdraw consent where processing relies on it. The quickest way to delete everything is <b>Delete my saved data</b> in the account menu, which removes your builds from the server and signs you out. For anything else, ${contact(site)}. You can also complain to your data protection authority${/czech/i.test(site.country || '') ? ', in the Czech Republic the Office for Personal Data Protection (<a href="https://uoou.gov.cz" rel="noopener">ÚOOÚ</a>)' : ''}.</p>
<p>The site is not meant for children under 16, and we don’t knowingly store data about them.</p>

<h2 id="changes">Changes</h2>
<p>If this policy changes, the new version will be posted here with a new date. If a change affects how your saved builds are used, signed-in users will see a notice on the site first.</p>`;
  return legalPage(ctx, { path: '/privacy', name: 'Privacy', title: 'Privacy policy', description: 'How My Computer Build handles your data: no tracking or analytics, builds kept in your browser, and what is stored if you sign in with Google.', toc, html });
}

export function cookiesPage(ctx) {
  const { site } = ctx;
  const toc = [['summary', 'Summary'], ['cookies', 'Cookies'], ['storage', 'Browser storage'], ['third-party', 'Third-party cookies'], ['control', 'Managing them']];
  const html = `
<h2 id="summary">Summary</h2>
<p>My Computer Build uses no tracking, analytics or advertising cookies. It sets two cookies, and only when you sign in with Google. It also keeps your builds and settings in your browser’s local storage so the builder remembers them. All of this is strictly necessary for features you ask for, which is why the site doesn’t show a cookie banner.</p>

<h2 id="cookies">Cookies</h2>
<div class="table-wrap"><table class="data">
  <thead><tr><th scope="col">Name</th><th scope="col">What it does</th><th scope="col">Set when</th><th scope="col">Lasts</th></tr></thead>
  <tbody>
    <tr><th scope="row"><code>mcb_session</code></th><td>Keeps you signed in. Holds your hashed account ID, first name and profile picture address, signed so it can’t be altered.</td><td>You sign in with Google</td><td>30 days, or until you sign out</td></tr>
    <tr><th scope="row"><code>mcb_oauth</code></th><td>Protects the sign-in from forgery while you’re on Google’s sign-in page, then is deleted.</td><td>You press Sign in</td><td>10 minutes at most</td></tr>
  </tbody>
</table></div>
<p>Both are first-party, <code>HttpOnly</code> (page scripts can’t read them) and <code>SameSite=Lax</code>, and are sent only over HTTPS on the live site.</p>

<h2 id="storage">Browser storage</h2>
<p>These entries live in your browser’s local storage. They never leave your device unless you sign in and save a build to your account.</p>
<div class="table-wrap"><table class="data">
  <thead><tr><th scope="col">Key</th><th scope="col">What it holds</th></tr></thead>
  <tbody>
    <tr><th scope="row"><code>mcb.current.v1</code></th><td>The build you’re working on, so it’s still there when you come back</td></tr>
    <tr><th scope="row"><code>mcb.builds.v1</code></th><td>Builds you saved while signed out</td></tr>
    <tr><th scope="row"><code>mcb.prefs.v1</code></th><td>Currency, resolution and shopping list settings</td></tr>
    <tr><th scope="row"><code>mcb.shop.v1</code></th><td>Shopping list items you ticked off</td></tr>
    <tr><th scope="row"><code>mcb.theme</code></th><td>Light or dark mode, if you chose one</td></tr>
  </tbody>
</table></div>

<h2 id="third-party">Third-party cookies</h2>
<p>This site doesn’t load anything from other companies, so they can’t set cookies through it. When you sign in, you visit Google’s own sign-in page, where Google’s cookies and <a href="https://policies.google.com/technologies/cookies" rel="noopener">cookie policy</a> apply. Links to eBay or Best Buy open their sites, under their policies.</p>

<h2 id="control">Managing them</h2>
<p>Signing out deletes the sign-in cookie. Clearing this site’s data in your browser settings removes the cookies and everything in local storage, including builds saved while signed out, so save or share anything you want to keep first. Blocking cookies doesn’t stop the builder working; you just can’t sign in.</p>
<p>Questions? See the <a href="/privacy">privacy policy</a>${site.contactEmail ? ` or email <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a>` : ''}.</p>`;
  return legalPage(ctx, { path: '/cookies', name: 'Cookies', title: 'Cookie policy', description: 'My Computer Build uses no tracking or advertising cookies. Here are the two sign-in cookies and the browser storage the builder uses.', toc, html });
}

export function termsPage(ctx) {
  const { site } = ctx;
  const toc = [['agreement', 'Agreement'], ['service', 'The service'], ['estimates', 'Estimates, not advice'], ['accounts', 'Accounts'], ['use', 'Acceptable use'], ['content', 'Content and trademarks'], ['links', 'Links to shops'], ['liability', 'Liability'], ['changes', 'Changes and ending'], ['law', 'Governing law'], ['contact', 'Contact']];
  const html = `
<h2 id="agreement">Agreement</h2>
<p>These terms apply when you use My Computer Build (“the site”), run by ${operator(site)}. By using the site you agree to them. If you don’t agree, please don’t use it.</p>

<h2 id="service">The service</h2>
<p>The site is a free tool for planning a PC: a 3D builder, a parts catalog, compatibility checks and estimates of price, power and game performance. It is provided as it is, free of charge. We may change, add or remove features, parts or data at any time, and the site may sometimes be unavailable.</p>

<h2 id="estimates">Estimates, not advice</h2>
<p>Prices, power figures, frame rates and compatibility results are estimates made from published specifications and models. They can be wrong or out of date. Prices are not offers to sell, and actual prices, stock and shipping vary. <b>Before you buy, check the parts against their makers’ specifications, the motherboard’s CPU and memory support lists and the case’s clearances.</b> We aren’t responsible for purchases you make based on the site.</p>

<h2 id="accounts">Accounts</h2>
<p>You can use the site without an account. If you sign in with Google, you’re responsible for activity under your account. You can delete your saved data at any time from the account menu. We may remove accounts or saved builds that break these terms.</p>

<h2 id="use">Acceptable use</h2>
<p>Please don’t:</p>
<ul>
  <li>overload the site, get around its rate limits, or copy the catalog in bulk with automated tools (the public API is fine within its limits);</li>
  <li>try to access other people’s data, probe for weaknesses without permission, or interfere with the site’s security;</li>
  <li>use the site to break the law, or save builds with names that are unlawful or abusive.</li>
</ul>
<p>Requests over the rate limits get an HTTP 429 response. Found a security problem? Please tell us privately first: ${contact(site)}.</p>

<h2 id="content">Content and trademarks</h2>
<p>The site’s design, code, text and compiled data belong to its operator. You may share links, screenshots and your own builds freely. Product and brand names belong to their owners and are used only to identify parts; the site isn’t affiliated with or endorsed by any manufacturer, retailer, Google, eBay or Best Buy.</p>

<h2 id="links">Links to shops</h2>
<p>The shopping list and price notes link to eBay, Best Buy and other sites. We don’t control those sites and aren’t a party to anything you buy there. Their terms and policies apply.</p>

<h2 id="liability">Liability</h2>
<p>As far as the law allows, the site is provided without warranties, and the operator isn’t liable for indirect or consequential loss, lost profits or data, or for decisions made using the estimates. Nothing in these terms limits liability that can’t be limited by law, such as for intent or gross negligence, or your statutory rights as a consumer.</p>

<h2 id="changes">Changes and ending</h2>
<p>We may update these terms; the date at the top shows the latest version, and continuing to use the site means you accept it. You can stop using the site at any time.</p>

<h2 id="law">Governing law</h2>
<p>These terms are governed by the laws of ${esc(site.country || 'the operator’s country')}. If you are a consumer in the EU, you also keep the protection of the mandatory laws of the country where you live, and you can bring a claim there.</p>

<h2 id="contact">Contact</h2>
<p>For questions about these terms, ${contact(site)}.</p>`;
  return legalPage(ctx, { path: '/terms', name: 'Terms', title: 'Terms of service', description: 'The terms for using My Computer Build: a free PC planning tool whose prices, compatibility results and FPS figures are estimates to check before you buy.', toc, html });
}
