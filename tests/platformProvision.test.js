import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function signature(secret, pathname, timestamp, body) {
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  return crypto.createHmac('sha256', secret)
    .update(['POST', pathname, timestamp, hash].join('\n'))
    .digest('hex');
}

test('signed FFPRO provisioning creates isolated owners for two Hub organizations', { timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ffpro-platform-provision-'));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const secret = 'platform-test-secret-12345678901234567890';
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    FRONTEND_URL: origin,
    DATABASE_FILE: join(dir, 'db.json'),
    ENCRYPTION_KEY_FILE: join(dir, 'key'),
    DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    DATABASE_URL: '',
    PGHOST: '',
    PGUSER: '',
    V79_ALLOW_LEGACY_AUTH: '0',
    V79_PLATFORM_SHARED_SECRET: secret,
    TAVILY_API_KEY: '',
    GEMINI_API_KEY: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    FACEBOOK_APP_ID: '',
    FACEBOOK_APP_SECRET: '',
    SMTP_HOST: '',
  };

  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', chunk => logs += chunk);
  child.stderr.on('data', chunk => logs += chunk);
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await rm(dir, { recursive: true, force: true });
  });

  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin + '/api/live')).ok) break; } catch {}
    if (child.exitCode !== null) assert.fail(logs);
    if (i === 149) assert.fail(logs || 'FFPRO test server did not become ready');
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async function provision(organizationId) {
    const pathname = '/api/platform/provision';
    const payload = JSON.stringify({
      organization: { id: organizationId, name: organizationId === 'org-a-1234' ? 'Business A' : 'Business B', slug: organizationId === 'org-a-1234' ? 'business-a' : 'business-b' },
      user: { id: 'hub-user-1234', email: 'owner@example.test', name: 'Shared Owner' },
      role: 'owner'
    });
    const timestamp = String(Date.now());
    return fetch(origin + pathname, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-v79-service-id': 'v79-hub',
        'x-v79-timestamp': timestamp,
        'x-v79-signature': signature(secret, pathname, timestamp, payload),
      },
      body: payload,
    });
  }

  const denied = await fetch(origin + '/api/platform/provision', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-v79-service-id': 'v79-hub', 'x-v79-timestamp': String(Date.now()), 'x-v79-signature': '00' },
    body: '{}',
  });
  assert.equal(denied.status, 401);

  const a = await provision('org-a-1234');
  const b = await provision('org-b-1234');
  assert.equal(a.status, 200, await a.clone().text());
  assert.equal(b.status, 200, await b.clone().text());
  const aBody = await a.json();
  const bBody = await b.json();
  assert.equal(aBody.organizationId, 'org-a-1234');
  assert.equal(bBody.organizationId, 'org-b-1234');
  assert.equal(aBody.ownerHubUserId, 'hub-user-1234');
  assert.equal(bBody.ownerHubUserId, 'hub-user-1234');
  assert.notEqual(aBody.financeUserId, bBody.financeUserId);

  const db = JSON.parse(await readFile(join(dir, 'db.json'), 'utf8'));
  const linked = db.users.filter(user => user.hub_user_id === 'hub-user-1234');
  assert.equal(linked.length, 2);
  assert.deepEqual(new Set(linked.map(user => user.hub_organization_id)), new Set(['org-a-1234', 'org-b-1234']));
});
