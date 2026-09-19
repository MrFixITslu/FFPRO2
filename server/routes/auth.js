import { Router } from '../http.js';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import passport from '../passport.js';
import { createVerification, consumeVerification, resetPassword } from '../securityStore.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { pool } from '../db.js';
import { projectsDb } from '../projectsDb.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../mailer.js';
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
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password must be at least 8 characters and at most 72 UTF-8 bytes.';
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
  if (typeof password !== 'string' || password.length < 1 || Buffer.byteLength(password, 'utf8') > 72) {
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
if (false) {
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
    emailVerified: !!user.email_verified_at,
  };
}

// --- Session status -------------------------------------------------------
router.get('/me', (req, res) => {
  const user = sanitizeUser(req.user);
  res.json({ user });
});

router.get('/session-state', (req, res) => {
  const user = sanitizeUser(req.user);
  res.json({ authenticated: !!req.user, user });
});

router.get('/providers', (_req, res) => {
  res.json({ providers: AVAILABLE_OAUTH_PROVIDERS });
});

function ensureOAuthProvider(req, res, next, provider) {
  if (!AVAILABLE_OAUTH_PROVIDERS.includes(provider)) {
    const baseUrl = getFrontendUrl(req);
    // If browser navigation, redirect cleanly back to frontend with informative state
    const acceptsHtml = req.accepts && (req.accepts('html') || req.headers.accept?.includes('text/html'));
    if (acceptsHtml && !req.headers.accept?.includes('application/json')) {
      return res.redirect(`${baseUrl}/?auth=not_configured&provider=${encodeURIComponent(provider)}`);
    }
    return res.status(503).json({ error: `${provider} authentication is not configured.` });
  }
  return next();
}

// --- Email + password ------------------------------------------------------
router.post('/register', async (req, res) => {
  const { email, username, password } = req.body || {};
  
  // FIX: Add password strength validation
  const passwordError = validatePasswordStrength(password);
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || passwordError) {
    return res.status(400).json({ error: passwordError || 'Valid email address is required.' });
  }

  try {
    // FIX: Ensure case-insensitive email uniqueness
    const existing = await pool.query(
      'SELECT id, email, email_verified_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (existing.rows[0]) {
      const existingUser = existing.rows[0];
      if (existingUser.email_verified_at) {
        return res.status(409).json({ error: 'An account with that email already exists. Try signing in instead.' });
      }
      // If user exists but is not verified, resend verification email
      const verificationToken = await createVerification(existingUser.id);
      const verificationLink = `${getFrontendUrl(req)}/verify-email?token=${verificationToken}`;
      await sendVerificationEmail({ toEmail: email, verificationLink });
      return res.status(200).json({
        requiresVerification: true,
        email,
        message: 'An account with this email is pending verification. A fresh verification email has been sent to confirm your address before granting access to the site.',
      });
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

    const newUser = inserted.rows[0];
    try {
      const verificationToken = await createVerification(newUser.id);
      const verificationLink = `${getFrontendUrl(req)}/verify-email?token=${verificationToken}`;
      await sendVerificationEmail({ toEmail: email, verificationLink });
    } catch (mailErr) {
      console.warn('Verification delivery error during registration:', mailErr);
    }

    // Initialize session for the newly registered user
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regeneration error on register:', regenErr);
        return res.status(500).json({ error: 'Failed to initialize session.' });
      }

      req.login(newUser, (loginErr) => {
        if (loginErr) {
          console.error('Login error on register:', loginErr);
          return res.status(500).json({ error: 'Registration succeeded but session initialization failed.' });
        }
        return res.status(201).json({
          user: sanitizeUser(newUser),
          requiresVerification: true,
          email: newUser.email,
          message: 'Account created! Please check your email to confirm your email address.',
        });
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
  if (typeof email !== 'string' || email.length > 254 || loginPasswordError) {
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

    // Check if email has been verified before granting access to the site
    if (!user.email_verified_at) {
      return res.status(403).json({
        error: 'Please verify your email address to confirm it is legit before accessing the site.',
        code: 'EMAIL_NOT_VERIFIED',
        requiresVerification: true,
        email: user.email,
      });
    }

    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    // Regenerate session to protect against session fixation attacks
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regeneration error on login:', regenErr);
        return res.status(500).json({ error: 'Failed to initialize session.' });
      }

      req.login(user, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to start a session.' });
        res.json({ 
          user: sanitizeUser(user)
        });
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
    const passwordHash = await bcrypt.hash(password, 12);
    if (!(await resetPassword(token, passwordHash))) {
      return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
    }
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
        return res.status(500).json({error:'Logout failed. Please retry.'});
      }
      res.clearCookie('ffpro.sid', { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
      res.json({ ok: true });
    });
  });
});

