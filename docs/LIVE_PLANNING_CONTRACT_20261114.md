# FFPRO planner integration production baseline and staging scope

Deployed fire-finance-app build/server.cjs matches source entitlement-worktree build:
SHA256 a3fd55a72610b2a634444ce7a84ce8b75634d86afcc965f7e9bf4d8af2f66e85.
Compared FFPRO deployed source map content hashes against three local source files:
- server/routes/tiquetGateway.js: exact
- server/routes/projects.js: exact
- server/projectsDb.js: exact

This isolated review branch is based on FFPRO2-entitlement-dev HEAD 71cdde7, preserving FFPRO2 main with 79 WIP paths and the entitlement worktree with 5 untracked paths.
Pure tests: 7/7 PASS (account linking, Hub entitlements, session expiry).
Current internal Tiquet gateway handles payments, not approved-ticket project planning.
Current shared /api/projects project types event/trip/startup require a user session.
DO NOT reuse user-session credentials or put generic Tiquet work into a mismatched FFPRO project model.
New work needs tenant-bound authenticated service endpoint, durable project idempotency,
review callback and explicit client-visible attachments, deposit selection and project closure.
Do not change the existing payment ledger / unique Tiquet paid event logic.
See /home/firelion/v79-integration-review-20261114/READINESS.md.
No production deploy, PR, GitHub push, database migration or live data writes.
