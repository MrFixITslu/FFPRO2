import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pure checked-in Compose contract; no Docker daemon, secrets, ports or DB access.
const yaml = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');

function serviceNetworks(source, service) {
  const lines = source.split(/\r?\n/);
  let inService = false;
  let inNetworks = false;
  const result = [];
  for (const line of lines) {
    if (line === '  ' + service + ':') {
      inService = true;
      inNetworks = false;
      continue;
    }
    if (inService && /^  [a-z][\w-]*:/.test(line)) break;
    if (inService && line === '    networks:') {
      inNetworks = true;
      continue;
    }
    if (inNetworks && /^    \S/.test(line)) break;
    if (inNetworks) {
      const match = line.match(/^      - ([a-z][\w-]*)\s*$/);
      if (match) result.push(match[1]);
    }
  }
  return result;
}

function check(source) {
  const db = serviceNetworks(source, 'ffpro-db');
  const app = serviceNetworks(source, 'fire-finance');
  assert.deepEqual(db, ['database_internal'], 'Postgres must only attach to private network');
  assert.deepEqual(app, ['proxy_network', 'database_internal'], 'App needs proxy + private DB');
  assert.match(source, /^  database_internal:\s*\n    internal: true\s*$/m, 'Private network required');
  assert.match(source, /^  proxy_network:\s*\n    name: proxy_network\s*\n    external: true\s*$/m, 'Preserve proxy');
}

test('FFPRO PostgreSQL is unreachable from shared proxy while app has both networks', () => {
  check(yaml);
});

test('detect accidentally moving database back onto proxy network', () => {
  const altered = yaml.replace(/(  ffpro-db:[\s\S]*?    networks:\n      - )database_internal/, '$1proxy_network');
  assert.throws(() => check(altered));
});

test('detect exposing private network as non-internal', () => {
  assert.throws(() => check(yaml.replace('database_internal:\n    internal: true', 'database_internal:\n    internal: false')));
});

test('detect removing app access to the database subnet', () => {
  const altered = yaml.replace('      - proxy_network\n      - database_internal', '      - proxy_network');
  assert.throws(() => check(altered));
});
