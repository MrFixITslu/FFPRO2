export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

const BASE = '/api/auth';

async function handle(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

export const authService = {
  /** Returns the currently logged-in user (from the session cookie), or null. */
  async me(): Promise<AuthUser | null> {
    const res = await fetch(`${BASE}/me`, { 
      credentials: 'include', 
      headers: { Accept: 'application/json' } 
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({ user: null }));
    return data.user || null;
  },

  async sessionState(): Promise<{ authenticated: boolean; user: AuthUser | null }> {
    const res = await fetch(`${BASE}/session-state`, { 
      credentials: 'include', 
      headers: { Accept: 'application/json' } 
    });
    if (!res.ok) return { authenticated: false, user: null };
    const data = await res.json().catch(() => ({ authenticated: false, user: null }));
    return { authenticated: !!data.authenticated, user: data.user || null };
  },

  async providers(): Promise<string[]> {
    const res = await fetch(`${BASE}/providers`, { 
      credentials: 'include', 
      headers: { Accept: 'application/json' } 
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({ providers: [] }));
    return Array.isArray(data.providers) ? data.providers : [];
  },

  async login(email: string, password: string): Promise<AuthUser> {
    const res = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await handle(res);
    return data.user;
  },

  async register(email: string, username: string, password: string): Promise<AuthUser> {
    const res = await fetch(`${BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, username, password }),
    });
    const data = await handle(res);
    return data.user;
  },

  async logout(): Promise<void> {
    await fetch(`${BASE}/logout`, { 
      method: 'POST', 
      credentials: 'include'
    });
  },

  async loginWithGoogleToken(payload: {
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    googleId?: string;
    accessToken?: string | null;
    refreshToken?: string | null;
  }): Promise<AuthUser> {
    const res = await fetch(`${BASE}/google-token-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await handle(res);
    return data.user;
  },

  /** Full-page redirect URL for a given OAuth provider. Use as a plain <a href>. */
  oauthUrl(provider: 'google' | 'facebook' | 'apple'): string {
    return `${BASE}/${provider}`;
  },

  /** Always resolves with a generic message — never reveals whether the email exists. */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const res = await fetch(`${BASE}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });
    return handle(res);
  },

  /** Completes a password reset using the token from the emailed reset link. */
  async resetPassword(token: string, password: string): Promise<{ ok: true; message: string }> {
    const res = await fetch(`${BASE}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, password }),
    });
    return handle(res);
  },
};
