import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('same Hub owner can have isolated FFPRO accounts in two organizations', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ffpro-hub-orgs-'));
  const databaseFile = join(dir, 'database.json');
  const previousDatabaseFile = process.env.DATABASE_FILE;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousPgHost = process.env.PGHOST;
  const previousPgUser = process.env.PGUSER;

  process.env.DATABASE_FILE = databaseFile;
  delete process.env.DATABASE_URL;
  delete process.env.PGHOST;
  delete process.env.PGUSER;

  t.after(async () => {
    if (previousDatabaseFile === undefined) delete process.env.DATABASE_FILE;
    else process.env.DATABASE_FILE = previousDatabaseFile;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousPgHost === undefined) delete process.env.PGHOST;
    else process.env.PGHOST = previousPgHost;
    if (previousPgUser === undefined) delete process.env.PGUSER;
    else process.env.PGUSER = previousPgUser;
    await rm(dir, { recursive: true, force: true });
  });

  const { provisionHubFinanceOwner } = await import('../server/hubAccess.js?workspace-isolation-test');

  const session = organizationId => ({
    user: { id: 'hub-user-123', email: 'owner@example.test', name: 'Shared Owner' },
    organization: { id: organizationId }
  });

  const firstA = await provisionHubFinanceOwner(session('org-a-1234'));
  const ownerB = await provisionHubFinanceOwner(session('org-b-1234'));
  const secondA = await provisionHubFinanceOwner(session('org-a-1234'));

  assert.equal(firstA.id, secondA.id);
  assert.notEqual(firstA.id, ownerB.id);
  assert.equal(firstA.hub_user_id, 'hub-user-123');
  assert.equal(ownerB.hub_user_id, 'hub-user-123');
  assert.equal(firstA.hub_organization_id, 'org-a-1234');
  assert.equal(ownerB.hub_organization_id, 'org-b-1234');

  const db = JSON.parse(await readFile(databaseFile, 'utf8'));
  const linked = db.users.filter(user => user.hub_user_id === 'hub-user-123');
  assert.equal(linked.length, 2);
  assert.deepEqual(new Set(linked.map(user => user.hub_organization_id)), new Set(['org-a-1234', 'org-b-1234']));
});
