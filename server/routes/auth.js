import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import passport, { findOrCreateOAuthUser } from '../passport.js';
import { saveGoogleTokens } from '../googleTokens.js';
import { pool } from '../db.js';
import { projectsDb } from '../projectsDb.js';
import { sendPasswordResetEmail } from '../mailer.js';
import { getFrontendUrl } from '../utils/urlHelper.js';
import crypto from 'crypto';

const router = Router();
const AVAILABLE_OAUTH_PROVIDERS = [];
const RESET_TOKEN_TTL_MS = 45 * 60 * 1000; // 45 minutes

// Tight limiter: forgot-password is a target for enumeration/spam, so it gets
// its own stricter budget on top of the shared authLimiter mounted in server.ts.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// FIX: Add password validation function — strict version for register/reset
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&*).';
  }
  return null;
}

// Lenient check for login — only ensure something was provided with min length.
// Prevents lock-out for accounts registered before the strict rules were added.
function validatePasswordForLogin(password) {
  if (!password || password.length < 1) {
    return 'Password is required.';
  }
  return null;
}

// FIX: Sanitize display names
function sanitizeDisplayName(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 100) return trimmed.substring(0, 100);
  return trimmed;
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  AVAILABLE_OAUTH_PROVIDERS.push('google');
}
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  AVAILABLE_OAUTH_PROVIDERS.push('facebook');
}
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID) {
  AVAILABLE_OAUTH_PROVIDERS.push('apple');
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
  };
}

function signSessionId(sid, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(sid)
    .digest('base64')
    .replace(/\=+$/, '');
  return 's:' + sid + '.' + signature;
}

// --- Session status -------------------------------------------------------
router.get('/me', (req, res) => {
  const user = sanitizeUser(req.user);
  const sessionSecret = process.env.SESSION_SECRET || 'fallback-secret-key-12345';
  const token = req.user && req.sessionID ? signSessionId(req.sessionID, sessionSecret) : null;
  res.json({ user, token });
});

router.get('/session-state', (req, res) => {
  const user = sanitizeUser(req.user);
  const sessionSecret = process.env.SESSION_SECRET || 'fallback-secret-key-12345';
  const token = req.user && req.sessionID ? signSessionId(req.sessionID, sessionSecret) : null;
  res.json({ authenticated: !!req.user, user, token });
});

router.get('/providers', (_req, res) => {
  res.json({ providers: AVAILABLE_OAUTH_PROVIDERS });
});

function ensureOAuthProvider(req, res, next, provider) {
  if (!AVAILABLE_OAUTH_PROVIDERS.includes(provider)) {
    return res.status(503).json({ error: `${provider} authentication is not configured.` });
  }
  return next();
}

