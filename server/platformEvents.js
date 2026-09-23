import crypto from "node:crypto";
import { pool } from "./db.js";

let flushing = false;

function config() {
  return {
    url: String(process.env.V79_HUB_EVENT_URL || "").trim(),
    secret: String(process.env.V79_HUB_EVENT_SECRET || "").trim(),
  };
}

export function platformEventsConfigured() {
  const { url, secret } = config();
  return Boolean(url && secret.length >= 32);
}

function sign(body, timestamp) {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonical = ["POST", "/api/platform/events", timestamp, bodyHash].join("\n");
  return crypto.createHmac("sha256", config().secret).update(canonical).digest("hex");
}

function hourBucket(date = new Date()) {
  return date.toISOString().slice(0, 13).replace(/[-T:]/g, "");
}

export async function queueFinanceSnapshotEvent(client, userId, version, data) {
  const now = new Date();
  const id = `finance.snapshot:${userId}:${hourBucket(now)}`;
  const payload = {
    version,
    transactionCount: Array.isArray(data?.transactions) ? data.transactions.length : 0,
    savingGoals: Array.isArray(data?.savingGoals) ? data.savingGoals.length : 0,
    investmentGoals: Array.isArray(data?.investmentGoals) ? data.investmentGoals.length : 0,
    budgets: data?.categoryBudgets && typeof data.categoryBudgets === "object" ? Object.keys(data.categoryBudgets).length : 0,
  };
  await client.query(
    `INSERT INTO platform_event_outbox
      (id, user_id, event_type, occurred_at, payload_json, status, attempts, next_attempt_at, created_at)
     VALUES ($1,$2,$3,$4,$5,'pending',0,$6,$7)
     ON CONFLICT (id) DO NOTHING`,
    [id, userId, "finance.snapshot.updated", now.toISOString(), JSON.stringify(payload), now.toISOString(), now.toISOString()]
  );
  return id;
}

async function deliver(row) {
  if (!platformEventsConfigured()) return "disabled";
  let payload = {};
  try { payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : (row.payload_json || {}); } catch {}
  const event = {
    id: row.id,
    type: row.event_type,
    version: 1,
    occurredAt: new Date(row.occurred_at).toISOString(),
    organizationRef: String(row.user_id),
    subjectId: String(row.user_id),
    payload,
  };
  const body = JSON.stringify(event);
  const timestamp = String(Date.now());
  try {
    const response = await fetch(config().url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-v79-service-id": "ffpro",
        "x-v79-timestamp": timestamp,
        "x-v79-signature": sign(body, timestamp),
      },
      body,
      signal: AbortSignal.timeout(7000),
    });
    if (response.ok) return "sent";
    if (response.status === 409 || response.status === 429 || response.status >= 500) return "pending";
    return "failed";
  } catch {
    return "pending";
  }
}

export async function flushPlatformEvents() {
  if (flushing || !platformEventsConfigured()) return;
  flushing = true;
  try {
    const now = new Date().toISOString();
    const { rows } = await pool.query(
      `SELECT id,user_id,event_type,occurred_at,payload_json,attempts
       FROM platform_event_outbox
       WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
       ORDER BY created_at ASC LIMIT 25`,
      [now]
    );
    for (const row of rows) {
      const state = await deliver(row);
      if (state === "sent") {
        await pool.query(
          "UPDATE platform_event_outbox SET status='sent',sent_at=$1,last_error=NULL WHERE id=$2",
          [new Date().toISOString(), row.id]
        );
      } else if (state === "failed") {
        await pool.query(
          "UPDATE platform_event_outbox SET status='failed',attempts=attempts+1,last_error=$1 WHERE id=$2",
          ["Permanent rejection from V79 Hub", row.id]
        );
      } else if (state === "pending") {
        const attempts = Number(row.attempts || 0) + 1;
        const delay = Math.min(30 * 60 * 1000, 30 * 1000 * (2 ** Math.min(attempts - 1, 6)));
        await pool.query(
          "UPDATE platform_event_outbox SET attempts=$1,next_attempt_at=$2,last_error=$3 WHERE id=$4",
          [attempts, new Date(Date.now() + delay).toISOString(), "Delivery deferred", row.id]
        );
      }
    }
  } finally {
    flushing = false;
  }
}

export function wakePlatformEventPump() {
  setImmediate(() => flushPlatformEvents().catch(err => console.warn("[V79 Hub Events] FFPRO flush failed:", err?.message || err)));
}

export function startPlatformEventPump() {
  setInterval(() => {
    flushPlatformEvents().catch(err => console.warn("[V79 Hub Events] FFPRO periodic flush failed:", err?.message || err));
  }, 60 * 1000).unref();
  setTimeout(() => {
    flushPlatformEvents().catch(err => console.warn("[V79 Hub Events] FFPRO startup flush failed:", err?.message || err));
  }, 5000).unref();
}
