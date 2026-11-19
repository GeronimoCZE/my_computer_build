// The signed-in account, from the browser's side. Builds live on the server only while signed in.
let mePromise = null;

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const account = {
  /** { user: { name, picture } | null, signIn: boolean } */
  me() {
    mePromise ||= call('GET', '/api/me').catch(() => ({ user: null, signIn: false }));
    return mePromise;
  },
  signInUrl(next = location.pathname + location.search) {
    return `/auth/google?next=${encodeURIComponent(next)}`;
  },
  async signOut() { await call('POST', '/auth/logout'); mePromise = null; },
  async deleteData() { await call('DELETE', '/api/me'); mePromise = null; },
  listBuilds: () => call('GET', '/api/builds').then((d) => d.builds),
  saveBuild: (b) => call('PUT', `/api/builds/${encodeURIComponent(b.id)}`, b).then((d) => d.build),
  deleteBuild: (id) => call('DELETE', `/api/builds/${encodeURIComponent(id)}`),
  importBuilds: (builds) => call('POST', '/api/builds/import', { builds }),
};
