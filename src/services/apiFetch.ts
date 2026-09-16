let token: string | null = null;
let pending: Promise<string> | null = null;
export function installApiFetch() {
  const native = window.fetch.bind(window);
  const getToken = () => {
    if (token) return Promise.resolve(token);
    if (!pending) pending = native('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
      .then(async res => { if (!res.ok) throw new Error('Cannot initialise secure session.'); return res.json(); })
      .then(data => { token = data.csrfToken; return token!; }).finally(() => { pending = null; });
    return pending;
  };
  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
    const method = (init?.method || request?.method || 'GET').toUpperCase();
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return native(input, init);
    const options = { ...init, credentials: 'same-origin' as RequestCredentials };
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (write) {
      options.headers = new Headers(init?.headers || request?.headers);
      options.headers.set('x-csrf-token', await getToken());
    }
    const response = await native(input, options);
    if (url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/auth/csrf') token = null;
    // A rejected CSRF request did not execute its action. Clear state, but leave retry to the user:
    // arbitrary uploads/Request streams must never be automatically replayed.
    if (response.status === 403) token = null;
    return response;
  };
}
