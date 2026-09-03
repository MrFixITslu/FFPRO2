import { pool } from './db.js';
import { encryptForUser, decryptForUser } from './crypto.js';

// Refresh a bit early so a request never races an access token that's about
// to expire mid-flight.
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;

/**
 * Encrypts and stores a Google access/refresh token pair for a user, captured
 * once at login time (see server/passport.js). `expiryDate` is a Date (or
 * epoch ms) for when the access token itself expires — refresh tokens don't
 * expire on a fixed schedule, so we only track the access token's expiry.
 *
 * Google only sends a refresh_token on the FIRST consent (or when
 * prompt=consent forces re-consent) — later logins may call this with
 * refreshToken undefined, in which case we keep whatever was already stored
 * rather than overwriting it with nothing.
 */
export async function saveGoogleTokens(userId, { accessToken, refreshToken, expiryDate }) {
  if (!accessToken) return;
  let effectiveRefreshToken = refreshToken;
  if (!effectiveRefreshToken) {
    const existing = await loadStoredTokens(userId);
    effectiveRefreshToken = existing?.refreshToken || null;
  }

  const { ciphertext, iv, authTag } = encryptForUser(userId, { accessToken, refreshToken: effectiveRefreshToken || null });
  const expiry = expiryDate ? new Date(expiryDate) : new Date(Date.now() + 55 * 60 * 1000);
  await pool.query(
    `UPDATE users SET google_gmail_ciphertext = $1, google_gmail_iv = $2, google_gmail_auth_tag = $3, google_gmail_token_expiry = $4 WHERE id = $5`,
    [ciphertext, iv, authTag, expiry.toISOString(), userId]
  );
}

async function loadStoredTokens(userId) {
  const { rows } = await pool.query(
    `SELECT google_gmail_ciphertext, google_gmail_iv, google_gmail_auth_tag, google_gmail_token_expiry FROM users WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row || !row.google_gmail_ciphertext) return null;
  try {
    const { accessToken, refreshToken } = decryptForUser(userId, {
      ciphertext: row.google_gmail_ciphertext,
      iv: row.google_gmail_iv,
      authTag: row.google_gmail_auth_tag,
    });
    return { accessToken, refreshToken, expiry: row.google_gmail_token_expiry ? new Date(row.google_gmail_token_expiry) : null };
  } catch (err) {
    console.warn('[google-tokens] Failed to decrypt stored Google tokens:', err?.message);
    return null;
  }
}

/**
 * Returns a currently-valid Google access token for the user, transparently
 * refreshing it against Google if it's expired (or close to it). Returns
 * null if the user has never granted Gmail access, or if the refresh token
 * has since been revoked — callers should treat that the same as "not
 * connected" and prompt the user to log in with Google again.
 */
export async function getValidGoogleAccessToken(userId) {
  const stored = await loadStoredTokens(userId);
  if (!stored) return null;

  const isFresh = stored.expiry && stored.expiry.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now();
  if (isFresh && stored.accessToken) return stored.accessToken;

  if (!stored.refreshToken) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: stored.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      console.warn('[google-tokens] Refresh failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    if (!data.access_token) return null;

    const expiryDate = new Date(Date.now() + (data.expires_in || 3300) * 1000);
    await saveGoogleTokens(userId, {
      accessToken: data.access_token,
      refreshToken: stored.refreshToken, // Google usually doesn't re-issue this
      expiryDate,
    });
    return data.access_token;
  } catch (err) {
    console.warn('[google-tokens] Refresh request failed:', err?.message);
    return null;
  }
}
