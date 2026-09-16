import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const production = process.env.NODE_ENV === 'production';
export function canonicalOrigin() {
  const raw = process.env.FRONTEND_URL || process.env.APP_URL;
  if (!raw) {
    if (production) throw new Error('FRONTEND_URL must be the canonical HTTPS application origin.');
    return `http://localhost:${process.env.PORT || 3010}`;
  }
  const url = new URL(raw);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (production ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol))) {
    throw new Error('FRONTEND_URL must be an origin, for example https://ffpro.v79sl.com');
  }
  return url.origin;
}
export function configure() {
  canonicalOrigin();
  if (production && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in production.');
  if (!process.env.SESSION_SECRET && !production) process.env.SESSION_SECRET = crypto.randomBytes(48).toString('hex');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || /change.?me|your[_-]/i.test(process.env.SESSION_SECRET)) {
    throw new Error('Provide a stable SESSION_SECRET of at least 32 characters.');
  }
  if (!process.env.DATA_ENCRYPTION_KEY) {
    const keyFile = process.env.ENCRYPTION_KEY_FILE || path.join(process.cwd(), 'encryption.key');
    if (fs.existsSync(keyFile)) process.env.DATA_ENCRYPTION_KEY = fs.readFileSync(keyFile, 'utf8').trim();
    else if (!production) {
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      fs.writeFileSync(keyFile, process.env.DATA_ENCRYPTION_KEY, { mode: 0o600 });
    } else throw new Error('DATA_ENCRYPTION_KEY or the existing ENCRYPTION_KEY_FILE is required. Never replace a key for existing data.');
  }
  const key = Buffer.from(process.env.DATA_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must encode exactly 32 bytes.');
}
configure();
