import crypto from "node:crypto";
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
  if (payload?.role !== "owner") throw new Error("FFPRO finance access currently requires the V79 organisation owner.");
  return payload;
}

export async function provisionHubFinanceOwner(hubSession) {
  const hubUserId = String(hubSession.user.id);
  const hubOrganizationId = String(hubSession.organization.id);
  const email = String(hubSession.user.email || "").trim().toLowerCase();
  const displayName = String(hubSession.user.name || email.split("@")[0] || "V79 Owner").slice(0,255);

  if (realPool) {
    await databaseReady;
    const client = await realPool.connect();
    try {
      await client.query("BEGIN");
      let user = (await client.query(
        "SELECT * FROM users WHERE hub_user_id=$1 LIMIT 1",
        [hubUserId]
      )).rows[0] || null;

      if (!user) {
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
        const byEmail = (await client.query(
          "SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1",
          [email]
        )).rows[0] || null;
        if (byEmail) {
          if (process.env.V79_ALLOW_EMAIL_ACCOUNT_LINK !== "1") {
            throw new Error("An existing FFPRO account uses this email. Explicit account-link migration is required before Hub access.");
          }
          if (byEmail.hub_organization_id && byEmail.hub_organization_id !== hubOrganizationId) {
            throw new Error("This FFPRO account is already linked to another V79 organisation.");
          }
          user = (await client.query(
            `UPDATE users
             SET hub_user_id=$1,hub_organization_id=$2,hub_finance_owner=TRUE,display_name=COALESCE(display_name,$3),last_login_at=NOW()
             WHERE id=$4 RETURNING *`,
            [hubUserId,hubOrganizationId,displayName,byEmail.id]
          )).rows[0];
        }
      }

      if (!user) {
        user = (await client.query(
          `INSERT INTO users
             (email,display_name,password_hash,last_login_at,hub_user_id,hub_organization_id,hub_finance_owner,email_verified_at)
           VALUES (LOWER($1),$2,NULL,NOW(),$3,$4,TRUE,NOW())
           RETURNING *`,
          [email,displayName,hubUserId,hubOrganizationId]
        )).rows[0];
      } else if (user.hub_user_id === hubUserId) {
        user = (await client.query(
          `UPDATE users
           SET email=LOWER($1),display_name=COALESCE(NULLIF($2,''),display_name),
               hub_organization_id=$3,hub_finance_owner=TRUE,last_login_at=NOW()
           WHERE id=$4 RETURNING *`,
          [email,displayName,hubOrganizationId,user.id]
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
  let user = db.users.find(item => item.hub_user_id === hubUserId)
    || db.users.find(item => item.hub_organization_id === hubOrganizationId && item.hub_finance_owner === true)
    || null;

  if (!user) {
    const byEmail = db.users.find(item => String(item.email || "").toLowerCase() === email);
    if (byEmail) {
      if (process.env.V79_ALLOW_EMAIL_ACCOUNT_LINK !== "1") {
        throw new Error("An existing FFPRO account uses this email. Explicit account-link migration is required before Hub access.");
      }
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
  user.email=email;
  user.display_name=user.display_name || displayName;
  user.hub_user_id=hubUserId;
  user.hub_organization_id=hubOrganizationId;
  user.hub_finance_owner=true;
  user.last_login_at=new Date().toISOString();
  user.email_verified_at ||= new Date().toISOString();
  user.session_version ||= 0;
  writeDB(db);
  return user;
}
