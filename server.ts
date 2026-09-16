import './server/config.js';
import { initPush, startPushScheduler } from './server/push.js';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import passport from './server/passport.js';
import { canonicalOrigin, production } from './server/config.js';
import { databaseReady, realPool, hasPostgres } from './server/db.js';
import { initSecuritySchema } from './server/securityStore.js';
import { sameOriginOnly, csrfProtection } from './server/middleware/sameOriginOnly.js';
import { realtimeHub } from './server/realtime.js';
import { startFundingResearchScheduler } from './server/jobs/fundingScheduler.js';
import authRoutes from './server/routes/auth.js';
import dataRoutes from './server/routes/data.js';
import aiRoutes from './server/routes/ai.js';
import projectsRoutes from './server/routes/projects.js';
import invitesRoutes from './server/routes/invites.js';
import realtimeRoutes from './server/routes/realtime.js';
import gmailRoutes from './server/routes/gmail.js';
import googleCalendarRoutes from './server/routes/googleCalendar.js';
import legalRoutes from './server/routes/legal.js';
import fundingRoutes from './server/routes/funding.js';
import notificationsRoutes from './server/routes/notifications.js';
import filesRoutes from './server/routes/files.js';

async function bootstrap() {
  await databaseReady;
  await initSecuritySchema();
  await initPush();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: production ? ["'self'", 'https://cdnjs.cloudflare.com'] : ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com', 'https://*.fbcdn.net', 'https://images.unsplash.com'],
    connectSrc: ["'self'", ...(production ? [] : ['ws:', 'wss:'])],
    frameAncestors: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"],
    upgradeInsecureRequests: production ? [] : null,
  }}, crossOriginEmbedderPolicy: false }));
  // Log paths only: OAuth codes and recovery tokens must not reach access logs.
  morgan.token('safe-path', req => (req.url || '/').split('?')[0]);
  app.use(morgan(':method :safe-path :status :response-time ms'));
  app.use((req, res, next) => {
    if (production && req.get('host') !== new URL(canonicalOrigin()).host && !['/api/live', '/api/health'].includes(req.path)) {
      return res.status(400).json({ error: 'Invalid host.' });
    }
    let requestedPath;
    try { requestedPath=decodeURIComponent(req.path); } catch { return res.sendStatus(404); }
    const developmentBundle=!production && requestedPath.startsWith('/node_modules/.vite/');
    if (requestedPath.startsWith('/server') || requestedPath.startsWith('/build/') || requestedPath.endsWith('/database.json') ||
      (!developmentBundle && /(?:^|\/)\.|\.(?:key|env|sql|sqlite|db|pem|map)$/.test(requestedPath))) return res.sendStatus(404);
    next();
  });
  app.get('/api/live', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', async (_req, res) => {
    try {
      if (realPool) await realPool.query('SELECT 1');
      else if (production) throw new Error('Database unavailable');
      res.json({ ok: true, database: hasPostgres ? 'postgresql' : 'development-only' });
    } catch { res.status(503).json({ ok: false }); }
  });
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  const PgStore = connectPgSimple(session);
  app.use(session({
    name: 'ffpro.sid', secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false,
    store: realPool ? new PgStore({ pool: realPool, tableName: 'sessions', createTableIfMissing: true }) : undefined,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/auth/csrf', (req, res) => {
    const current = req.session as any;
    current.csrfToken ||= crypto.randomBytes(32).toString('hex');
    res.json({ csrfToken: current.csrfToken });
  });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.use(['/api/auth/login', '/api/auth/register'], authLimiter);
  // Apple form_post is not enabled until it can use an isolated SameSite=None state cookie.
  app.use('/api', sameOriginOnly, csrfProtection);
  app.use('/api/auth', authRoutes);
  app.use('/api/data', dataRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/invites', invitesRoutes);
  app.use('/api/realtime', realtimeRoutes);
  app.use('/api/gmail', gmailRoutes);
  app.use('/api/calendar', googleCalendarRoutes);
  app.use('/api/funding', fundingRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/files', filesRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use(legalRoutes);
  if (!production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), 'dist');
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(dist, { index: false, maxAge: 0 }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('[request]', err.code || err.name || 'Error');
    if (res.headersSent) return res.end();
    const status = Number(err.status || err.statusCode) || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: status < 500 ? (err.publicMessage || 'Invalid request.') : 'Request failed. Please retry.' });
  });
  const port = Number(process.env.PORT || 3010);
  const server = app.listen(port, '0.0.0.0', () => console.log(`FFPRO2 running on port ${port}`));
  const pushTimer=startPushScheduler();
  const fundingJob = startFundingResearchScheduler();
  const shutdown = () => {
    if(pushTimer)clearInterval(pushTimer);
    fundingJob?.stop();
    realtimeHub.close();
    server.close(async () => { await realPool?.end(); process.exit(0); });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
bootstrap().catch(error => { console.error('Startup failed:', error.message); process.exit(1); });
