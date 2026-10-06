import crypto from "node:crypto";
import { assertFinanceAccountAvailable } from './accountLinkGuard.js';
import { databaseReady, realPool, readDB, writeDB } from "./db.js";

function clean(value) {
  return typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";
}

function digest(body) {
  return crypto.createHash("sha256").update(body || "").digest("hex");
}

function sign({ method, pathname, timestamp, body, secret }) {
  const canonical = [String(method).toUpperCase(), pathname, String(timestamp), digest(body)].join("\n");
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

export function hubPublicUrl() {
  return clean(process.env.V79_HUB_PUBLIC_URL) || "https://hub.v79sl.com";
}

export async function consumeHubLaunchTicket(ticket) {
  const baseUrl = clean(process.env.V79_HUB_INTERNAL_URL);
  const secret = clean(process.env.V79_FFPRO_LAUNCH_SECRET);
  if (!baseUrl) throw new Error("V79_HUB_INTERNAL_URL is not configured.");
  if (secret.length < 32) throw new Error("V79_FFPRO_LAUNCH_SECRET must be at least 32 characters.");

  const pathname = "/api/platform/session/consume";
  const body = JSON.stringify({ ticket, product: "ffpro" });
  const timestamp = String(Date.now());
  const signature = sign({ method:"POST", pathname, timestamp, body, secret });

  const response = await fetch(new URL(pathname, baseUrl), {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-v79-service-id":"v79-ffpro",
      "x-v79-timestamp":timestamp,
      "x-v79-signature":signature,
    },
    body,
    signal:AbortSignal.timeout(5000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `V79 Hub returned HTTP ${response.status}`);
  if (payload?.entitlement?.product !== "ffpro" || !payload?.entitlement?.enabled) {
    throw new Error("FFPRO entitlement was not granted.");
  }
  if (!["owner", "manager", "staff", "viewer"].includes(payload?.role)) {
    throw new Error("This V79 workspace role is not eligible for FFPRO access.");
  }
  return payload;
}

export async function provisionHubFinanceUser(hubSession) {
  const role = String(hubSession?.role || "");
  const isOwner = role === "owner";
  if (!isOwner && !["manager", "staff", "viewer"].includes(role)) {
    throw new Error("This V79 workspace role is not eligible for FFPRO access.");
  }

  const hubUserId = String(hubSession.user.id);
  const hubOrganizationId = String(hubSession.organization.id);
  const email = String(hubSession.user.email || "").trim().toLowerCase();
  const displayName = String(hubSession.user.name || email.split("@")[0] || "V79 User").slice(0,255);
  if (!hubUserId || !hubOrganizationId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("The V79 Hub identity is incomplete.");
  }

  if (realPool) {
    await databaseReady;
    const client = await realPool.connect();
    try {
      await client.query("BEGIN");
      let user = (await client.query(
        "SELECT * FROM users WHERE hub_user_id=$1 AND hub_organization_id=$2 LIMIT 1",
        [hubUserId, hubOrganizationId]
      )).rows[0] || null;

      if (!user && isOwner) {
        const orgOwner = (await client.query(
          "SELECT * FROM users WHERE hub_organization_id=$1 AND hub_finance_owner=TRUE LIMIT 1",
          [hubOrganizationId]
        )).rows[0] || null;
        if (orgOwner && orgOwner.hub_user_id !== hubUserId) {
          throw new Error("This V79 organisation already has a different FFPRO finance owner.");
        }
        user = orgOwner;
      }

      if (!user) {
        const sameOrgEmail = (await client.query(
          "SELECT * FROM users WHERE hub_organization_id=$1 AND LOWER(email)=LOWER($2) LIMIT 1",
          [hubOrganizationId, email]
        )).rows[0] || null;
        if (sameOrgEmail && sameOrgEmail.hub_user_id !== hubUserId) {
          throw new Error("This FFPRO email is already linked to another Hub identity in the organisation.");
        }
        user = sameOrgEmail;
      }

      if (!user && isOwner && process.env.V79_ALLOW_EMAIL_ACCOUNT_LINK === "1") {
        const byEmail = (await client.query(
          "SELECT * FROM users WHERE LOWER(email)=LOWER($1) AND hub_organization_id IS NULL LIMIT 1",
          [email]
        )).rows[0] || null;
        if (byEmail) {
          assertFinanceAccountAvailable(byEmail, hubUserId, hubOrganizationId);
          user = (await client.query(
            `UPDATE users
             SET hub_user_id=$1,hub_organization_id=$2,hub_finance_owner=TRUE,hub_role=$3,
                 display_name=COALESCE(display_name,$4),last_login_at=NOW()
             WHERE id=$5 RETURNING *`,
            [hubUserId,hubOrganizationId,role,displayName,byEmail.id]
          )).rows[0];
        }
      }

      if (!user) {
        user = (await client.query(
          `INSERT INTO users
             (email,display_name,password_hash,last_login_at,hub_user_id,hub_organization_id,hub_finance_owner,hub_role,email_verified_at)
           VALUES (LOWER($1),$2,NULL,NOW(),$3,$4,$5,$6,NOW())
           RETURNING *`,
          [email,displayName,hubUserId,hubOrganizationId,isOwner,role]
        )).rows[0];
      } else if (user.hub_user_id === hubUserId && user.hub_organization_id === hubOrganizationId) {
        assertFinanceAccountAvailable(user, hubUserId, hubOrganizationId);
        if (!isOwner && user.hub_finance_owner) {
          throw new Error("The FFPRO finance-owner identity cannot be downgraded through a team launch.");
        }
        user = (await client.query(
          `UPDATE users
           SET email=LOWER($1),display_name=COALESCE(NULLIF($2,''),display_name),
               hub_role=$3,hub_finance_owner=CASE WHEN $4 THEN TRUE ELSE hub_finance_owner END,last_login_at=NOW()
           WHERE id=$5 RETURNING *`,
          [email,displayName,role,isOwner,user.id]
        )).rows[0];
      }

      await client.query("COMMIT");
      return user;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const db = readDB();
  db.users ||= [];
  let user = db.users.find(item => item.hub_user_id === hubUserId && item.hub_organization_id === hubOrganizationId) || null;

  if (!user && isOwner) {
    const orgOwner = db.users.find(item => item.hub_organization_id === hubOrganizationId && item.hub_finance_owner === true) || null;
    if (orgOwner && orgOwner.hub_user_id !== hubUserId) {
      throw new Error("This V79 organisation already has a different FFPRO finance owner.");
    }
    user = orgOwner;
  }

  if (!user) {
    const sameOrgEmail = db.users.find(item =>
      item.hub_organization_id === hubOrganizationId &&
      String(item.email || "").toLowerCase() === email
    );
    if (sameOrgEmail && sameOrgEmail.hub_user_id !== hubUserId) {
      throw new Error("This FFPRO email is already linked to another Hub identity in the organisation.");
    }
    user = sameOrgEmail || null;
  }

  if (!user && isOwner && process.env.V79_ALLOW_EMAIL_ACCOUNT_LINK === "1") {
    const byEmail = db.users.find(item => String(item.email || "").toLowerCase() === email && !item.hub_organization_id);
    if (byEmail) {
      assertFinanceAccountAvailable(byEmail, hubUserId, hubOrganizationId);
      user = byEmail;
    }
  }

  if (!user) {
    user = {
      id:crypto.randomUUID(),
      email,
      username:null,
      password_hash:null,
      display_name:displayName,
      avatar_url:null,
      created_at:new Date().toISOString(),
      last_login_at:new Date().toISOString(),
      email_verified_at:new Date().toISOString(),
      session_version:0,
    };
    db.users.push(user);
  }
  if (user.hub_organization_id && user.hub_organization_id !== hubOrganizationId) {
    throw new Error("This FFPRO account is already linked to another V79 organisation.");
  }
  if (!isOwner && user.hub_finance_owner) {
    throw new Error("The FFPRO finance-owner identity cannot be downgraded through a team launch.");
  }
  user.email=email;
  user.display_name=user.display_name || displayName;
  user.hub_user_id=hubUserId;
  user.hub_organization_id=hubOrganizationId;
  user.hub_finance_owner=isOwner ? true : Boolean(user.hub_finance_owner);
  user.hub_role=role;
  user.last_login_at=new Date().toISOString();
  user.email_verified_at ||= new Date().toISOString();
  user.session_version ||= 0;
  writeDB(db);
  return user;
}

export async function provisionHubFinanceOwner(hubSession) {
  return provisionHubFinanceUser({ ...hubSession, role: "owner" });
}
