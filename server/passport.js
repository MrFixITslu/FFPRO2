import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { pool } from './db.js';
import { getUser, verifyUser } from './securityStore.js';
import { saveGoogleTokens } from './googleTokens.js';

passport.serializeUser((user, done) => done(null, { id: user.id, version: user.session_version || 0 }));
passport.deserializeUser(async (identity, done) => {
  try {
    if (!identity || typeof identity !== 'object') return done(null, false);
    const user = await getUser(identity.id);
    done(null, user && (user.session_version || 0) === identity.version ? user : false);
  } catch (err) { done(err); }
});

/**
 * Finds an existing user for a given OAuth identity, links the identity to an
 * existing account with the same verified email, or creates a brand new user.
 */
export async function findOrCreateOAuthUser({ provider, providerId, email, emailVerified = false, currentUserId, displayName, avatarUrl }) {
  if (!providerId) throw new Error('Provider identity is missing.');
  const linked = await pool.query(
    `SELECT u.* FROM oauth_accounts oa
     JOIN users u ON u.id = oa.user_id
     WHERE oa.provider = $1 AND oa.provider_user_id = $2`,
    [provider, providerId]
  );
  if (linked.rows[0]) {
    if (currentUserId && currentUserId !== linked.rows[0].id) throw new Error('This Google identity belongs to a different account. Sign out first.');
    if (emailVerified) await verifyUser(linked.rows[0].id);
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [linked.rows[0].id]);
    return linked.rows[0];
  }

  let user = null;
  if (email) {
    const byEmail = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.toLowerCase()]);
    user = byEmail.rows[0] || null;
    if (user && (!emailVerified || currentUserId !== user.id)) {
      throw new Error('Sign in with your existing password before linking this provider. Use password reset if needed.');
    }
  }

  if (!user) {
    const inserted = await pool.query(
      `INSERT INTO users (email, display_name, avatar_url, last_login_at)
       VALUES ($1, $2, $3, now()) RETURNING *`,
      [
        (email || `${provider}_${providerId}@no-email.ffpro.local`).toLowerCase(),
        displayName || null,
        avatarUrl || null,
      ]
    );
    user = inserted.rows[0];
  } else {
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  }

  await pool.query(
    `INSERT INTO oauth_accounts (user_id, provider, provider_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_user_id) DO NOTHING`,
    [user.id, provider, providerId]
  );

  if (emailVerified) await verifyUser(user.id);
  return await getUser(user.id);
}

// --- Google -------------------------------------------------------------
// Only registered if credentials are present, so the server still boots
// (with that button effectively disabled) if a provider hasn't been set up yet.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
        state: true, pkce: true, passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateOAuthUser({
            provider: 'google',
            currentUserId: req.user?.id,
            emailVerified: profile._json?.email_verified === true || profile._json?.verified_email === true,
            providerId: profile.id,
            email: profile.emails?.[0]?.value,
            displayName: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
          });
          // Captures the Gmail-scoped grant (see the extra scope + accessType
          // requested in routes/auth.js) so features like Gmail Planning
          // Notifications can use this server-held token instead of asking
          // for a second, separate consent on the dashboard. Google access
          // tokens are always ~1hr, so getValidGoogleAccessToken's default
          // expiry estimate is used rather than a params field this library
          // doesn't reliably expose.
          await saveGoogleTokens(user.id, { accessToken, refreshToken });
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
} else {
  console.warn('[auth] Google OAuth not configured — GOOGLE_CLIENT_ID/SECRET missing.');
}

export default passport;
