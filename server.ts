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
import { createServer as createViteServer } from 'vite';

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

// Express session with memory store for development/sandbox stability
app.use(session({
  name: 'ffpro.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Set to false in the sandboxed preview/development env
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Mount Backend API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/ai', aiRoutes);

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
}

bootstrap().catch(err => {
  console.error('[server] Fatal bootstrap error:', err);
  process.exit(1);
});
