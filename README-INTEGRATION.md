# V79Tiquet → FFPRO2 Gateway Integration (FFPRO2 side)

When a job in V79Tiquet is marked **Paid**, it POSTs an event to this endpoint,
which records it as income under **V79D — Vision79 Digital** using FFPRO2's
existing transaction system — no new ledger, no new sync system.

## Changed / new files

| File | What changed |
|---|---|
| `server/db.js` | Added `gateway_connections` and `gateway_events` tables |
| `server/routes/gateway.js` | **New.** Settings CRUD + the inbound webhook |
| `server.ts` | Mounted the gateway router; added rate limiting/CSRF hardening for it |
| `server/index.js` | Same mounting, for consistency (this file is currently unused by the Docker build — `server.ts` is the real entry point, see the note left in an earlier session) |
| `src/services/gatewayService.ts` | **New.** Client wrapper for the Settings UI |
| `src/components/Settings.tsx` | Added a "V79Tiquet Gateway" section to the existing Gateways tab |
| `env.example` | Documents `TIQUET_GATEWAY_SECRET` |
| `docker-compose.yml` | Passes `TIQUET_GATEWAY_SECRET` from your `.env` into the container — **without this the container never sees the secret**, since this compose file uses an explicit `environment:` allowlist rather than `env_file:` |

## Required environment variable

Add to your real `.env` (not `env.example` — that stays a placeholder):

```
TIQUET_GATEWAY_SECRET=<same value as V79Tiquet's FFPRO_GATEWAY_SECRET>
```

Generate it with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

It must be the **exact same value** on both sides — this is a shared secret,
not a public/private keypair.

## Database migration

None required manually. The two new tables are created automatically on
boot via the existing `CREATE TABLE IF NOT EXISTS` pattern in `server/db.js`
— same mechanism every other table in this app already uses. Just deploy
and restart; no `migrate` command, no manual SQL.

```sql
-- For reference, what gets created automatically:
CREATE TABLE gateway_connections (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  workspace_number VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, provider),
  UNIQUE (provider, workspace_number)  -- the anti-cross-tenant guarantee
);

CREATE TABLE gateway_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  workspace_number VARCHAR(255) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id VARCHAR(255),
  amount NUMERIC(14,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, workspace_number, external_id)  -- the idempotency guarantee
);
```

**Known limitation, inherited from the existing codebase, not introduced by
this change:** the webhook handler uses `pool.connect()` for a transactional
row-lock (matching the exact pattern already used by `PUT /api/data`). That
only works in real-Postgres mode — the file-fallback mode (`hasPostgres ===
false`) does not support it, same as the existing `/api/data` PUT route
already didn't. Your deployment runs on real Postgres, so this doesn't
affect you.

## API endpoint

```
POST /api/gateway/webhooks/tiquet/paid
```

**Auth:** shared-secret header, not a session cookie (this is server-to-server):
```
X-Gateway-Secret: <TIQUET_GATEWAY_SECRET>
```

**Body:**
```json
{
  "eventId": "uuid-generated-by-tiquet",
  "workspaceNumber": "the-tiquet-account_id",
  "jobId": "tiquet-job-id",
  "jobTitle": "optional, job.title",
  "amount": 1337.42,
  "currency": "USD",
  "paidAt": "2026-08-23T18:00:00.000Z",
  "paymentReference": "optional",
  "customer": { "name": "optional client name" }
}
```

**Responses:**
- `201 { ok: true, transactionId }` — created
- `200 { ok: true, alreadyProcessed: true }` — duplicate delivery, no new transaction
- `400` — validation failure (bad amount, missing fields, etc.)
- `401` — bad/missing shared secret
- `404` — `workspaceNumber` isn't registered to any FFPRO2 account, or is disabled
- `503` — `TIQUET_GATEWAY_SECRET` isn't configured on this server at all

Settings CRUD (session-cookie authenticated, used by the Settings UI):
```
GET    /api/gateway/connections/tiquet
PUT    /api/gateway/connections/tiquet   { workspaceNumber, enabled }
DELETE /api/gateway/connections/tiquet
```

## Gateway configuration (what the user does)

1. Open V79Tiquet → Settings → **Integrations**, copy the **Workspace Number** shown there (that's V79Tiquet's own `account_id` — nothing new to generate).
2. Open FFPRO2 → Settings → **Gateways** → **V79Tiquet Gateway**.
3. Paste the Workspace Number, click **Connect**.
4. "Last Event Received" stays empty until a real job is actually marked paid — that's the real end-to-end confirmation, not a synthetic ping.

## Authentication method

Two independent layers, deliberately not conflated:
1. **Shared secret** (`X-Gateway-Secret`) proves the request came from a trusted V79Tiquet server. This is checked with `crypto.timingSafeEqual` — the exact same pattern V79Tiquet's own `website2026` intake webhook already uses.
2. **`workspace_number` lookup** decides *which* FFPRO2 account receives the income. The secret alone never grants access to a specific account — a valid secret with an unregistered or disabled workspace number is rejected. The `UNIQUE (provider, workspace_number)` DB constraint means a workspace number can only ever resolve to one account, decided by whoever registered it in their own Settings, never by the inbound request.

## Testing

Full instructions with real curl commands are in the top-level integration
notes, but in short — this was tested against a real, running Postgres +
FFPRO2 instance, not just reviewed:

```bash
# 1. Configure the connection
curl -b cookies.txt -X PUT http://localhost:3010/api/gateway/connections/tiquet \
  -H "Content-Type: application/json" \
  -d '{"workspaceNumber":"<tiquet-account-id>","enabled":true}'

# 2. Simulate a paid event
curl -X POST http://localhost:3010/api/gateway/webhooks/tiquet/paid \
  -H "Content-Type: application/json" \
  -H "X-Gateway-Secret: <TIQUET_GATEWAY_SECRET>" \
  -d '{"eventId":"evt-1","workspaceNumber":"<tiquet-account-id>","jobId":"job-1","jobTitle":"Test Job","amount":100,"currency":"USD","paidAt":"2026-08-23T00:00:00.000Z"}'

# 3. Resend the exact same event — must return {"ok":true,"alreadyProcessed":true}, not a second transaction
```

Verified during development:
- Real end-to-end run (real V79Tiquet job → real `pay-final` → real income appearing in FFPRO2), not just this endpoint in isolation
- Duplicate delivery → no duplicate transaction
- Wrong secret → 401; unknown/disabled workspace → 404; invalid amount → 400
- Two different FFPRO2 accounts cannot register the same `workspace_number` (DB constraint, confirmed by testing it directly, not just written)
- Non-paid status transitions (in-progress, review, invoiced, completed) never reach this endpoint at all

## Docker considerations

No Dockerfile changes needed — `COPY . .` + the existing `npm run build` (which bundles `server.ts` and everything it imports via esbuild) already picks up `server/routes/gateway.js` automatically. Confirmed by inspecting the compiled `dist/server.cjs` for the new route code.

The `docker-compose.yml` change (passing `TIQUET_GATEWAY_SECRET` through) **is required** — without it the container silently never receives the secret and every webhook call gets a 503, even with the var correctly set in your `.env` file on the host.
