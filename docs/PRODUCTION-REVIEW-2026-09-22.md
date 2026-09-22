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

The original review passed GitHub CI, including PostgreSQL integration tests, Docker build and a running production-container smoke test (run 35711910355). PR #13 was merged as `691161b`. Each subsequent revision must pass these gates before release. Existing production data, reverse proxy, SMTP delivery, Google consent, device notifications, load and disaster recovery cannot be validated from this checkout.

Financial outputs are planning estimates, not audited financial statements. Income tax, VAT cash settlement, receivables/payables, detailed manufacturing bills of materials, post-Year-1 replacement capital expenditure and exact calendar loan-payment allocation are not implemented in this model. These limitations are now disclosed in both report formats. Import tariff presets still require classification and current-rate verification; no blanket claim of statutory accuracy is made.

Reference checks: [IFRS property plant and equipment guidance](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/module-17.pdf) and [Saint Lucia Government levy guidance](https://www.govt.lc/news/ird-to-implement-health-and-citizen-security-levy). These support reviewing depreciation and tax terminology; they do not certify the app or the tariff presets.

## Upgrade safely

1. Back up PostgreSQL, deployment environment and the existing encryption key, and test restore separately.
2. Review and merge the pull request after CI passes. Deploy the entire revision, preserving existing data, secrets and volumes.
3. Rebuild with `docker compose up -d --build`; verify `/api/health` and the acceptance checks in `PRODUCTION-READINESS.md`.
4. Compare an existing goods plan and a service plan against their source quotations. Corrected financial totals may differ from previous exports.
5. Keep the prior image and database backup for rollback. Do not delete the PostgreSQL volume.

## Follow-up: loan coverage and repayment edge cases

- A year without debt payments now has a null DSCR and “not applicable” status, instead of the fabricated 99x/strong result. Forecasts preserve the actual EBITDA numerator even during full deferral; scenario comparisons omit undefined ratios.
- Legitimate ratios above 50x display normally. Coverage screening compares the unrounded ratio, avoiding false upgrades at 1.00x, 1.25x and 1.50x boundaries.
- The repayment formula remains stable for very small positive rates. Post-deferral payments use the same cent-rounded capitalized balance as the actual schedule.
- The loan panel uses borrower-facing wording, a wrapping header, an accessible expand/collapse control, and lender-supplied rate/term guidance. Scenario profit labels explicitly say before tax.
- Local validation: TypeScript, production build and all 81 tests passed, including five additional regression tests for these cases. Chromium checks at 1440px and 390px passed for high-ratio and deferred-payment display, expand/collapse, and horizontal overflow. Visual review found and corrected the clipped mobile schedule toolbar. Deployment-dependent limitations above still apply.
