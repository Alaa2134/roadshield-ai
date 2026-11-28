# Test report — 27 Nov 2026

Everything below was executed in this build environment unless marked **not run**. Re-run
commands are in `SETUP.md`.

## Summary

| Suite | Where | Result |
|---|---|---|
| Database security & citizen workflow (`supabase/tests/database_security_tests.sql`) | local PostGIS 16 with all 19 migrations; GitHub Actions *Web + database* | **42 / 42 passed** |
| Enterprise database (`supabase/tests/enterprise_tests.sql`) | same | **70 / 70 passed** |
| Web end-to-end (Playwright, Chromium, real UI → dev gateway → Postgres with RLS) | local | **30 / 30 passed** |
| Web responsive matrix (12 pages × 1440/1280/1024/768/390 px × EN/AR; no horizontal overflow) | local | **120 / 120 passed** |
| Web unit (i18n parity, no invented claims, money/number formatting) | local + GitHub Actions | **8 / 8 passed** |
| Web typecheck + production build (51 routes) | local + GitHub Actions | **passed** |
| Mobile typecheck (strict) | local | **passed** |
| Mobile Jest (unit, component, integration, i18n parity incl. Field mode keys) | local | **110 / 110 passed** |
| Mobile bundle export (Hermes, Android + iOS) | local | **passed** |
| AI inference service (`services/ai`, pytest) | local | **33 / 33 passed** |
| ML dataset + metrics (`ml/tests`) | local | **9 / 9 passed** |
| Cost-intelligence pipeline (`services/cost-intelligence/tests`) | local | **3 / 3 passed** |
| Detector pipeline smoke test (synthetic fixture) | local CPU | **ran end to end** (see `TRAINING_REPORT.md`) |

## What the suites cover

**Enterprise SQL (E01–E70):** verified-e-mail gate; org creation and slug uniqueness; hashed,
single-use, e-mail-bound invitations; owner-only invites; last-owner protection; contractor-record
requirement; OSM import (invalid geometry skipped, geodesic length, unknowns stay unknown,
idempotent re-import, provenance required); tenant isolation for roads, road detail, imports, cost
items, financials, reviews and the audit log; citizens and platform admins without membership see
no tenant data; offline-idempotent inspections; area from L × W; inspection review rights and
condition update; budget currency guard; four-eyes on budgets; role checks for approvals;
project-approval-needs-budget; unverified unit rates and uncited manual rates rejected;
decimal-exact estimate totals; change orders; work-order state machine; contractor scoping (costs,
budgets, contracts, roads); evidence path validation; tender/benchmark values rejected as actual
cost; invoices capped by commitment; payments only on approved invoices and capped; project
roll-up correctness (all six amounts, remaining, variance); role-based overview (finance block
hidden from inspectors); read-only executives; prediction refusal with < 5 comparables and the exact
IQR result with 5; budget-optimiser strategies and saved scenarios; audit trail; model registry
rules (admin-only training, metrics-before-deploy, provenance transparency); anonymous access denied; month
drill-down limited to finance readers of the same tenant, approved records only, totals equal to
the spending trend, malformed month rejected.

**Interactive checks (Playwright, EN light + AR dark, 27 Nov 2026):** finance period filter updates
the URL and chart; clicking a month lists its real records (3 records in the test tenant, totals
matching the chart; empty month shows an empty state; RTL chart mirrored correctly); map search
finds road segments, flies to one and opens its panel; spend colouring toggles with legend; website
compare slider (keyboard and drag), lightbox zoom and close, 3D model mode switch. No browser errors.

**E2E journeys (web):** public homepage; `/app` redirect; contact form persisted; sign-up →
onboarding → create org; GeoJSON road import; KPI from geometry; contractor registration; project
with road picker; owner invites finance manager (one-time token) → finance joins; budget submit with
four-eyes (no self-approve button) → owner approves → project approved; unit rate add (owner) +
verify (finance); estimate from the verified rate (exact 25,260.00) approved by finance; contract;
work order issued; contractor invited and joins; contractor workspace; contractor cannot browse
roads; contractor starts the work order, logs progress, submits a cost and an invoice, submits the
work; engineer accepts; finance approval queue; overpayment rejected with a clear message; payment
recorded; project KPIs show verified actual and paid separately; budget studio runs; prediction
says "insufficient verified data"; CSV export; a second org gets 404 on the project and an empty
export; Arabic RTL + dark theme; 390 px without horizontal scroll; no uncaught browser errors.

## Not run / limitations (stated plainly)

| Item | Status | Why |
|---|---|---|
| Live Supabase project | migrations applied; anonymous call to `org_overview` returns `permission denied` | SQL suites not run against live data (they create and roll back test users) |
| E2E against real Supabase Auth/Storage | **not run** | Uses the test-only dev gateway (PostgREST/GoTrue subset, no Storage) |
| Mobile on device / simulator (iOS, Android) for the new Field mode | **not run** | No macOS/Xcode or Android emulator in this sandbox. Android emulator smoke tests run in GitHub Actions on `main`; a branch dispatch could not be triggered from this session (integration lacks Actions write permission) |
| Real New Damietta road import | **not run** | `overpass-api.de` refused by the session proxy |
| Detector trained on RDD2022 | **not run** | Dataset and pretrained weights not downloadable here; no GPU |
| Cost ML on real data | **not run** | No verified completed projects exist yet |
| `expo-doctor` | 18/20 locally; package-version check fixed | The remaining two checks need network access to Expo/React Native Directory (they pass in CI when reachable) |
| Screen-reader audit, manual device checklist | **not run** | Requires devices; see `docs/TESTING.md` §manual checklist |
