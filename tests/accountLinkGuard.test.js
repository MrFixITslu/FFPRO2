import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFinanceAccountAvailable } from '../server/accountLinkGuard.js';

test('an unlinked finance account may be reviewed for owner migration', () => {
  assert.doesNotThrow(() => assertFinanceAccountAvailable({hub_user_id:null,hub_organization_id:null},'owner','organisation'));
});

test('an account already assigned to another identity or organisation cannot be claimed', () => {
  assert.throws(() => assertFinanceAccountAvailable({hub_user_id:'other',hub_organization_id:null},'owner','organisation'),/another Hub identity/);
  assert.throws(() => assertFinanceAccountAvailable({hub_user_id:null,hub_organization_id:'other'},'owner','organisation'),/another V79 organisation/);
});