// --- Google ----------------------------------------------------------------
// Requests Gmail and Google Calendar read-only access alongside basic profile/email up front, and
// accessType: 'offline' + prompt: 'consent' so Google issues a refresh token
// we can use server-side (see server/googleTokens.js) — this is what lets a
// single "Continue with Google" also power Gmail Planning Notifications and
// Google Calendar sync on the dashboard/calendar, with no separate connect step.
router.get('/google', (req, res, next) => ensureOAuthProvider(req, res, next, 'google'), passport.authenticate('google', {
  scope: [
    'profile', 
    'email', 
    'https://www.googleapis.com/auth/gmail.readonly', 
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly'
  ],
  accessType: 'offline',
  prompt: 'consent',
}));
router.get(
  '/google/callback',
  (req, res, next) => ensureOAuthProvider(req, res, next, 'google'),
  (req, res, next) => {
    const baseUrl = getFrontendUrl(req);
    passport.authenticate('google', (err, user, info) => {
      if (err || !user) {
        const errMsg = err?.message || info?.message || 'Google authentication was not completed.';
        console.warn('[auth] Google OAuth error:', errMsg);
        return res.redirect(`${baseUrl}/?auth=failed&provider=google&error=${encodeURIComponent(errMsg)}`);
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('[auth] Google session login error:', loginErr);
          return res.redirect(`${baseUrl}/?auth=failed&provider=google&error=${encodeURIComponent(loginErr.message || 'Session initialization failed')}`);
        }
        req.session.save(saveErr => {
          if (saveErr) return res.redirect(`${baseUrl}/?auth=failed`);
          res.redirect(`${baseUrl}/?auth=success`);
        });
      });
    })(req, res, next);
  }
);

// --- Facebook ----------------------------------------------------------------
router.get('/facebook', (req, res, next) => ensureOAuthProvider(req, res, next, 'facebook'), passport.authenticate('facebook', { scope: ['email'] }));
router.get(
  '/facebook/callback',
  (req, res, next) => ensureOAuthProvider(req, res, next, 'facebook'),
  (req, res, next) => {
    const baseUrl = getFrontendUrl(req);
    passport.authenticate('facebook', (err, user, info) => {
      if (err || !user) {
        const errMsg = err?.message || info?.message || 'Facebook authentication was not completed.';
        console.warn('[auth] Facebook OAuth error:', errMsg);
        return res.redirect(`${baseUrl}/?auth=failed&provider=facebook&error=${encodeURIComponent(errMsg)}`);
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('[auth] Facebook session login error:', loginErr);
          return res.redirect(`${baseUrl}/?auth=failed&provider=facebook&error=${encodeURIComponent(loginErr.message || 'Session initialization failed')}`);
        }
        req.session.save(saveErr => {
          if (saveErr) return res.redirect(`${baseUrl}/?auth=failed`);
          res.redirect(`${baseUrl}/?auth=success`);
        });
      });
    })(req, res, next);
  }
);

// --- Apple ----------------------------------------------------------------
// Apple's callback arrives as a POST (form_post response mode), not a GET.
router.get('/apple', (req, res, next) => ensureOAuthProvider(req, res, next, 'apple'), passport.authenticate('apple'));
router.post(
  '/apple/callback',
  (req, res, next) => ensureOAuthProvider(req, res, next, 'apple'),
  (req, res, next) => {
    const baseUrl = getFrontendUrl(req);
    passport.authenticate('apple', (err, user, info) => {
      if (err || !user) {
        const errMsg = err?.message || info?.message || 'Apple authentication was not completed.';
        console.warn('[auth] Apple OAuth error:', errMsg);
        return res.redirect(`${baseUrl}/?auth=failed&provider=apple&error=${encodeURIComponent(errMsg)}`);
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('[auth] Apple session login error:', loginErr);
          return res.redirect(`${baseUrl}/?auth=failed&provider=apple&error=${encodeURIComponent(loginErr.message || 'Session initialization failed')}`);
        }
        req.session.save(saveErr => {
          if (saveErr) return res.redirect(`${baseUrl}/?auth=failed`);
          res.redirect(`${baseUrl}/?auth=success`);
        });
      });
    })(req, res, next);
  }
);

router.post('/resend-verification', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Valid email address is required.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, email, email_verified_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    const user = rows[0];
    if (user && !user.email_verified_at) {
      const token = await createVerification(user.id);
      const verificationLink = `${getFrontendUrl(req)}/verify-email?token=${token}`;
      await sendVerificationEmail({ toEmail: user.email, verificationLink });
    }

    // Always return success to protect privacy
    return res.json({
      ok: true,
      message: 'If an unverified account exists for that email, a fresh verification link has been sent.',
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to process request. Please try again later.' });
  }
});

router.post('/verify-email/send', forgotPasswordLimiter, async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  if (req.user?.email_verified_at) return res.json({ ok: true });
  const token = await createVerification(req.user.id);
  const result = await sendVerificationEmail({ toEmail: req.user.email, verificationLink: `${getFrontendUrl(req)}/verify-email?token=${token}` });
  if (!result.sent) return res.status(503).json({ error: 'Email delivery is not configured or is unavailable. Contact the administrator.' });
  res.json({ ok: true, message: 'Verification email sent.' });
});

router.post('/verify-email', forgotPasswordLimiter, async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Verification link is invalid or malformed.' });
  }
  const verified = await consumeVerification(token);
  if (!verified) {
    return res.status(400).json({ error: 'Verification link is invalid, expired, or has already been used.' });
  }
  res.json({ ok: true, message: 'Your email has been successfully verified! You can now log in to access the site.' });
});
export default router;
