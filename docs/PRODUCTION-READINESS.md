# FFPRO2 remediation and deployment guide

Prepared 2026-09-15 against main commit `cdca9017e53bc74d761656f562cf309f02433a60`.

This branch addresses the production-readiness audit. It is a reviewed change set, not a guarantee that every possible defect is eliminated. Do not deploy by replacing only App.tsx: the client, server, dependencies and database changes belong together.

## Changes by priority

| Priority / audit finding | Changes and files | Operational requirement or limitation |
| --- | --- | --- |
| Critical F01: unauthenticated file access | `server/routes/files.js`, `server/filesDb.js`, `server/fileAccess.js`: authentication, owner/project membership checks, write roles and quotas | Legacy files without an owner are deliberately inaccessible. Recover ownership only from verified backups or project records. |
| Critical F02: global AI endpoint takeover | `server/services/ollamaService.js`, `server/routes/ai.js`: immutable administrator configuration, authenticated inference, no automatic endpoint discovery, bounded queue and timeout | Configure a trusted `OLLAMA_BASE_URL` on the server. |
| High F03: stored/active HTML | File allowlist/signatures, forced attachment downloads and sandbox CSP; DOMPurify in `DocumentEditor.tsx` and `ExportBusinessPlanModal.tsx` | Verify old documents before redistributing them. Active HTML/SVG uploads are unsupported. |
| High F04: account and invitation hijacking | `server/securityStore.js`, `server/passport.js`, invitation routes: mailbox verification, no automatic email-based provider linking, atomic invite consumption and expiry | Existing users sign in with their password before linking Google. Password reset also proves email ownership. SMTP must work. |
| High F05/F06: bearer tokens, CSRF and OAuth state | Cookie-only sessions, narrowly scoped CSRF fetch support in `src/services/apiFetch.ts`, exact-origin checks and OAuth state/PKCE | Existing sessions are intentionally invalidated on upgrade. Apple sign-in is disabled until a separate state-verified form-post implementation is supplied. Google/Facebook and password login remain available when configured. |
| High F07/F08: recovery and session invalidation | Canonical recovery origin, no recovery/invite bearer links in app logs, one-time reset consumption and session-version revocation | Reverse-proxy access logs must also omit query strings. Preserve existing encryption keys. |
| High F09/F10: sync corruption and false success | `src/utils/stateMerge.ts`, App, IndexedDB checkpoints, data API: three-way conflict detection, preserved deletions/zero balances, optimistic concurrency, serialized first writes, versioned ledger reset, explicit errors | Conflicting edits require review; the resolution action first downloads the local copy. Reset affects the personal ledger, not shared projects or documents. |
| High F11: simulated bank sync | Manual bank-account form; bank/investment/Lucelec API placeholders return clear unavailability and cannot fabricate ledger entries | Real bank connectivity needs an approved provider integration. Previously generated sample transactions cannot safely be identified or deleted automatically. |
| High F12/F13: unreproducible build and database fail-open | Exact `npm ci`, CI, startup validation, PostgreSQL readiness, no production JSON fallback, Express async-error handling and graceful shutdown | Production requires PostgreSQL. JSON storage is for local development only. |
| High F14/F16: resource and deployment exposure | 10 MiB single-file limit, per-user quota, bounded AI queue, verified DB TLS, non-root container and isolated DB network | Existing bind-mounted keys must be readable by container UID 1000. Never expose PostgreSQL or use the former default password on a new installation. |
| Medium F15: Calendar/Gmail | `server/calendarTime.js`, Google routes/services: correct scopes, per-account identity, pagination, explicit timezone and invalid-date handling | Reconnect Google to grant Calendar event writes. Provider consent/token delivery requires live acceptance testing. |
| Medium F17: dependencies | Updated dependency ranges and lockfile, removed vulnerable scheduler dependency chain; CI audit gate | Repeat `npm audit` over time; advisories change. |
| Medium F18: frontend size and main-thread storage | Lazy-loaded Dashboard, planner, Calendar, Settings, projections and funding; debounced IndexedDB checkpoints; server market-data cache | Large planner chunks and original logo assets remain candidates for further optimization. This is not a complete performance redesign. |
| Medium F19: usability/accessibility | Browser zoom enabled; focused/named keyboard dialogs for settings, transactions, bank entry, document editing and quote import; clearer reset/backup/password flows | Broader screen-reader and mobile-device acceptance testing is still appropriate. |
| Medium F20: closed-app notifications | `server/push.js`, notification API and `PushSettings.tsx`: opt-in browser subscription, endpoint allowlist, per-device timezone, daily due-item scheduler, expired-subscription cleanup | Requires VAPID keys, HTTPS and a supporting browser; delivery is best effort. Covers saved personal calendar items and recurring due dates, not background Gmail polling. |
| High F21: quote totals | `shared/quoteMath.js`, quote importer and Ollama normalization: fractional quantities, explicit overlength rejection, reconciliation gate, freight and cent-exact global discount allocation | Review AI extraction against the source document. Add missing tax as a reviewed line. Quotes over 10,000 extracted characters must be split deliberately. |

