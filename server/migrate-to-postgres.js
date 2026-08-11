// One-off migration: copies data out of the JSON-fallback store
// (database.json) into a real PostgreSQL database.
//
// Run this AFTER you've set DATABASE_URL (or PGHOST/PGUSER/etc.) in your .env
// but the OLD database.json file is still sitting on the volume, i.e. before
// you delete it. It is safe to run more than once — every insert uses
// ON CONFLICT DO NOTHING/UPDATE so re-running just no-ops on already-migrated rows.
//
// Usage (from inside the running container, or locally with the same .env):
//   node server/migrate-to-postgres.js
//
// Or as a one-off Docker command against the deployed stack:
//   docker compose run --rm ffpro2 node server/migrate-to-postgres.js

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const DB_FILE = process.env.DATABASE_FILE || path.join(process.cwd(), 'database.json');

async function main() {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    console.error('FATAL: DATABASE_URL (or PGHOST/PGUSER/etc.) is not set. Set it in .env first, then re-run this script.');
    process.exit(1);
  }

  if (!fs.existsSync(DB_FILE)) {
    console.log(`No JSON fallback file found at ${DB_FILE} — nothing to migrate. (This is expected if you're starting fresh.)`);
    process.exit(0);
  }

  const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      };
  if (poolConfig.connectionString || (poolConfig.host && poolConfig.host !== 'localhost' && poolConfig.host !== '127.0.0.1')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
  const pool = new pg.Pool(poolConfig);

  console.log('Connecting to Postgres and waiting for schema to be ready...');
  // The app's own db.js creates tables on boot; give a plain connectivity
  // check here and let the operator know to start the app once first if
  // tables don't exist yet.
  await pool.query('SELECT 1');

  const tableExists = async (name) => {
    const { rows } = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
      [name]
    );
    return rows[0].exists;
  };

  if (!(await tableExists('users'))) {
    console.error('The "users" table does not exist yet. Start the app once with DATABASE_URL set (so db.js creates the schema), then re-run this script.');
    process.exit(1);
  }

  let counts = { users: 0, oauth_accounts: 0, user_data: 0, projects: 0, project_members: 0, project_invites: 0, project_messages: 0 };

  console.log(`Migrating from ${DB_FILE} ...`);

  // 1. Users first — everything else foreign-keys to this.
  for (const u of raw.users || []) {
    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, display_name, avatar_url, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url`,
      [u.id, u.email, u.username || null, u.password_hash || null, u.display_name || null, u.avatar_url || null, u.created_at || new Date().toISOString(), u.last_login_at || new Date().toISOString()]
    );
    counts.users++;
  }

  // 2. OAuth accounts
  for (const o of raw.oauth_accounts || []) {
    await pool.query(
      `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_user_id) DO NOTHING`,
      [o.id, o.user_id, o.provider, o.provider_user_id, o.created_at || new Date().toISOString()]
    );
    counts.oauth_accounts++;
  }

  // 3. Encrypted per-user data blob — this is the important one (plans, tasks, settings, etc.)
  for (const d of raw.user_data || []) {
    await pool.query(
      `INSERT INTO user_data (user_id, ciphertext, iv, auth_tag, version, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         ciphertext = EXCLUDED.ciphertext,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at
       WHERE user_data.version < EXCLUDED.version`,
      [
        d.user_id,
        Buffer.from(d.ciphertext, 'hex'),
        Buffer.from(d.iv, 'hex'),
        Buffer.from(d.auth_tag, 'hex'),
        d.version || 1,
        d.updated_at || new Date().toISOString(),
      ]
    );
    counts.user_data++;
  }

  // 4. Shared projects + membership/invites/messages
  for (const p of raw.projects || []) {
    await pool.query(
      `INSERT INTO projects (id, owner_id, name, project_type, data, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at
       WHERE projects.version < EXCLUDED.version`,
      [p.id, p.owner_id, p.name, p.project_type || 'event', JSON.stringify(p.data || {}), p.version || 1, p.created_at || new Date().toISOString(), p.updated_at || new Date().toISOString()]
    );
    counts.projects++;
  }
  for (const m of raw.project_members || []) {
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role, added_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [m.project_id, m.user_id, m.role || 'viewer', m.added_at || new Date().toISOString()]
    );
    counts.project_members++;
  }
  for (const i of raw.project_invites || []) {
    await pool.query(
      `INSERT INTO project_invites (id, project_id, email, role, invited_by, token, status, created_at, accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [i.id, i.project_id, i.email, i.role || 'editor', i.invited_by, i.token, i.status || 'pending', i.created_at || new Date().toISOString(), i.accepted_at || null]
    );
    counts.project_invites++;
  }
  for (const msg of raw.project_messages || []) {
    await pool.query(
      `INSERT INTO project_messages (id, project_id, sender_id, body, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [msg.id, msg.project_id, msg.sender_id, msg.body, msg.created_at || new Date().toISOString()]
    );
    counts.project_messages++;
  }

  console.log('Migration complete:', counts);
  console.log(`\nA backup copy of the source file has been left at ${DB_FILE}.bak — nothing was deleted.`);
  fs.copyFileSync(DB_FILE, `${DB_FILE}.bak`);

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
