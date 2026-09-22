# Production review 22 September 2026

Base: `34e25c9` on `main`. This change fixes reproducible defects. It does not certify that every workflow, external integration or financial scenario is correct.

## Corrected behaviour

- Clean installation: repaired missing platform dependencies in the npm lockfile; Docker consistently uses `npm ci`.
- Deployment: server bundle and source map are in private `build/`, separate from public `dist/`. Docker, start command and documentation agree. Production defaults to port 3010.
- Configuration: both environment templates include the required PostgreSQL password and deployment settings. Backup guidance covers PostgreSQL, encryption keys and file artifacts.
- Financial consistency: goods, services and hybrid reports use the forecast engine. Goods use product-specific unit costs; legacy pricing excludes sales taxes from revenue. Explicit zero entries remain zero.
- Inventory: initial purchases are counted once; pooled unit cost is quantity-weighted. Replenishment and closing inventory value reconcile under the stated planning model.
- Financing: capitalised fees increase the debt balance without creating cash proceeds. Forecast currency conversion includes financing and starting cash. DSCR numerator and denominator reflect the same annual forecast.
- Equipment: cumulative monthly depreciation stops at the depreciable base and correctly continues into the final partial year for later purchases.
- Exports: sanitised print HTML, escaped metadata, accessible modal, stable hook ordering on close/reopen, monthly cash-flow schedule, model assumptions, cents in financial tables, repeating table headers, and explicit profit-before-tax labels. Removed unsupported automatic commercial viability claims.
- Usability: clear sign-in and project wording, larger login text, no unconfigured Google setup prompt for ordinary users, visible keyboard focus and reduced-motion support. The logo is unchanged.
- Performance: Word export is loaded on demand. Planner bundle fell from approximately 1,190 kB to 818 kB uncompressed (291 kB to 185 kB gzip). Large chunks remain.

## Verification

- Reinstalled with `npm ci`, TypeScript check, 72 automated tests and production build passed.
- `npm audit --omit=dev`: zero reported vulnerabilities at review time.
- Regression tests cover inventory, fees, depreciation, currency conversion, explicit zero values, product costs, model switching and sales-tax exclusion.
- Existing integration tests cover authentication, CSRF, file isolation, concurrent state saves, token consumption, invitations and session revocation using the development database.
- Sample Word report generated and rendered; all six pages reviewed for table readability and clipping.
- Chromium desktop/mobile checks passed for login, export preview, PDF generation, close/reopen, Escape dismissal and horizontal overflow, with no page errors. GitHub CI results are recorded in the pull request.

## Deployment acceptance still required

The local container has no usable PostgreSQL or Docker service. GitHub CI is configured to run PostgreSQL integration tests and build Docker. Check its result before release. Existing production data, reverse proxy, SMTP delivery, Google consent, device notifications, load and disaster recovery cannot be validated from this checkout.

Financial outputs are planning estimates, not audited financial statements. Income tax, VAT cash settlement, receivables/payables, detailed manufacturing bills of materials, post-Year-1 replacement capital expenditure and exact calendar loan-payment allocation are not implemented in this model. These limitations are now disclosed in both report formats. Import tariff presets still require classification and current-rate verification; no blanket claim of statutory accuracy is made.

Reference checks: [IFRS property plant and equipment guidance](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-17.pdf) and [Saint Lucia Government levy guidance](https://www.govt.lc/news/ird-to-implement-health-and-citizen-security-levy). These support reviewing depreciation and tax terminology; they do not certify the app or the tariff presets.

## Upgrade safely

1. Back up PostgreSQL, deployment environment and the existing encryption key, and test restore separately.
2. Review and merge the pull request after CI passes. Deploy the entire revision, preserving existing data, secrets and volumes.
3. Rebuild with `docker compose up -d --build`; verify `/api/health` and the acceptance checks in `PRODUCTION-READINESS.md`.
4. Compare an existing goods plan and a service plan against their source quotations. Corrected financial totals may differ from previous exports.
5. Keep the prior image and database backup for rollback. Do not delete the PostgreSQL volume.
