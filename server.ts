import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import passport from './server/passport.js';
import authRoutes from './server/routes/auth.js';
import dataRoutes from './server/routes/data.js';
import aiRoutes from './server/routes/ai.js';
import projectsRoutes from './server/routes/projects.js';
import invitesRoutes from './server/routes/invites.js';
import realtimeRoutes from './server/routes/realtime.js';
import investmentsRoutes from './server/routes/investments.js';
import gatewayRoutes from './server/routes/gateway.js';
import { sameOriginOnly } from './server/middleware/sameOriginOnly.js';
import { createServer as createViteServer } from 'vite';

import connectPgSimple from 'connect-pg-simple';
import { realPool, hasPostgres, schemaReady } from './server/db.js';
import { assertEncryptionConfigured } from './server/crypto.js';

// Auto-generate SESSION_SECRET and DATA_ENCRYPTION_KEY if not provided.
// Both are persisted to disk (not just held in memory) so a container
// restart/redeploy doesn't silently rotate the secret out from under
// everyone. Without this, SESSION_SECRET changing on every restart
// invalidates every existing session cookie, signing every user out.
if (!process.env.SESSION_SECRET) {
  const secretFile = process.env.SESSION_SECRET_FILE || path.join(process.cwd(), 'session.secret');
  const secretDir = path.dirname(secretFile);
  if (!fs.existsSync(secretDir)) {
    fs.mkdirSync(secretDir, { recursive: true });
  }
  if (fs.existsSync(secretFile)) {
    process.env.SESSION_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
    console.log('[server] Loaded persistent SESSION_SECRET from session.secret');
  } else {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, secret, 'utf8');
    process.env.SESSION_SECRET = secret;
    console.log('[server] Automatically generated and persisted SESSION_SECRET to session.secret');
  }
}

if (!process.env.DATA_ENCRYPTION_KEY) {
  const keyFile = process.env.ENCRYPTION_KEY_FILE || path.join(process.cwd(), 'encryption.key');
  // Ensure parent directory exists
  const keyDir = path.dirname(keyFile);
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }
  if (fs.existsSync(keyFile)) {
    process.env.DATA_ENCRYPTION_KEY = fs.readFileSync(keyFile, 'utf8').trim();
    console.log('[server] Loaded persistent DATA_ENCRYPTION_KEY from encryption.key');
  } else {
    const key = crypto.randomBytes(32).toString('base64');
    fs.writeFileSync(keyFile, key, 'utf8');
    process.env.DATA_ENCRYPTION_KEY = key;
    console.log('[server] Automatically generated and persisted DATA_ENCRYPTION_KEY to encryption.key');
  }
}

// Map GEMINI_API_KEY to API_KEY for gemini routes if missing
if (!process.env.API_KEY && process.env.GEMINI_API_KEY) {
  process.env.API_KEY = process.env.GEMINI_API_KEY;
}

// Fail fast on a malformed encryption key rather than 500-ing on every
// /api/data request later (which the frontend surfaces as "Could not reach
// the cloud").
try {
  assertEncryptionConfigured();
} catch (err: any) {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3010', 10);

// Trust reverse proxy (Cloud Run, Nginx, etc.) to correctly detect req.secure and HTTPS
app.set('trust proxy', true);

// True only when actually running inside the AI Studio builder's iframe
// preview environment (Cloud Run, or APP_URL set by that sandbox) — never
// true for a normal self-hosted deployment behind your own domain.
const isCloudSandbox = !!(process.env.K_SERVICE || process.env.APP_URL);

// Helmet security configuration. frameguard/COEP are only relaxed inside the
// AI Studio sandbox, where the app needs to render inside that tool's own
// iframe. Disabling X-Frame-Options for every deployment — including a real,
// standalone production instance — means any third-party site could iframe
// this app and clickjack a user into an unintended action (e.g. tricking a
// click into "Connect Binance" or a fund transfer). CSP stays off either way
// (a from-scratch CSP for a Vite/React SPA with inline styles is a larger,
// separate piece of work, not a one-line toggle).
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: isCloudSandbox ? false : { action: 'deny' },
  crossOriginEmbedderPolicy: isCloudSandbox ? false : undefined,
}));

// Logger middleware
app.use(morgan('dev'));

// Payload parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const PgStore = connectPgSimple(session);

// Instantiate session middleware ONCE at module level so we use a single persistent session store
const sessionSecret = process.env.SESSION_SECRET || 'fallback-secret-key-12345';
let sessionStore: session.Store | undefined;

if (hasPostgres && realPool) {
  try {
    const pgStore = new PgStore({
      pool: realPool,
      tableName: 'sessions',
      createTableIfMissing: true,
      errorLog: (err: any) => {
        console.warn('[session-store] PGStore non-fatal error:', err?.message || err);
      }
    });
    pgStore.on('error', (err: any) => {
      console.warn('[session-store] PGStore pool error:', err?.message || err);
    });
    sessionStore = pgStore;
  } catch (err) {
    console.warn('[session-store] Failed to initialize PgStore, using default memory store fallback:', err);
  }
}

const sessionMiddleware = session({
  name: 'ffpro.sid',
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  }
});

