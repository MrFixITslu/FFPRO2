import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';

const DB_FILE = process.env.DATABASE_FILE || path.join(process.cwd(), 'database.json');

// Detect real PostgreSQL config
const hasPostgres = !!(process.env.DATABASE_URL || process.env.PGHOST || process.env.PGUSER);
let realPool = null;

if (hasPostgres) {
  console.log('PostgreSQL configuration detected. Initializing real PostgreSQL pool...');
  const poolConfig = process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      };
  
  // For some cloud providers (e.g. Neon, Render, AWS), SSL might be required.
  // Enable safe SSL defaults only for genuinely remote hosts — not for local
  // Docker service names like "postgres" or "localhost", which run without
  // SSL configured and will reject an SSL handshake outright.
  const isLocalDockerHost = (host) => {
    if (!host) return false;
    return host === 'localhost' || host === '127.0.0.1' || host === 'postgres' || host === 'db' || host.endsWith('.internal');
  };
  let effectiveHost = poolConfig.host;
  if (poolConfig.connectionString) {
    try {
      effectiveHost = new URL(poolConfig.connectionString).hostname;
    } catch (e) {
      effectiveHost = null;
    }
  }
  const forceSSL = process.env.DATABASE_SSL === 'true';
  const disableSSL = process.env.DATABASE_SSL === 'false';
  if (forceSSL || (!disableSSL && effectiveHost && !isLocalDockerHost(effectiveHost))) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  realPool = new pg.Pool(poolConfig);

  // Handle background pool connection errors so DNS/network glitches don't crash Node process
  realPool.on('error', (err) => {
    console.warn('[db] Unexpected error on idle PostgreSQL client/pool:', err?.message || err);
  });

  // Initialize tables asynchronously
  realPool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`).then(() => {
    return realPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255),
      password_hash VARCHAR(255),
      display_name VARCHAR(255),
      avatar_url VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `).then(() => {
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        provider_user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_user_id)
      );
    `);
  }).then(() => {
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }).then(() => {
    return realPool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);`);
  }).then(() => {
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS user_data (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        ciphertext BYTEA NOT NULL,
        iv BYTEA NOT NULL,
        auth_tag BYTEA NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }).then(() => {
    // Shared, multi-user projects (Planning Hub plans that have been shared
    // with collaborators). Kept separate from the per-user encrypted blob
    // above because more than one account needs to read/write this data.
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        project_type VARCHAR(50) NOT NULL DEFAULT 'event',
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }).then(() => {
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'viewer',
        added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, user_id)
      );
    `);
  }).then(() => {
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS project_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'editor',
        invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(64) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        accepted_at TIMESTAMP WITH TIME ZONE
      );
    `);
  }).then(() => {
    return realPool.query(`CREATE INDEX IF NOT EXISTS idx_project_invites_email ON project_invites(LOWER(email));`);
  }).then(() => {
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS project_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }).then(() => {
    return realPool.query(`CREATE INDEX IF NOT EXISTS idx_project_messages_project_created ON project_messages(project_id, created_at);`);
  }).then(() => {
    // Encrypted Google OAuth tokens (access + refresh), captured when a user
    // logs in with Google, so features like Gmail Planning Notifications can
    // use the server's own stored grant instead of asking the browser for a
    // second, separate consent every session.
    return realPool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS google_gmail_ciphertext BYTEA,
        ADD COLUMN IF NOT EXISTS google_gmail_iv BYTEA,
        ADD COLUMN IF NOT EXISTS google_gmail_auth_tag BYTEA,
        ADD COLUMN IF NOT EXISTS google_gmail_token_expiry TIMESTAMP WITH TIME ZONE;
    `);
  }).then(() => {
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS dismissed_emails (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id VARCHAR(255) NOT NULL,
        dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, message_id)
      );
    `);
  }).then(() => {
    return realPool.query(`CREATE INDEX IF NOT EXISTS idx_dismissed_emails_user ON dismissed_emails(user_id);`);
=======
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
    // --- Funding Finder ---------------------------------------------------
    // Verified funding/grant opportunities. Written ONLY by the research
    // pipeline (server/services/fundingResearch.js) after AI-extracted data
    // has passed strict schema validation — never from raw model output.
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS funding_opportunities (
        id SERIAL PRIMARY KEY,
        source_url TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        title TEXT NOT NULL,
        funder_name TEXT,
        description TEXT,
        amount_min NUMERIC,
        amount_max NUMERIC,
        currency TEXT,
        deadline DATE,
        eligibility_summary TEXT,
        category TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'active',
        first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(content_hash)
      );
    `);
  }).then(() => {
    return realPool.query(`CREATE INDEX IF NOT EXISTS idx_funding_opportunities_status ON funding_opportunities(status);`);
  }).then(() => {
    return realPool.query(`CREATE INDEX IF NOT EXISTS idx_funding_opportunities_deadline ON funding_opportunities(deadline);`);
  }).then(() => {
    return realPool.query(`CREATE INDEX IF NOT EXISTS idx_funding_opportunities_category ON funding_opportunities(category);`);
  }).then(() => {
    // Research job queue — one row per candidate URL discovered by the
    // search/fetch layer, tracked through analysis so failures retry later
    // instead of taking down the main app, and so restarts don't lose work.
    return realPool.query(`
      CREATE TABLE IF NOT EXISTS funding_research_jobs (
        id SERIAL PRIMARY KEY,
        source_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        last_error TEXT,
        content_hash TEXT,
        raw_excerpt TEXT,
        next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(source_url)
      );
    `);
  }).then(() => {
    return realPool.query(`CREATE INDEX IF NOT EXISTS idx_funding_jobs_status_next ON funding_research_jobs(status, next_attempt_at);`);
<<<<<<< Updated upstream
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
  }).then(() => {
    console.log('PostgreSQL database tables initialized successfully.');
  }).catch(err => {
    console.error('Failed to initialize PostgreSQL database tables:', err);
  });
  });
}

// Ensure parent directory exists for file-based fallback
const dir = path.dirname(DB_FILE);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    users: [],
    oauth_accounts: [],
    user_data: [],
    login_attempts: [],
    sessions: [],
    projects: [],
    project_members: [],
    project_invites: [],
    project_messages: [],
    password_reset_tokens: [],
    dismissed_emails: []
  }, null, 2));
}

function readDB() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Backfill new collections for database files created before this feature existed.
    parsed.projects ||= [];
    parsed.project_members ||= [];
    parsed.project_invites ||= [];
    parsed.project_messages ||= [];
    parsed.password_reset_tokens ||= [];
    parsed.dismissed_emails ||= [];
    return parsed;
  } catch (e) {
    return {
      users: [],
      oauth_accounts: [],
      user_data: [],
      login_attempts: [],
      sessions: [],
      projects: [],
      project_members: [],
      project_invites: [],
      project_messages: [],
      password_reset_tokens: []
    };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to write database file:', e);
  }
}

export const pool = {
  async query(sql, params = []) {
    if (realPool) {
      try {
        return await realPool.query(sql, params);
      } catch (err) {
        if (err.code === 'EAI_AGAIN' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          console.warn('[db] PostgreSQL pool query failed due to network error, falling back to local database file:', err.message);
        } else {
          throw err;
        }
      }
    }

    const db = readDB();
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    // 1. SELECT id, email, username, display_name, avatar_url FROM users WHERE id = $1
    if (cleanSql.includes('SELECT id, email, username, display_name, avatar_url FROM users WHERE id =')) {
      const id = params[0];
      const user = db.users.find(u => u.id === id);
      return { rows: user ? [{ id: user.id, email: user.email, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url }] : [] };
    }

    // 2. SELECT u.* FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id WHERE oa.provider = $1 AND oa.provider_user_id = $2
    if (cleanSql.includes('SELECT u.* FROM oauth_accounts') && cleanSql.includes('oa.provider =')) {
      const provider = params[0];
      const providerUserId = params[1];
      const oauth = db.oauth_accounts.find(oa => oa.provider === provider && oa.provider_user_id === providerUserId);
      if (oauth) {
        const user = db.users.find(u => u.id === oauth.user_id);
        return { rows: user ? [user] : [] };
      }
      return { rows: [] };
    }

    // 3. SELECT id FROM users WHERE LOWER(email) = LOWER($1)
    if (cleanSql.includes('SELECT id FROM users WHERE LOWER(email) = LOWER(')) {
      const email = params[0];
      const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      return { rows: user ? [{ id: user.id }] : [] };
    }

    // 4. SELECT * FROM users WHERE LOWER(email) = LOWER($1)
    if (cleanSql.includes('SELECT * FROM users WHERE LOWER(email) = LOWER(')) {
      const email = params[0];
      const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      return { rows: user ? [user] : [] };
    }

    // 5. INSERT INTO users (email, username, password_hash, display_name, last_login_at) VALUES (LOWER($1), $2, $3, $4, now()) RETURNING *
    if (cleanSql.startsWith('INSERT INTO users (email, username, password_hash, display_name, last_login_at)')) {
      const newUser = {
        id: crypto.randomUUID(),
        email: params[0].toLowerCase(),
        username: params[1] || null,
        password_hash: params[2],
        display_name: params[3],
        avatar_url: null,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString()
      };
      db.users.push(newUser);
      writeDB(db);
      return { rows: [newUser] };
    }

    // 6. INSERT INTO users (email, display_name, avatar_url, last_login_at) VALUES ($1, $2, $3, now()) RETURNING *
    if (cleanSql.startsWith('INSERT INTO users (email, display_name, avatar_url, last_login_at)')) {
      const newUser = {
        id: crypto.randomUUID(),
        email: params[0].toLowerCase(),
        username: null,
        password_hash: null,
        display_name: params[1] || null,
        avatar_url: params[2] || null,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString()
      };
      db.users.push(newUser);
      writeDB(db);
      return { rows: [newUser] };
    }

    // 7. UPDATE users SET last_login_at = now() WHERE id = $1
    if (cleanSql.startsWith('UPDATE users SET last_login_at =')) {
      const id = params[0];
      const user = db.users.find(u => u.id === id);
      if (user) {
        user.last_login_at = new Date().toISOString();
        writeDB(db);
      }
      return { rows: [] };
    }

    // 8. INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, $2, $3)
    if (cleanSql.startsWith('INSERT INTO oauth_accounts')) {
      const userId = params[0];
      const provider = params[1];
      const providerUserId = params[2];
      const exists = db.oauth_accounts.some(oa => oa.provider === provider && oa.provider_user_id === providerUserId);
      if (!exists) {
        db.oauth_accounts.push({
          id: crypto.randomUUID(),
          user_id: userId,
          provider,
          provider_user_id: providerUserId,
          created_at: new Date().toISOString()
        });
        writeDB(db);
      }
      return { rows: [] };
    }

    // 9. SELECT ciphertext, iv, auth_tag, version, updated_at FROM user_data WHERE user_id = $1
    if (cleanSql.includes('SELECT ciphertext, iv, auth_tag, version, updated_at FROM user_data WHERE user_id =')) {
      const userId = params[0];
      const ud = db.user_data.find(u => u.user_id === userId);
      if (ud) {
        return {
          rows: [{
            ciphertext: Buffer.from(ud.ciphertext, 'hex'),
            iv: Buffer.from(ud.iv, 'hex'),
            auth_tag: Buffer.from(ud.auth_tag, 'hex'),
            version: ud.version,
            updated_at: ud.updated_at
          }]
        };
      }
      return { rows: [] };
    }

    // 10. SELECT version FROM user_data WHERE user_id = $1 FOR UPDATE
    if (cleanSql.includes('SELECT version FROM user_data WHERE user_id =') && cleanSql.includes('FOR UPDATE')) {
      const userId = params[0];
      const ud = db.user_data.find(u => u.user_id === userId);
      return { rows: ud ? [{ version: ud.version }] : [] };
    }

    // 11. INSERT INTO user_data (user_id, ciphertext, iv, auth_tag, version, updated_at) ... ON CONFLICT
    if (cleanSql.startsWith('INSERT INTO user_data')) {
      const userId = params[0];
      const ciphertextHex = params[1].toString('hex');
      const ivHex = params[2].toString('hex');
      const authTagHex = params[3].toString('hex');
      const version = params[4];

      const idx = db.user_data.findIndex(u => u.user_id === userId);
      const entry = {
        user_id: userId,
        ciphertext: ciphertextHex,
        iv: ivHex,
        auth_tag: authTagHex,
        version,
        updated_at: new Date().toISOString()
      };

      if (idx !== -1) {
        db.user_data[idx] = entry;
      } else {
        db.user_data.push(entry);
      }
      writeDB(db);
      return { rows: [] };
    }

    // 12. DELETE FROM user_data WHERE user_id = $1
    if (cleanSql.startsWith('DELETE FROM user_data WHERE user_id =')) {
      const userId = params[0];
      db.user_data = db.user_data.filter(u => u.user_id !== userId);
      writeDB(db);
      return { rows: [] };
    }

    // 13. INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id
    if (cleanSql.startsWith('INSERT INTO password_reset_tokens')) {
      const entry = {
        id: crypto.randomUUID(),
        user_id: params[0],
        token_hash: params[1],
        expires_at: params[2],
        used_at: null,
        created_at: new Date().toISOString()
      };
      db.password_reset_tokens.push(entry);
      writeDB(db);
      return { rows: [{ id: entry.id }] };
    }

    // 14. SELECT * FROM password_reset_tokens WHERE token_hash = $1
    if (cleanSql.includes('SELECT * FROM password_reset_tokens WHERE token_hash =')) {
      const tokenHash = params[0];
      const row = db.password_reset_tokens.find(t => t.token_hash === tokenHash);
      return { rows: row ? [row] : [] };
    }

    // 15. UPDATE password_reset_tokens SET used_at = now() WHERE id = $1
    if (cleanSql.startsWith('UPDATE password_reset_tokens SET used_at =') && cleanSql.includes('WHERE id =')) {
      const id = params[0];
      const row = db.password_reset_tokens.find(t => t.id === id);
      if (row) {
        row.used_at = new Date().toISOString();
        writeDB(db);
      }
      return { rows: [] };
    }

    // 16. UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL
    if (cleanSql.startsWith('UPDATE password_reset_tokens SET used_at =') && cleanSql.includes('WHERE user_id =')) {
      const userId = params[0];
      const now = new Date().toISOString();
      db.password_reset_tokens
        .filter(t => t.user_id === userId && !t.used_at)
        .forEach(t => { t.used_at = now; });
      writeDB(db);
      return { rows: [] };
    }

    // 17. UPDATE users SET password_hash = $1 WHERE id = $2
    if (cleanSql.startsWith('UPDATE users SET password_hash =')) {
      const passwordHash = params[0];
      const id = params[1];
      const user = db.users.find(u => u.id === id);
      if (user) {
        user.password_hash = passwordHash;
        writeDB(db);
      }
      return { rows: [] };
    }

    // 18. SELECT google_gmail_ciphertext, google_gmail_iv, google_gmail_auth_tag, google_gmail_token_expiry FROM users WHERE id = $1
    if (cleanSql.includes('SELECT google_gmail_ciphertext, google_gmail_iv, google_gmail_auth_tag, google_gmail_token_expiry FROM users WHERE id =')) {
      const id = params[0];
      const user = db.users.find(u => u.id === id);
      if (user && user.google_gmail_ciphertext) {
        return {
          rows: [{
            google_gmail_ciphertext: Buffer.from(user.google_gmail_ciphertext, 'hex'),
            google_gmail_iv: Buffer.from(user.google_gmail_iv, 'hex'),
            google_gmail_auth_tag: Buffer.from(user.google_gmail_auth_tag, 'hex'),
            google_gmail_token_expiry: user.google_gmail_token_expiry,
          }]
        };
      }
      return { rows: user ? [{ google_gmail_ciphertext: null, google_gmail_iv: null, google_gmail_auth_tag: null, google_gmail_token_expiry: null }] : [] };
    }

    // 19. UPDATE users SET google_gmail_ciphertext = $1, google_gmail_iv = $2, google_gmail_auth_tag = $3, google_gmail_token_expiry = $4 WHERE id = $5
    if (cleanSql.startsWith('UPDATE users SET google_gmail_ciphertext =')) {
      const [ciphertext, iv, authTag, expiry, id] = params;
      const user = db.users.find(u => u.id === id);
      if (user) {
        user.google_gmail_ciphertext = ciphertext.toString('hex');
        user.google_gmail_iv = iv.toString('hex');
        user.google_gmail_auth_tag = authTag.toString('hex');
        user.google_gmail_token_expiry = expiry;
        writeDB(db);
      }
      return { rows: [] };
    }

    // 20. SELECT message_id FROM dismissed_emails WHERE user_id = $1
    if (cleanSql.includes('SELECT message_id FROM dismissed_emails WHERE user_id =')) {
      const userId = params[0];
      const list = (db.dismissed_emails || []).filter(d => d.user_id === userId);
      return { rows: list.map(d => ({ message_id: d.message_id })) };
    }

    // 21. INSERT INTO dismissed_emails (user_id, message_id) VALUES ($1, $2)
    if (cleanSql.startsWith('INSERT INTO dismissed_emails')) {
      const userId = params[0];
      const messageId = params[1];
      db.dismissed_emails = db.dismissed_emails || [];
      const exists = db.dismissed_emails.some(d => d.user_id === userId && d.message_id === messageId);
      if (!exists) {
        db.dismissed_emails.push({
          user_id: userId,
          message_id: messageId,
          dismissed_at: new Date().toISOString()
        });
        writeDB(db);
      }
      return { rows: [] };
    }

    // 22. DELETE FROM dismissed_emails WHERE user_id = $1
    if (cleanSql.startsWith('DELETE FROM dismissed_emails WHERE user_id =')) {
      const userId = params[0];
      db.dismissed_emails = (db.dismissed_emails || []).filter(d => d.user_id !== userId);
      writeDB(db);
      return { rows: [] };
    }

    console.warn('Unhandled SQL query in mock db.js:', sql, params);
    return { rows: [] };
  },

  async connect() {
    if (realPool) {
      return realPool.connect();
    }
    return {
      query: (sql, params) => this.query(sql, params),
      release: () => {}
    };
  },

  on(event, handler) {
    if (realPool) {
      realPool.on(event, handler);
    }
  }
};

export { hasPostgres, realPool, readDB, writeDB, DB_FILE };
