# FFPRO-Tiquet planning - isolated staging release
Source implemented. Unit tests, builds, TypeScript and 22 PostgreSQL E2E checks PASS. NOT DEPLOYED.

## Contract
- Signed Tiquet approved-quote event creates one tenant-bound FFPRO service project.
- Authenticated owners/editors can send completed plans to Tiquet Review with selected documents.
- Reviewer-selected database-backed files become immutable SHA256 grants. Unselected files are never served.
- The separate file gateway requires service secret, organisation, job and project identities, and returns downloads only.
- Review callback and project closure use durable outboxes and idempotent state transitions; invoicing does not mean payment.

## Configuration (names only; no secrets)
FFPRO: TIQUET_PLANNING_GATEWAY_SECRET, TIQUET_PLANNING_CALLBACK_URL, TIQUET_PLANNING_CALLBACK_SECRET.
Tiquet: FFPRO_PLANNING_GATEWAY_URL, FFPRO_PLANNING_GATEWAY_SECRET, FFPRO_PLANNING_CALLBACK_SECRET.
Separate secrets must be >= 32 bytes, distinct from production payments/Hub SSO, and managed securely.

## Release blockers
Real-user/browser staging acceptance outstanding; frontend feature parity between live bundles and staged source not yet proved.
Production schema migration, off-host backup and rollback rehearsal are still required.
No GitHub push, merge, customer data change or production deployment performed.
