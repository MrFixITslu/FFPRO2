// Run against the CI PostgreSQL service after building the production Docker image.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const container = `ffpro-smoke-${randomBytes(6).toString('hex')}`;
const port = 3198;
const host = 'ffpro-smoke.example.test';
const child = spawn('docker', ['run', '--rm', '--name', container, '--network', 'host',
  '-e', 'NODE_ENV=production', '-e', `PORT=${port}`, '-e', `FRONTEND_URL=https://${host}`,
  '-e', `DATABASE_URL=${process.env.TEST_DATABASE_URL}`,
  '-e', `SESSION_SECRET=${randomBytes(48).toString('hex')}`,
  '-e', `DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
  'ffpro2-ci'], { stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stdout.on('data', data => { logs += data; });
child.stderr.on('data', data => { logs += data; });
const request = (path, headers = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
  headers: { Host: host, ...headers }, signal: AbortSignal.timeout(3000)
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Production container exited: ${logs}`);
    try { if ((await request('/api/health')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Production health endpoint did not become ready: ${logs}`);
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  const html = await home.text();
  const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
  assert.ok(asset, 'Built frontend entry is linked from index.html');
  assert.equal((await request(asset)).status, 200);
  for (const path of ['/server.cjs', '/server.cjs.map', '/build/server.cjs', '/.env']) {
    assert.equal((await request(path)).status, 404, `${path} must never be public`);
  }
  assert.equal((await request('/api/files/not-a-file')).status, 401);
  assert.equal((await request('/', { Host: 'untrusted.example.test' })).status, 400);
  console.log('Production Docker smoke passed: PostgreSQL readiness, frontend, private build isolation, authentication and canonical host.');
} finally {
  spawnSync('docker', ['stop', '--time', '10', container], { stdio: 'ignore' });
  child.kill();
}
