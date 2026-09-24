import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedHost } from '../server/middleware/allowedHost.js';

test('public origin and only the private signed summary path accept their expected hosts', () => {
  const publicHost='ffpro.v79sl.com', internalHost='fire-finance-app:3010';
  assert.equal(allowedHost(publicHost, '/', publicHost, internalHost), true);
  assert.equal(allowedHost(internalHost, '/api/platform/summary/org_123', publicHost, internalHost), true);
  assert.equal(allowedHost(internalHost, '/api/platform/launch', publicHost, internalHost), false);
  assert.equal(allowedHost(internalHost, '/api/auth/login', publicHost, internalHost), false);
  assert.equal(allowedHost('evil.example', '/api/platform/summary/org_123', publicHost, internalHost), false);
  assert.equal(allowedHost(internalHost, '/api/platform/summary/org_123/extra', publicHost, internalHost), false);
  assert.equal(allowedHost(internalHost, '/api/platform/summary/org_123', publicHost), false);
});
