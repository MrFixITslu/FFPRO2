# FFPRO workspace review — 27 October 2026

Source candidate only. Production FFPRO image/config/source parity has not been supplied. No deployment, merge, database, encryption-key or finance-record change is claimed.

## Three approaches and REDTEAM
1. Colours/logo only: smallest cosmetic change, but preserves hidden tablet navigation, hover disclosure and misleading saved-state tooltips.
2. Selected: improve the existing frontend around shared Vision79 workspace tokens and existing handlers. Light default, stored dark preference, navy navigation, blue primary controls and a distinct finance growth-chart symbol.
3. Full rebuild: unnecessary finance-sync/identity risk and would discard unknown installed overlays.

REDTEAM findings addressed:
- Header contained too many tiny controls and no shared workspace hierarchy. Added labelled/sidebar navigation, readable toolbar controls, keyboard skip link, section titles and visible primary actions. Main financial metrics precede the existing review-first import area; Import Statement still reaches that area.
- Hamburger was visible on tablet while its drawer was hidden by `md:hidden`. A concise accessible workspace menu works at all sizes, restores focus, traps keyboard focus and supports Escape. Existing navigation/action handlers are retained.
- Explicit privacy mode previously removed its blur on hover. It now masks immediately and remains masked until explicitly disabled. This is a visual privacy feature, not an authorisation boundary.
- Sync tooltip previously said Cloud Synced even with pending/failed changes. Toolbar descriptions and labels distinguish saving, unsaved, failed and saved states.
- Badge refresh reset the page title. Presentation-only `setWorkspaceTitle` now preserves the section identity with the unread prefix.
- Safe Spend label implied an unqualified safe amount; its unchanged formula divides liquid funds by days to the next cycle and does not deduct unpaid commitments. It is labelled Daily spending guide with an explicit estimate note. No finance formula changed.
- Missing briefing structure could dereference nested fields and take down the workspace. Validate display fields before rendering and use the existing error state. Funding/news wording no longer claims unestablished verification/live status.
- Dark heading/control contrast and mobile primary-metric spacing checked in actual React screenshots.

## Compatible dependency corrections
The original installed lockfile audit reported six production advisories: one critical, two high and three moderate. Targeted compatible lockfile updates only; package.json ranges are unchanged:

| Package | Before | After |
| --- | --- | --- |
| body-parser | 1.20.8 | 1.20.9 |
| dompurify | 3.4.15 | 3.4.17 |
| ip-address | 10.7.2 | 10.7.5 |
| multer | 2.4.0 | 2.5.0 |
| nodemailer | 10.0.12 | 10.2.1 |
| qs | 6.16.0 | 6.16.2 |

`npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities. This is dependency-audit scope only, not complete application/container security acceptance.

## Preservation and validation
Base main: eafd786301c990e6b855b77dafb5d3eb5b9b932e. This is a source review base, not a claim it matches the running image.

Unchanged: server.ts, server modules, authService, dataSyncService, checkpointService, stateMerge, finance schema/types and Compose. Byte comparison confirms App finance/sync and financial edit handlers unchanged. Only badgeService's section-title presentation changed within existing services. Six dependency versions intentionally changed.

Local: 107 tests PASS after dependency corrections; TypeScript lint and production build PASS; production dependency audit zero. Four focused tests cover saved/unsaved/failed/saving labels, stored-appearance fallback, accessible navigation/chrome and rejection of malformed briefings. Existing encryption/restore/SSO evidence is retained; no production rehearsal repeated.

New browser workflow runs the actual built React UI at 1440px, 900px and 390px in light/dark, five main sections plus Analysis, transaction dialog and failed account load. It checks overflow, working tablet navigation, focus/Escape, persistent appearance, privacy masking on hover, import CTA, malformed news isolation and no ledger/provider mutations. API fixtures, notification-count POST and realtime transport are explicitly synthetic; external office/font engines are excluded from this isolated review. This is not real Hub SSO, encryption, multi-user financial correctness or provider acceptance. Current workflow results must be read from the PR; a screenshot test cannot approve a deployment.

## Release dependencies
- Confirm exact current installed FFPRO image, source/config and runtime overlays before building or promoting a candidate. Existing mixed encryption-key/role gates must not be silently bypassed.
- Retain accepted data, encryption keys, Hub session protections and running configuration; never deploy generic main simply because source CI passes.
- Apply the UI and compatible dependency update to the reconciled runtime, then check only affected live journeys and the new appearance. Production remains unchanged in this review.
- POS is owner-reported deployed and working; its review PR was updated with this bounded confirmation, without inventing a new installed-image fingerprint.
