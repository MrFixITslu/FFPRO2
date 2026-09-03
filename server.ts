import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
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
import gmailRoutes from './server/routes/gmail.js';
import legalRoutes from './server/routes/legal.js';
import fundingRoutes from './server/routes/funding.js';
import { startFundingResearchScheduler } from './server/jobs/fundingScheduler.js';
import { createServer as createViteServer } from 'vite';

import connectPgSimple from 'connect-pg-simple';
import { realPool, hasPostgres } from './server/db.js';

// Auto-generate SESSION_SECRET and DATA_ENCRYPTION_KEY if not provided
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = crypto.randomBytes(48).toString('hex');
  console.log('[server] Automatically generated SESSION_SECRET');
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

const app = express();
const PORT = 3000;

// Trust reverse proxy (Cloud Run, Nginx, etc.) to correctly detect req.secure and HTTPS
app.set('trust proxy', true);

// Helmet security configuration to allow embedding in the AI Studio iframe
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginEmbedderPolicy: false,
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
  const isCloudSandbox = !!(process.env.K_SERVICE || process.env.APP_URL);
  const isSecure = req.secure ||
    isCloudSandbox ||
    (typeof xfp === 'string' && xfp.split(',').map(s => s.trim().toLowerCase()).includes('https'));

  // Execute session middleware, then dynamically configure cookie secure and sameSite attributes.
  // Catch any transient session store errors so HTTP requests never return 500 if PG store has network blips.
  (sessionMiddleware as any)(req, res, (err: any) => {
    if (err) {
      console.warn('[server] Session middleware error (continuing request):', err?.message || err);
    }
    if (req.session && req.session.cookie) {
      req.session.cookie.secure = isSecure;
      req.session.cookie.sameSite = isSecure ? 'none' : 'lax';
    }
    next();
  });
});

// Passport initialization
app.use(passport.initialize() as any);
app.use(passport.session() as any);

// Mount Backend API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/funding', fundingRoutes);

// Public legal pages — plain server-rendered HTML (not part of the SPA
// bundle) so they're reachable, indexable, and stable even if the frontend
// build changes. Must be registered before the SPA catch-all below.
app.use(legalRoutes);

// Vite Integration
async function bootstrap() {
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

  // Funding Finder's nightly research job — reads/writes only through
  // server/services/fundingResearch.js, and never blocks server startup.
  startFundingResearchScheduler();
}

bootstrap().catch(err => {
  console.error('[server] Fatal bootstrap error:', err);
  process.exit(1);
});
