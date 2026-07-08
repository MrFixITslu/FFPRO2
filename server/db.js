import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_FILE = process.env.DATABASE_FILE || path.join(process.cwd(), 'database.json');

// Ensure parent directory exists
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
    sessions: []
  }, null, 2));
}

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return {
      users: [],
      oauth_accounts: [],
      user_data: [],
      login_attempts: [],
      sessions: []
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

    console.warn('Unhandled SQL query in mock db.js:', sql, params);
    return { rows: [] };
  },

  async connect() {
    return {
      query: (sql, params) => this.query(sql, params),
      release: () => {}
    };
  },

  on(event, handler) {
    // mock pool.on event listener
  }
};
