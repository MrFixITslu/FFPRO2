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
    password_reset_tokens: []
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
    parsed.funding_opportunities ||= [];
    parsed.funding_research_jobs ||= [];

    if (parsed.funding_opportunities.length === 0) {
      parsed.funding_opportunities = [
        {
          id: 1,
          source_url: 'https://www.arts.gov/grants/grants-for-arts-projects',
          content_hash: 'seed-nea-2026',
          title: 'NEA Grants for Arts Projects & Cultural Innovation',
          funder_name: 'National Endowment for the Arts',
          description: 'Supports artist-led initiatives, public art showcases, and educational partnerships elevating diverse cultural heritage and regional creative development.',
          amount_min: 10000,
          amount_max: 100000,
          currency: 'USD',
          deadline: '2026-10-15',
          eligibility_summary: '501(c)(3) non-profit arts organizations, local arts agencies, and tribal organizations.',
          category: 'Arts & Culture',
          tags: ['arts', 'community', 'education'],
          status: 'active',
          first_seen_at: '2026-08-20T10:00:00.000Z',
          last_verified_at: '2026-09-01T08:00:00.000Z'
        },
        {
          id: 2,
          source_url: 'https://knightfoundation.org/programs/technology/',
          content_hash: 'seed-knight-2026',
          title: 'Civic Innovation & Digital Equity Accelerator Fund',
          funder_name: 'Knight Foundation & TechBridge',
          description: 'Catalytic grants for open-source digital tools, local civic data infrastructure, and grassroots technology access initiatives.',
          amount_min: 25000,
          amount_max: 75000,
          currency: 'USD',
          deadline: '2026-09-07',
          eligibility_summary: 'Civic technologists, registered startups, community non-profits, and educational institutions.',
          category: 'Technology',
          tags: ['technology', 'civic', 'equity'],
          status: 'active',
          first_seen_at: '2026-08-25T14:30:00.000Z',
          last_verified_at: '2026-09-02T12:00:00.000Z'
        },
        {
          id: 3,
          source_url: 'https://sloan.org/programs/digital-technology',
          content_hash: 'seed-sloan-2026',
          title: 'Open Source Public Goods Fellowship & Infrastructure Grant',
          funder_name: 'Alfred P. Sloan Foundation',
          description: 'Unrestricted developer stipends and cloud infrastructure funding for core maintainers of critical scientific and open-source ecosystems.',
          amount_min: 15000,
          amount_max: 50000,
          currency: 'USD',
          deadline: null,
          eligibility_summary: 'Individual open source maintainers, university labs, and non-profit development consortiums.',
          category: 'Open Source',
          tags: ['open-source', 'fellowship', 'developer'],
          status: 'active',
          first_seen_at: '2026-08-10T09:00:00.000Z',
          last_verified_at: '2026-09-01T15:00:00.000Z'
        },
        {
          id: 4,
          source_url: 'https://example.gov/grants/small-business-2025',
          content_hash: 'seed-sba-2026',
          title: 'Regional Small Business Commercialization & Growth Grant',
          funder_name: 'State Economic Development Agency',
          description: 'Direct capital support for innovative regional businesses scaling operations and creating local clean-tech manufacturing jobs.',
          amount_min: 20000,
          amount_max: 80000,
          currency: 'USD',
          deadline: '2026-06-30',
          eligibility_summary: 'Small businesses with under 50 employees registered in the operating state for at least 12 months.',
          category: 'Small Business',
          tags: ['business', 'economic-development'],
          status: 'active',
          first_seen_at: '2026-05-15T08:00:00.000Z',
          last_verified_at: '2026-07-01T10:00:00.000Z'
        },
        {
          id: 5,
          source_url: 'https://www.energy.gov/clean-energy-challenge',
          content_hash: 'seed-cleanenergy-2026',
          title: 'Clean Energy Community Microgrid Demonstration Challenge',
          funder_name: 'Department of Energy & Climate Action Trust',
          description: 'Deployment grants for distributed renewable energy microgrids, storage pilots, and local resilience hubs.',
          amount_min: 50000,
          amount_max: 250000,
          currency: 'USD',
          deadline: '2026-08-15',
          eligibility_summary: 'Municipal utilities, non-profit energy co-ops, research institutions, and tribal councils.',
          category: 'Clean Energy',
          tags: ['energy', 'climate', 'infrastructure'],
          status: 'active',
          first_seen_at: '2026-07-01T11:00:00.000Z',
          last_verified_at: '2026-08-20T09:00:00.000Z'
        }
      ];
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2));
      } catch (err) {}
    }
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
      password_reset_tokens: [],
      funding_opportunities: [],
      funding_research_jobs: []
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

    // 20. SELECT * FROM funding_opportunities WHERE id = $1
    if (cleanSql.startsWith('SELECT * FROM funding_opportunities WHERE id =')) {
      const id = parseInt(params[0], 10);
      const row = (db.funding_opportunities || []).find(o => o.id === id);
      return { rows: row ? [row] : [] };
    }

    // 21. SELECT id FROM funding_opportunities WHERE content_hash = $1
    if (cleanSql.includes('SELECT id FROM funding_opportunities WHERE content_hash =')) {
      const hash = params[0];
      const row = (db.funding_opportunities || []).find(o => o.content_hash === hash);
      return { rows: row ? [{ id: row.id }] : [] };
    }

    // 22. SELECT * FROM funding_opportunities
    if (cleanSql.startsWith('SELECT * FROM funding_opportunities')) {
      let list = [...(db.funding_opportunities || [])];
      if (cleanSql.includes('WHERE category =')) {
        const cat = params[0];
        list = list.filter(o => o.category === cat);
      }
      list.sort((a, b) => new Date(b.first_seen_at || 0) - new Date(a.first_seen_at || 0));
      return { rows: list };
    }

    // 23. UPDATE funding_opportunities SET last_verified_at = NOW() WHERE id = $1
    if (cleanSql.startsWith('UPDATE funding_opportunities SET last_verified_at = NOW() WHERE id =')) {
      const id = parseInt(params[0], 10);
      const item = (db.funding_opportunities || []).find(o => o.id === id);
      if (item) {
        item.last_verified_at = new Date().toISOString();
        writeDB(db);
      }
      return { rows: [] };
    }

    // 24. INSERT INTO funding_opportunities
    if (cleanSql.startsWith('INSERT INTO funding_opportunities')) {
      db.funding_opportunities ||= [];
      const nextId = db.funding_opportunities.reduce((max, o) => Math.max(max, o.id || 0), 0) + 1;
      const newOp = {
        id: nextId,
        source_url: params[0],
        content_hash: params[1],
        title: params[2],
        funder_name: params[3],
        description: params[4],
        amount_min: params[5],
        amount_max: params[6],
        currency: params[7],
        deadline: params[8],
        eligibility_summary: params[9],
        category: params[10],
        tags: typeof params[11] === 'string' ? JSON.parse(params[11]) : (params[11] || []),
        status: 'active',
        first_seen_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString()
      };
      db.funding_opportunities.push(newOp);
      writeDB(db);
      return { rows: [{ id: newOp.id }] };
    }

    // 25. SELECT status, COUNT(*)::int AS count FROM funding_research_jobs GROUP BY status
    if (cleanSql.includes('FROM funding_research_jobs GROUP BY status')) {
      const counts = {};
      (db.funding_research_jobs || []).forEach(j => {
        counts[j.status] = (counts[j.status] || 0) + 1;
      });
      return { rows: Object.entries(counts).map(([status, count]) => ({ status, count })) };
    }

    // 26. SELECT * FROM funding_research_jobs
    if (cleanSql.startsWith('SELECT * FROM funding_research_jobs')) {
      return { rows: db.funding_research_jobs || [] };
    }

    // 27. INSERT INTO funding_research_jobs
    if (cleanSql.startsWith('INSERT INTO funding_research_jobs')) {
      db.funding_research_jobs ||= [];
      const newJob = {
        id: db.funding_research_jobs.length + 1,
        source_url: params[0],
        status: params[1] || 'queued',
        attempts: 0,
        max_attempts: 3,
        created_at: new Date().toISOString(),
        next_attempt_at: new Date().toISOString()
      };
      db.funding_research_jobs.push(newJob);
      writeDB(db);
      return { rows: [{ id: newJob.id }] };
    }

    // 28. UPDATE funding_research_jobs
    if (cleanSql.startsWith('UPDATE funding_research_jobs')) {
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