// --- Email + password ------------------------------------------------------
router.post('/register', async (req, res) => {
  const { email, username, password } = req.body || {};
  
  // FIX: Add password strength validation
  const passwordError = validatePasswordStrength(password);
  if (!email || passwordError) {
    return res.status(400).json({ error: passwordError || 'Email is required.' });
  }

  try {
    // FIX: Ensure case-insensitive email uniqueness
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'An account with that email already exists. Try signing in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // FIX: Sanitize display name
    const sanitizedUsername = sanitizeDisplayName(username);
    const displayName = sanitizedUsername || email.split('@')[0];
    
    const inserted = await pool.query(
      `INSERT INTO users (email, username, password_hash, display_name, last_login_at)
       VALUES (LOWER($1), $2, $3, $4, now()) RETURNING *`,
      [email, sanitizedUsername, passwordHash, displayName]
    );

    req.login(inserted.rows[0], async (err) => {
      if (err) return res.status(500).json({ error: 'Account created, but failed to start a session. Please log in.' });

      // Honor any project invites that were sent to this email before the account existed.
      try {
        const pendingInvites = await projectsDb.getPendingInvitesForEmail(email);
        for (const invite of pendingInvites) {
          await projectsDb.addMember(invite.projectId, inserted.rows[0].id, invite.role);
          await projectsDb.markInviteAccepted(invite.id);
        }
      } catch (inviteErr) {
        console.error('Failed to auto-accept pending invites on register:', inviteErr);
      }

      const sessionSecret = process.env.SESSION_SECRET || 'fallback-secret-key-12345';
      const token = signSessionId(req.sessionID, sessionSecret);
      res.status(201).json({ 
        user: sanitizeUser(inserted.rows[0]),
        token
      });
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That email or username is already taken.' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const loginPasswordError = validatePasswordForLogin(password);
  if (!email || loginPasswordError) {
    return res.status(400).json({ error: loginPasswordError || 'Email and password are required.' });
  }

  try {
    // FIX: Use case-insensitive email lookup
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    const user = rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to start a session.' });
      const sessionSecret = process.env.SESSION_SECRET || 'fallback-secret-key-12345';
      const token = signSessionId(req.sessionID, sessionSecret);
      res.json({ 
        user: sanitizeUser(user),
        token
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// --- Forgot / reset password ------------------------------------------------
// Always returns the same generic response whether or not the email exists,
// so this endpoint can't be used to enumerate registered accounts.
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body || {};
  const genericResponse = { message: 'If an account exists for that email, a password reset link has been sent.' };

  if (!email || typeof email !== 'string') {
    return res.json(genericResponse);
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    const user = rows[0];

    // Only issue a token for accounts that actually have a password set
    // (pure-OAuth accounts have no password_hash to reset).
    if (user && user.password_hash) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

      // Invalidate any earlier outstanding tokens for this user first, so
      // only the most recently requested link can ever be used.
      await pool.query(
        'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );
      await pool.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id',
        [user.id, tokenHash, expiresAt]
      );

      const baseUrl = getFrontendUrl(req);
      const resetLink = `${baseUrl}/reset-password?token=${rawToken}`;
      await sendPasswordResetEmail({ toEmail: user.email, resetLink });
    }

    res.json(genericResponse);
  } catch (err) {
    console.error('Forgot-password error:', err);
    // Still return the generic response — never leak server errors here either.
    res.json(genericResponse);
  }
});

router.post('/reset-password', forgotPasswordLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Reset token is required.' });
  }
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  try {
    const tokenHash = hashResetToken(token);
    const { rows } = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token_hash = $1',
      [tokenHash]
    );
    const resetRow = rows[0];

    const isExpired = !resetRow || new Date(resetRow.expires_at).getTime() < Date.now();
    if (!resetRow || resetRow.used_at || isExpired) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetRow.user_id]);

    // Single-use: mark this token (and any other outstanding ones for the
    // account) used so the link can't be replayed.
    await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [resetRow.id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [resetRow.user_id]);

    res.json({ ok: true, message: 'Your password has been reset. You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset-password error:', err);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout passport error:', err);
      return res.status(500).json({ error: 'Logout failed.' });
    }
    // FIX: Use async/await-compatible destroy with proper error handling
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error('Session destroy error:', destroyErr);
        // Still clear cookie and return success even if destroy fails
      }
      const host = req.headers.host || '';
      const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
      const xfp = req.headers['x-forwarded-proto'];
      const isCloudSandbox = !!(process.env.K_SERVICE || process.env.APP_URL);
      const isSecure = req.secure ||
        isCloudSandbox ||
        (typeof xfp === 'string' && xfp.split(',').map(s => s.trim().toLowerCase()).includes('https'));

      res.clearCookie('ffpro.sid', { 
        path: '/', 
        httpOnly: true, 
        secure: isSecure, 
        sameSite: isSecure ? 'none' : 'lax' 
      });
      res.json({ ok: true });
    });
  });
});

// --- Google ----------------------------------------------------------------
// Requests Gmail read-only access alongside basic profile/email up front, and
// accessType: 'offline' + prompt: 'consent' so Google issues a refresh token
// we can use server-side (see server/googleTokens.js) — this is what lets a
// single "Continue with Google" also power Gmail Planning Notifications on
// the dashboard, with no separate connect step.
router.get('/google', (req, res, next) => ensureOAuthProvider(req, res, next, 'google'), passport.authenticate('google', {
  scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify'],
  accessType: 'offline',
  prompt: 'consent',
}));
router.get(
  '/google/callback',
  (req, res, next) => ensureOAuthProvider(req, res, next, 'google'),
  (req, res, next) => {
    const baseUrl = getFrontendUrl(req);
    passport.authenticate('google', { failureRedirect: `${baseUrl}/?auth=failed` })(req, res, next);
  },
  (req, res) => res.redirect(`${getFrontendUrl(req)}/?auth=success`)
);

// --- Facebook ----------------------------------------------------------------
router.get('/facebook', (req, res, next) => ensureOAuthProvider(req, res, next, 'facebook'), passport.authenticate('facebook', { scope: ['email'] }));
router.get(
  '/facebook/callback',
  (req, res, next) => ensureOAuthProvider(req, res, next, 'facebook'),
  (req, res, next) => {
    const baseUrl = getFrontendUrl(req);
    passport.authenticate('facebook', { failureRedirect: `${baseUrl}/?auth=failed` })(req, res, next);
  },
  (req, res) => res.redirect(`${getFrontendUrl(req)}/?auth=success`)
);

// --- Apple ----------------------------------------------------------------
// Apple's callback arrives as a POST (form_post response mode), not a GET.
router.get('/apple', (req, res, next) => ensureOAuthProvider(req, res, next, 'apple'), passport.authenticate('apple'));
router.post(
  '/apple/callback',
  (req, res, next) => ensureOAuthProvider(req, res, next, 'apple'),
  (req, res, next) => {
    const baseUrl = getFrontendUrl(req);
    passport.authenticate('apple', { failureRedirect: `${baseUrl}/?auth=failed` })(req, res, next);
  },
  (req, res) => res.redirect(`${getFrontendUrl(req)}/?auth=success`)
);

export default router;