Additional fixes: backup export now reads the current account state; restore validates an allowlisted legacy/new schema and saves through versioned API. The password-settings button uses the real recovery flow. Market data no longer fabricates missing prices using AI or hardcoded quotes. Printed business plans sanitize user text before rendering.

## Before upgrading an existing deployment

1. Export your personal ledger from the current app. Back up the PostgreSQL database, the existing `data/encryption.key` (or exact `DATA_ENCRYPTION_KEY`) and your deployment `.env`. Protect these backups. **Never generate a replacement data key for existing encrypted data.**
2. Keep the existing database volume `ffpro2_pgdata`. Do not run `docker compose down -v`. The startup migration adds verification/session-version columns and notification/verification tables. It does not drop account tables.
3. Confirm there are no duplicate case-insensitive emails before creating the unique index: `SELECT lower(email), count(*) FROM users GROUP BY lower(email) HAVING count(*) > 1;`. Resolve any duplicates deliberately, preserving the correct ownership. Startup fails rather than choosing an account arbitrarily.
4. Set `POSTGRES_PASSWORD` to the **actual current database password**. Changing Compose's environment value does not rotate the password in an existing PostgreSQL volume. Rotate it using PostgreSQL administration and update the app connection together. For new deployments, use a strong hexadecimal password to avoid URL-escaping ambiguity.
5. Set `FRONTEND_URL` to the exact public HTTPS origin, with no path (for example `https://ffpro.v79sl.com`), and a stable random `SESSION_SECRET` of at least 32 characters. Keep your existing data key. For a fresh installation only, generate a data key with `openssl rand -base64 32`.
6. The app now runs as UID 1000. Allow it to read the existing mounted encryption key, or pass the unchanged key through your deployment secret mechanism. Restrict other users' access; do not make the key world-readable.
7. The reverse proxy and app use an existing external Docker network named `proxy_network`. Create that network only if it does not already exist. PostgreSQL now uses the private `database_internal` network. The optional published app port is loopback-only. Route the proxy to `fire-finance-app:3010`, preserve the public Host header, forward HTTPS correctly, and set `TRUST_PROXY_HOPS` to your actual proxy count.
8. Configure SMTP for recovery and verification. Configure Google/Facebook credentials if used. Enable Calendar API access and reconnect Google for the revised scopes. Apple sign-in is not enabled by this patch.
9. For optional background reminders, generate a persistent VAPID pair with `npx web-push generate-vapid-keys`, then configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (your administrator `mailto:` address). Enable reminders explicitly in Settings on each device.

## Install the complete change set

Use the GitHub branch/PR or copy every file in the downloadable `replacement-files` folder to the matching relative path in your app project. Keep your existing `.env`, database and encryption key. The ZIP does not contain secrets or user data.

With Node 22.16 or later:

```sh
npm ci
npm run lint
npm test
npm run build
```

The production entry point is now `build/server.cjs`, outside the public `dist` directory. `npm start` uses it. For Docker, rebuild and restart with `docker compose up -d --build` after setting the required environment values and taking backups.

## Acceptance checks after deployment

- `/api/health` returns 200 with PostgreSQL available and 503 if it becomes unavailable; `/api/live` is process liveness only.
- Sign in, add a transaction and a manual account, reload and confirm both persist. Test two tabs editing the same field; neither should silently overwrite the other.
- Upload a text/PDF document. A different, unauthorized account must not be able to read or delete its URL. Test shared-project viewer/editor roles.
- Receive and consume an email-verification invitation and a password-reset email. An older session must stop working after reset.
- Reconnect Google, create a timed and an all-day event, and compare their date/time with Google Calendar in your timezone.
- Export a backup, inspect its records, then restore in a test account. Import a quote with fractional quantity, shipping and discount and reconcile its total against the original.
- If VAPID is configured, enable browser reminders and verify a due-item notification on a supported device while the app is closed. Disable them and confirm delivery stops for that device.

## Validation record

Local automated checks cover merge conflicts/deletions/zero balances, data schema compatibility, fractional quote math, timezone/DST validation, calendar pagination, cookie-only authentication, CSRF rejection, concurrent saves, file isolation, one-time email/reset tokens, session invalidation, invitation acceptance and push-endpoint validation. GitHub CI additionally runs the integration suite against PostgreSQL 16 and builds the Docker image.

The source-only audit cannot verify your SMTP delivery, external OAuth consent, bank provider credentials, reverse proxy, existing database migration data, device push delivery or production load. Passing tests is not equivalent to confirming these deployment-dependent checks.