// Dynamic express-session middleware wrapper: sets the cookie's Secure/SameSite
// attributes to match the ACTUAL connection security for this request, so the
// cookie the browser receives is one it will actually store and send back.
//
// `app.set('trust proxy', true)` above already makes `req.secure` correctly
// reflect the `X-Forwarded-Proto` header set by a TLS-terminating reverse
// proxy (Nginx, Cloud Run, etc.). We only add small, explicit fallbacks on
// top of that — never a blanket "host isn't literally 'localhost', so treat
// it as secure" rule. Forcing `secure: true` on a connection that is actually
// plain HTTP causes the browser to silently discard the Set-Cookie response
// (browsers never store/send Secure cookies over an insecure origin), which
// breaks the session on the very next request: login appears to succeed, but
// every request after it looks logged-out, kicking the user back to the
// login screen in an endless loop.
app.use((req, res, next) => {
  const xSessionId = req.headers['x-session-id'];
  if (xSessionId && typeof xSessionId === 'string') {
    let existingCookie = req.headers.cookie || '';
    if (existingCookie.includes('ffpro.sid=')) {
      existingCookie = existingCookie.replace(/ffpro\.sid=[^;]+/, `ffpro.sid=${xSessionId}`);
      req.headers.cookie = existingCookie;
    } else {
      req.headers.cookie = existingCookie ? `ffpro.sid=${xSessionId}; ${existingCookie}` : `ffpro.sid=${xSessionId}`;
    }
  }

  const xfp = req.headers['x-forwarded-proto'];
  const isSecure = req.secure ||
    isCloudSandbox ||
    (typeof xfp === 'string' && xfp.split(',').map(s => s.trim().toLowerCase()).includes('https'));

  // SameSite=None (needed so the session cookie works when this app is
  // embedded in a cross-origin iframe, e.g. the AI Studio builder preview)
  // is deliberately scoped to ONLY that sandbox scenario — not to "any
  // secure connection." A real production deployment (self-hosted behind
  // your own domain/reverse proxy, not iframed) is secure (HTTPS) on every
  // request, so gating on isSecure alone would silently apply SameSite=None
  // — the weaker setting — to 100% of normal production traffic too, which
  // is a real CSRF-hardening regression, not just a sandbox accommodation.
  sessionMiddleware(req, res, (err) => {
    if (err) {
      console.warn('[server] Session middleware error (continuing request):', err?.message || err);
    }
    if (req.session && req.session.cookie) {
      req.session.cookie.secure = isSecure;
      req.session.cookie.sameSite = (isCloudSandbox && isSecure) ? 'none' : 'lax';
    }
    next();
  });
});

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Defense-in-depth CSRF hardening on top of SameSite=Lax cookies, for the
// state-changing endpoints attackers would actually target. Deliberately
// NOT applied blanket to /api/auth or /api/data as a whole: OAuth callbacks
// (e.g. /api/auth/google/callback) are legitimately cross-site navigations
// from the provider's domain, and GET reads don't need this check.
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/logout'], sameOriginOnly);
app.use('/api/data', sameOriginOnly);
app.use(['/api/investments/binance/credentials'], sameOriginOnly);
// NOT applied to /api/gateway/webhooks/* — that's a server-to-server call
// authenticated by a shared secret, not a browser session; there is no
// Origin/Sec-Fetch-Site header to check. It IS applied to the Settings CRUD
// below, which is a normal cookie-authenticated browser request.
app.use(['/api/gateway/connections'], sameOriginOnly);

// Brute-force protection on credential endpoints. This was previously only
// present in the unused server/index.js — meaning the actual production
// server had NO rate limit at all on login or registration, so password
// guessing against a real account was unthrottled. 30 attempts / 15 min is
// generous for a legitimate user who mistypes a password a few times, while
// still bounding an automated guessing attempt.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Generous but bounded write limiter for data sync (client autosaves are
// debounced client-side, so normal use is a handful of requests per minute).
const dataWriteLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/data', (req, res, next) => (req.method === 'GET' ? next() : dataWriteLimiter(req, res, next)));

// Mount Backend API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/investments', investmentsRoutes);
app.use('/api/gateway', gatewayRoutes);
// Server-Sent Events stream for live sync. Must be mounted before the SPA
// catch-all below — otherwise EventSource requests to /api/realtime/stream
// fall through to index.html (200, text/html), which the browser rejects
// as an invalid SSE response and the client is permanently stuck reconnecting.
app.use('/api/realtime', realtimeRoutes);

// Vite Integration
async function bootstrap() {
  // Wait for the database schema (tables, extensions) to finish being
  // created before we start accepting requests. Without this, the very
  // first requests after a fresh deploy/restart can race the async
  // CREATE TABLE calls in db.js and fail with "relation does not exist",
  // which the frontend surfaces as "Could not reach the cloud."
  await schemaReady;

  if (process.env.NODE_ENV !== 'production') {
    console.log('[server] Mounting Vite Dev Middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[server] Serving static built assets from dist...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Fire Finance Pro running on port ${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('[server] Fatal bootstrap error:', err);
  process.exit(1);
});
