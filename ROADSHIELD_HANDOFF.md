# RoadShield AI — Engineering handoff

Audit date: **27 Nov 2026** (UTC, afternoon). Everything below was checked against the repository,
GitHub, the live Supabase project or a local run in this session. Anything not verified is marked
**not verified**. Nothing here is a performance or deployment claim beyond the evidence cited.

> Committed on 28 Nov 2026 at the owner's request. The original 27 Nov audit follows the update section.

---

## Update — 28 Nov 2026 (supersedes older figures below where they differ)

| Item | Current value | Evidence |
|---|---|---|
| Branch / HEAD | `claude/roadshield-ai-production-u7mtac` at `cb9146a` (32 commits after `f02e5cb`) | `git log` |
| PR #1 | open, draft, no conflicts with `main` (`38ddb9a`) | GitHub API |
| Live Supabase | **26 migrations applied** (through `20261127101100`), all 42+ public tables RLS-enabled, http helper extension removed | `schema_migrations`, `pg_tables` |
| Platform admin | the owner's account has `user_roles.role = 'admin'` (needed to review organization verification) | live query |
| Live organizations | 1 (`test-test`, created by the owner on 27 Nov, marked verified by the migration's grandfather rule) | live query |
| Public website | **live**: https://roadshield-ai-eg.vercel.app (HTTP 200, real homepage) — deployed by the owner | Vercel fetch |
| Vision API | **live**: https://roadshield-vision-api.vercel.app/health → `model_loaded=true`, `auth_configured=true`, `signing_configured=true`, face detector `opencv-haar-frontal` (SSD not loaded) | Vercel fetch |
| Android APK (current code) | CI builds on the PR branch; build #16 (`fda5845`, points at the live Vision API) **build + emulator smoke test passed** — artifact on the run page, not a Release | [run 46074282282](https://github.com/Alaa2134/roadshield-ai/actions/runs/46074282282) |
| iOS | still only the old 1 Nov unsigned IPA | releases |

**Security / integrity fixes since the first handoff (all on the branch, all applied live):**
* `100800` — `accept_invitation`: inviter must still be an owner; acceptance never changes an existing member's role (no last-owner demotion). SQL E10x–E10g.
* `100900` — `review_invoice` locks the contract row; two simultaneous approvals can no longer exceed the commitment. Proven with `supabase/tests/invoice_concurrency.sh` (also in CI): old code approved 120 on a 100 contract, fixed code rejects the second with `EXCEEDS_COMMITMENT`.
* `101000` — serialized owner transitions; `supabase/tests/last_owner_concurrency.sh` (in CI) leaves exactly one owner.
* `da66db2` — Field mode never silently drops a missing evidence photo (`EVIDENCE_PHOTO_MISSING`, user-visible “remove missing photos and send”). Jest 120/120.
* `20e023d`/`99a55cb` — RDD2022 near-duplicate grouping no longer leaks across hash buckets; `ml/tests` (11) now run in CI.
* `101100` — **organization verification + jurisdiction** (see `docs/SECURITY.md`): new orgs start `pending`; every write RPC raises `ORG_NOT_VERIFIED` until a platform admin approves; owner picks governorate (27 seeded, ISO 3166-2:EG) and a city/district or requests a new one; private verification documents (official letter + authorization required); admin queue `/app/admin/verifications` with signed document links, reject needs a reason, reviewer may not belong to the org; suspend/reinstate.

**Test results at `cb9146a` (run in this session):** security SQL 42/42 · enterprise SQL 97/97 · owner concurrency 2/2 · invoice concurrency 1/1 · web E2E 38/38 · web unit 8/8 · web build OK · mobile tsc OK · mobile Jest 120/120 · ML 11/11 (at `1019268`).

**Still open (owner / device):**
1. Supabase Auth URL configuration (Site URL is `localhost:3000`; add `roadshield://**` and the website origin). Dashboard only.
2. Leaked-password protection is disabled (Supabase advisor) — dashboard toggle.
3. Real-phone tests: AI analysis end to end, report submission, Field mode, Liquid Glass/native tabs on iOS.
4. iOS build of current code (merge PR #1 or run `ios-build.yml` from the branch).
5. Homepage design pass (Gate 1) — not done.
6. Detector training on real RDD2022 (Colab/Kaggle notebooks ready, resumable) — not run.

## 0. Snapshot

| Item | Value | Evidence |
|---|---|---|
| Repository | `Alaa2134/roadshield-ai` (public) | `gh api repos/Alaa2134/roadshield-ai --jq .private` → `false` |
| Working branch | `claude/roadshield-ai-production-u7mtac` | `git branch --show-current` |
| HEAD | `f02e5cbe165c5e67047c87e9dd8e3b66534fa8ed` | `git rev-parse HEAD` |
| Uncommitted changes | none (except this file) | `git status --short` |
| Ahead of `main` | 10 commits, 226 files, +19,104 / −877 | `git rev-list --count origin/main..HEAD`, `git diff --stat` |
| `main` HEAD | `becea2d` (1 Nov 2026) | `git log origin/main -1` |
| Pull request | [#1](https://github.com/Alaa2134/roadshield-ai/pull/1) — open, **draft**, `mergeable_state=clean` | GitHub API |
| CI on HEAD | web ✅, database ✅, mobile ✅, ai-service ✅ | [CI run](https://github.com/Alaa2134/roadshield-ai/actions/runs/46021311354), [Web + database run](https://github.com/Alaa2134/roadshield-ai/actions/runs/46021311343) |
| Live Supabase | project `roadshield-ai` (`vdfvoxvkxicemgqrsxjh`, eu-central-1), **ACTIVE**, 22 migrations recorded | Supabase MCP `get_project`, `schema_migrations` |
| Public web URL | **none** (web app not deployed) | see §6 |
| Installable builds of the *current* code | Android arm64 APK built locally (not published); **no** current IPA | see §6 |

Commits on the branch (newest first):

```
f02e5cb Restrict enterprise RPCs to signed-in users; record live migration status
44a7775 Web: interactive map, finance drill-down, 3D road layers, photo lightbox and compare slider
2cea39f Mobile: native tabs (Liquid Glass on iOS 26), glass controls, map hero, image interactions
039c529 Website: real road photography with real RoadShield Vision output
e823408 Docs: README, training/test reports, checklist, screenshots; studio keeps funding value
7aa360f Align Expo SDK 58 packages with expo-doctor's expected versions
16b40ba ML pipeline, cost intelligence, docs; branch APK builds keep artifacts only   (CI failed: expo-doctor; fixed in 7aa360f)
e8a8b5b Mobile: Field mode for engineers, inspectors and contractors
ecd8d11 RoadShield Web: public website + RoadShield OS enterprise dashboard (Next.js 16)
1ffa5d4 Enterprise multi-tenant schema: orgs, roads, projects, finance ledger, prediction, optimizer, model registry
```

Everything before `1ffa5d4` (the citizen app, AI service, original schema) was already on `main`.

---

## 1. Implementation

Legend: **Working** = implemented and exercised by tests or a real run · **Partial** = implemented
but not verified on the target platform, or missing a piece · **Mock/Illustrative** = deliberately
non-real, labelled as such in the UI · **Not implemented**.

### 1.1 Mobile app (iOS + Android, one Expo codebase)

Stack: Expo SDK 58 (`expo` 58.1), React Native 0.88, Expo Router (routes in `src/app/`),
Reanimated 4, react-native-gesture-handler 3.3, `expo-glass-effect` 58.0.6, Supabase JS.

| Feature | Status | Paths |
|---|---|---|
| Auth (sign-up, e-mail verification, sign-in, reset) | Working (Jest); real sign-up verified on live DB (1 confirmed user) | `src/app/(auth)/*`, `src/app/auth/callback.tsx`, `src/lib/supabase.ts`, `src/lib/env.ts` (`AUTH_REDIRECT = roadshield://auth/callback`) |
| Citizen hazard reporting (camera, GPS, category, offline drafts, signed AI result) | Working (Jest integration; was on `main` before this branch) | `src/app/report/new.tsx`, `src/components/report/*`, `src/lib/offline/{drafts,sync,db}.ts`, `src/lib/ai.ts` |
| Native tab bar (`expo-router/native-tabs`, SF Symbols / Material icons, role-based visibility) | **Partial**: typecheck + Jest pass; **not run on a device** | `src/app/(tabs)/_layout.tsx` |
| Liquid Glass controls (GlassView on iOS 26+, BlurView fallback, solid surface for Reduce Transparency/Android) | **Partial**: not seen on a device | `src/components/ui/Glass.tsx` |
| Home: map hero, scan action, swipeable report previews with progress, haptics | **Partial** | `src/app/(tabs)/index.tsx`, `src/components/home/{MapHero,ReportCarousel}.tsx`, `src/lib/haptics.ts` |
| Camera upgrades (glass controls, flash, torch, GPS pill, framing) | **Partial** | `src/app/report/new.tsx` |
| Detection overlay on the user's photo (real boxes from the AI service only) | **Partial**: needs a deployed AI service (none deployed, §6) | `src/components/report/AiResultView.tsx` |
| Pinch-zoom lightbox, before/after slider | **Partial** | `src/components/media/{ZoomableImage,BeforeAfter}.tsx`, `src/app/hazard/[id].tsx` |
| Map (hazards) | Partial: Android needs `GOOGLE_MAPS_ANDROID_API_KEY` (not set → list fallback) | `src/components/map/HazardMap.tsx`, `src/app/(tabs)/map.tsx` |
| Field mode (inspections, work orders, work logs with photos, cost items, offline outbox) | **Partial**: typecheck/Jest/i18n pass; **not run on a device** | `src/app/field/*`, `src/lib/api/field.ts`, `src/lib/offline/fieldOutbox.ts` |
| Officer / admin screens (citizen workflow) | Working (pre-existing; Jest) | `src/app/officer/*`, `src/app/admin/*`, `src/app/(tabs)/{admin,work}.tsx` |
| Arabic / English, RTL | Working (i18n parity tests) | `src/lib/i18n/*`, `__tests__/unit/i18n.test.ts` |
| Push notifications | Not configured in builds (needs EAS project ID + Firebase) | `src/lib/notifications.ts`, `docs/DEPLOYMENT.md` |
| 3D on mobile | Not implemented | — |

### 1.2 Public website (Next.js 16, `apps/web`)

| Feature | Status | Paths |
|---|---|---|
| Marketing pages (home, platform, vision, finance, predictive maintenance, solutions, technology, security, pricing, about, contact, demo, credits) | Working locally (E2E + responsive matrix) | `apps/web/src/app/(marketing)/*`, `apps/web/src/components/marketing/*` |
| Real photography (8 Wikimedia Commons photos, licences recorded) | Working | `apps/web/public/photos/*.webp`, `scripts/assets/fetch-commons-photos.py`, `/credits` page |
| Boxes on website photos = real detector output (incl. one shown misclassification, crack → pothole 0.71) | Working | `apps/web/src/lib/vision-samples.json`, `scripts/assets/run-vision-samples.py`, `docs/test-results/website-vision-samples.json` |
| Scan HUD, compare slider, lightbox, reveal motion (reduced-motion aware) | Working (Playwright interaction test, EN+AR) | `apps/web/src/components/marketing/ScanHud.tsx`, `apps/web/src/components/interactive/*` |
| 3D pavement-layer model (Three.js / R3F) | **Illustrative**, labelled approximate | `apps/web/src/components/three/RoadLayers3D.tsx`, `RoadLayersLazy.tsx` |
| Contact/demo form → `submit_contact_request` RPC (anonymous allowed) | Working locally | `apps/web/src/lib/actions/contact.ts`, migration `…100400` |
| Product screenshots | Real screenshots of the local demo workspace | `apps/web/public/product/*.webp` |

### 1.3 RoadShield OS dashboard (`apps/web/src/app/app/*`)

| Feature | Status | Paths |
|---|---|---|
| Multi-tenant orgs, onboarding, members, invitations (hashed, single-use) | Working (SQL + E2E) | `app/onboarding`, `app/organization/*`, migration `…100200` |
| Road network: OSM import (GeoJSON upload/importer), register, road detail | Working with a labelled fixture. **Real New Damietta OSM import not done** (Overpass blocked) | `app/roads/*`, `components/app/RoadImporter.tsx`, `scripts/osm/*` |
| Interactive map: search + fly-to, hover, clustered verified defects, colour by condition or verified spend | Working (Playwright) | `components/app/maps.tsx`, `lib/actions/{map,search}.ts`, migration `…100600` |
| Inspections & defects review | Working (SQL + E2E) | `app/inspections` |
| Projects, estimates (qty × verified unit rate), contracts, change orders, work orders, costs, invoices, payments | Working (SQL + E2E) | `app/projects/*`, `app/procurement`, `app/work-orders/*`, `components/app/EstimateBuilder.tsx` |
| Finance page: KPIs, four-eyes approval queue, unit-rate library, spending explorer (3/6/12/24 mo + month drill-down) | Working (Playwright) | `app/finance/page.tsx`, `components/app/SpendingExplorer.tsx`, `lib/actions/finance.ts` |
| Budget Planning Studio (4 strategies, saved scenarios) | Working (SQL + E2E) | `app/budget-studio`, `components/app/Studio.tsx` |
| Cost predictions (comparables) | Working logic; **refuses** without ≥5 verified comparables (live DB has 0) | `app/predictions`, migration `…100300` |
| Contractors register + contractor home | Working (SQL + E2E) | `app/contractors`, `components/app/ContractorHome.tsx` |
| Analytics, predictive maintenance flags, citizen reports, assets, exports (CSV), search | Working (E2E) | `app/{analytics,predictive,reports,assets,exports,search}` |
| AI Model Center (registry, admin-only deploy, metrics required) | Working (SQL) | `app/model-center`, migration `…100300` |
| Document upload UI | Not implemented (bucket, policies, `register_document` RPC exist) | — |
| Billing provider | Not implemented (plan column + quotas exist) | — |
| SSO / SAML | Not implemented | — |

### 1.4 Supabase backend — see §3.

### 1.5 AI services

| Component | Status | Paths |
|---|---|---|
| Inference service (FastAPI, ONNX Runtime, HMAC-signed results, face/plate redaction) | Working locally (33 pytest). **Not deployed** | `services/ai/app/*`, `services/ai/Dockerfile`, `render.yaml` |
| Model artifacts build workflow | Ran on `main` ([run](https://github.com/Alaa2134/roadshield-ai/actions/runs/41305552299)) | `.github/workflows/ai-models.yml` |
| RDD2022 download/prepare, torchvision detector training/eval/ONNX export | Code + tests (9 pytest); smoke run on synthetic data only | `ml/datasets/*`, `ml/detector/*`, `ml/tests/*` |
| Cost ML training pipeline | Code + tests (3 pytest) on a synthetic fixture; not trained on real data | `services/cost-intelligence/*` |

---

## 2. UI / UX

**Visual direction.** Dark asphalt + survey-contour textures (`apps/web/public/textures/contours.svg`),
validated chart palette (light `#2878FF/#00B8A9/#8B5CF6`, dark `#4A8DFF/#0EA597/#9271F6`, CSS
`--viz-1..3`), Latin digits in Arabic (`ar-EG-u-nu-latn`), RTL layouts. Real Commons photos
(colour-graded) instead of stock/AI imagery; credits on `/credits`.

**Motion.** Reveal-on-scroll, compare slider, HUD scan; all honour `prefers-reduced-motion`. 3D
switches to `frameloop="demand"` and stops autorotate under reduced motion.

**Maps.** Web: MapLibre 6.19 + OpenFreeMap tiles (OSM attribution). Mobile: `react-native-maps`
(Apple Maps on iOS; Google on Android needs a key).

**Native Liquid Glass.** Real `expo-glass-effect` `GlassView` behind `isLiquidGlassAvailable()`
(iOS 26+) with `BlurView` / solid fallbacks; NativeTabs give the system Liquid Glass tab bar on iOS 26.
**Never rendered on a device or simulator in this work** — no macOS/iOS simulator or Android emulator
(no `/dev/kvm`) was available.

**Visually tested (web only, Playwright/Chromium):**

* Repo screenshots: `docs/screenshots/web-00-homepage.png`, `web-02-overview.png`,
  `web-03-map.png`, `web-05-project-financials.png`, `web-07-budget-studio.png`,
  `web-08-model-center.png`, `web-09-contractor-home.png`, `web-10-finance-queue.png`,
  `web-14-overview-ar-dark.png`, `web-16-overview-mobile-ar.png`.
* Session screenshots (scratchpad; ephemeral; sent to the user in chat): finance drill-down EN,
  map search + spend overlay AR dark, 3D overlay AR, compare slider EN.
* Responsive matrix: 12 pages × 5 widths × EN/AR = 120/120 without horizontal overflow (local).

**Mobile visual evidence: none.** No screenshot of the new mobile UI exists. The 1 Nov APK passed an
emulator smoke test in CI (`ci-results` branch, `status.json`: build success, smoke_test success),
but that was the **old** citizen app (`becea2d`), not the current branch.

---

## 3. Database

### 3.1 Migrations (repo `supabase/migrations/`, 22 files) — all recorded on the live project

```
20261030221845 core_schema                    20261031081821 realtime_publication
20261030222308 role_helpers_and_priority      20261031125036 bind_ai_result_to_user
20261030222321 audit_notify_helpers           20261031132340 foreign_key_indexes
20261030222338 status_history_and_push_triggers
20261030222352 row_level_security_policies    20261127100000 enterprise_tenancy_and_roads
20261030222402 table_privileges               20261127100100 projects_contractors_finance
20261030222423 rate_limiter_fixed_window      20261127100200 enterprise_rpcs
20261030222600 citizen_rpcs                   20261127100300 analytics_prediction_models
20261030222931 staff_admin_rpcs               20261127100400 contact_requests
20261030222953 storage                        20261127100500 dashboard_read_models
20261030223650 push_dispatch_auth             20261127100600 map_finance_layers
                                              20261127100700 revoke_anon_rpc_execute
```

**How the live project got them (27 Nov, this session).** Project restored from paused.
`100000` and `100100` applied via `apply_migration` (SQL comments stripped, statements identical).
`100200`–`100600` executed in-database from GitHub raw at commit `44a7775`, each **SHA-256-checked**
against the repo file before `EXECUTE`. The temporary `http` extension was dropped afterwards.
`100700` applied via `apply_migration`. Versions in `supabase_migrations.schema_migrations` were
aligned to the file names, so `supabase db push` treats them as applied.

### 3.2 Important tables (42 in `public`, **all with RLS enabled**, live check `tables_without_rls = 0`)

Citizen: `profiles`, `user_roles`, `hazards`, `hazard_images`, `status_history`, tasks, notifications.
Tenancy: `plans`, `organizations`, `org_members`, `org_invitations`, `org_usage`, `audit_logs.org_id`.
Network: `road_segments` (PostGIS LineString, OSM provenance), `road_inspections`, `inspection_defects`, `org_documents`.
Delivery/finance: `contractors`, `maintenance_projects`, `project_roads`, `project_status_history`,
`unit_rates`, `budgets`, `cost_estimates`, `estimate_lines`, `contracts`, `change_orders`,
`work_orders`, `work_logs`, `cost_items`, `invoices`, `payments`, `budget_scenarios`.
AI: `ml_models`, datasets / training runs (migration `…100300`). Website: `contact_requests`.

### 3.3 Auth and security model

* Reads via RLS; writes only through `SECURITY DEFINER` RPCs with `set search_path = ''`, role checks
  (`app_private.require_org_role`), four-eyes (`app_private.assert_four_eyes`), audit
  (`app_private.audit_org`), error codes raised as messages (`FORBIDDEN`, `FOUR_EYES_REQUIRED`, …).
* `100700`: anonymous EXECUTE revoked on 13 finance/analytics RPCs. Live check:
  `POST /rest/v1/rpc/org_overview` with the publishable key → `permission denied for function org_overview`.
* Supabase security advisor (live, after `100700`): remaining warnings are
  `authenticated_security_definer_function_executable` (by design — each RPC checks role) and
  `anon …` for `submit_contact_request` (intentional public form).
* **Auth URL configuration is wrong (unresolved):** Site URL is the default `http://localhost:3000`
  and `roadshield://**` is not in the redirect allow-list, so verification e-mails land on localhost
  (verification itself succeeds). Requires dashboard → Authentication → URL Configuration, or a
  Management API token **of the account that owns the project**.

### 3.4 Local vs production

| Verified locally (PostgreSQL 16 + PostGIS + `supabase/local/supabase_stub.sql`) | Verified on live project |
|---|---|
| `database_security_tests.sql` 42/42, `enterprise_tests.sql` 70/70 (also in CI *Web + database*) | Migrations present (22); RLS on all public tables; anon RPC denial; security advisor reviewed |
| E2E 30/30 against dev-gateway (`supabase/local/dev-gateway/gateway.mjs`) | **Test suites not run** against live (they create users) |

Live data (27 Nov): 1 user (confirmed), 0 organizations, 0 roads, 0 projects, 0 cost items,
0 hazards, 1 `ml_models` row (`roadshield-rdd-yolov8s`, production, third_party_pretrained).
**There is no real financial data anywhere.**

---

## 4. AI models

| Model | Trained by | Data | Metrics measured by RoadShield | Status |
|---|---|---|---|---|
| `roadshield-rdd-yolov8s` (YOLOv8s ONNX) | **Third party** — [oracl4/RoadDamageDetection](https://github.com/oracl4/RoadDamageDetection) | RDD2022 Japan + India (per upstream) | **No mAP/precision/recall.** Domain-shift sanity run on 112 close-up crack photos: 37.5 % images with ≥1 detection at conf ≥ 0.25; median top conf 0.41; CPU latency median 153 ms, p95 185 ms (`docs/test-results/ai-service-results.md`, `ai-crack-seg-eval.json`) | "production" in registry; service **not deployed** |
| `rs-frcnn-mbv3` (torchvision Faster R-CNN MobileNetV3) | — | — | Smoke run on **synthetic** fixture: mAP 0.0 (expected) | **Not trained** |
| `rs-cost-comparables-v1` (SQL IQR of verified cost/m²) | n/a (no training) | Org's own verified projects | — | Live, returns "Insufficient verified data…" with < 5 comparables |
| Cost ML (ridge/RF/GBR) | — | — | Synthetic-fixture test only | **Not trained** (needs ≥ 30 verified completed projects) |

**Was anything trained on real RDD2022 or Egyptian images? No.** RDD2022 was never downloaded
(figshare.com unreachable from the sandbox) and there is no GPU. No Egyptian road images exist in
the project.

Artifacts and reports:
* [`ai-models` release](https://github.com/Alaa2134/roadshield-ai/releases/tag/ai-models): `roadshield-rdd.onnx` (SHA-256 `9eb29882b45d757d5fe58e85687f4d54b49412b30448188feb96116ed70e8ae7`), face detector files, `model_card.json`.
* `docs/MODEL_CARD.md`, `docs/TRAINING_REPORT.md`, `docs/DATA_SOURCES.md`,
  `docs/test-results/detector-smoke-test-{metrics,history,manifest}.json`, `docs/test-results/ai-real-model-detections.jpg`.
* Licence: YOLOv8 weights are AGPL-3.0 → `services/ai` is AGPL-3.0 (`services/ai/LICENSE`).

---

## 5. Finance system ("Finance AI")

Documented in `docs/FINANCIAL_MODEL.md`. All amounts `numeric(18,2)`; currency enforced per project
(`app_private.enforce_project_money`).

1. **Budget** (`submit_budget` → `review_budget`, four-eyes). A project cannot move to *approved*
   without an approved budget (`BUDGET_REQUIRED`).
2. **Estimate** (`submit_estimate`): lines = quantity × **verified** unit rate, or a manual rate with a
   cited source; DB check `amount = round(qty × rate, 2)`; versioned; reviewed with four-eyes.
3. **Contract / commitment** (`create_contract`, `submit_change_order` → `review_change_order`).
4. **Actual cost** (`submit_cost_item` → `review_cost_item`): only *approved* items count as verified
   actual; tender/benchmark sources are rejected as actual cost.
5. **Invoice** (`submit_invoice`, capped by commitment `EXCEEDS_COMMITMENT`) → `review_invoice`.
6. **Payment** (`record_payment`, only on approved invoices, capped `OVERPAYMENT`).
7. Roll-ups: `project_financials`, `org_overview`, `org_spending_trend`, `org_month_records`
   (drill-down), map spend layer (`roads_geojson` v2).

| Feature | Works with real data now? |
|---|---|
| Ledger, approvals, roll-ups, drill-down, exports | Yes, as soon as an org enters records (none exist yet) |
| Budget optimiser (4 strategies) | Yes, deterministic over approved estimates |
| Cost prediction (comparables) | Needs ≥ 5 verified completed projects per org/currency/repair method |
| ML cost models | Needs ≥ 30 verified completed projects; not trained |
| Public unit-cost references (ROCKS, procurement portals) | Not imported; to be entered as cited unit rates |

---

## 6. Deployment (verified state)

| Target | State | Evidence |
|---|---|---|
| Supabase | **Live**, `https://vdfvoxvkxicemgqrsxjh.supabase.co`; `GET /auth/v1/health` → 200 | curl, 27 Nov |
| Web (site + dashboard) | **Not deployed. No public URL.** Vercel deploy via CLI was refused by this session's permission classifier (prod and preview). Vercel Git-link failed: Vercel GitHub App lacks repo access | session log |
| AI inference service | **Not deployed** (Render blueprint `render.yaml` ready; no URL exists) | `docs/DEPLOYMENT.md` |
| Android — published | Old citizen app only: [android-preview-6](https://github.com/Alaa2134/roadshield-ai/releases/tag/android-preview-6) from `becea2d` (1 Nov), CI emulator smoke test passed ([run](https://github.com/Alaa2134/roadshield-ai/actions/runs/41309519437)) | releases API, `ci-results` branch |
| Android — current code | Built locally at `f02e5cb`: `app-release.apk`, arm64-v8a, 50,912,247 bytes, SHA-256 `197708b56a05864086ff5fb0a85acabdd911d91f91654d47d09d2556a9aa141b`, package `com.roadshieldai.app` 1.0.0, minSdk 24 / target 36, **debug-key signed**. Sent to the user as a file; **not on GitHub**; **never launched** (no emulator). `EXPO_PUBLIC_AI_API_URL` empty → AI disabled; no Maps key | `aapt2 dump badging`, `apksigner verify` |
| iOS — published | Old citizen app only: [ios-preview-3](https://github.com/Alaa2134/roadshield-ai/releases/tag/ios-preview-3) — `roadshield-ai-unsigned.ipa` (unsigned; must be re-signed, e.g. Sideloadly) + simulator build, from `becea2d` ([run](https://github.com/Alaa2134/roadshield-ai/actions/runs/41309519427)) | releases API |
| iOS — current code | **No IPA.** `ios-build.yml` runs on push to `main` or `workflow_dispatch`; dispatch from this session → HTTP 403; merging PR #1 was refused by the permission classifier | session log |
| Signed store builds (TestFlight/Play) | Not done (needs Apple Developer + Expo/EAS credentials) | `docs/DEPLOYMENT.md` |

Environment notes (cloud environment `roadshield-ai`, personal): allowed hosts now include
`dl.google.com`, `jitpack.io`, `www.jitpack.io`, `repo.reactnative.dev` (added for the Android
build). Two network secrets were saved by the user during this session that belong to **other
accounts** than the project: `api.vercel.com` (a Vercel account different from the Vercel MCP
team) and `api.supabase.com` (a Supabase account whose projects are not RoadShield). Review/remove
them in the environment settings.

---

## 7. Tests and problems

### 7.1 Commands and last actual results

| Suite | Command | Last result | Where |
|---|---|---|---|
| DB citizen/security | `psql … -f supabase/tests/database_security_tests.sql` (after `supabase/local/reset_local_db.sh`) | 42/42 | local 27 Nov + CI |
| DB enterprise | `psql … -f supabase/tests/enterprise_tests.sql` | 70/70 | local 27 Nov + CI |
| Web unit | `cd apps/web && npm test` | 8/8 | local + CI |
| Web E2E | `cd apps/web && npm run test:e2e` (needs Postgres + gateway + `next dev`) | 30/30 | local 27 Nov |
| Web build/typecheck | `npx tsc --noEmit`, `npx next build` | pass | local + CI |
| Mobile typecheck | `npx tsc --noEmit` (root) | pass | local + CI |
| Mobile Jest | `npx jest --ci` | 110/110 | local; CI `mobile` job green |
| expo-doctor | `npx expo-doctor` | pass in CI (blocked locally: api.expo.dev) | CI |
| AI service | `cd services/ai && python -m pytest -q` | 33/33 | local + CI |
| ML | `python -m pytest ml/tests` | 9/9 | local |
| Cost pipeline | `python -m pytest services/cost-intelligence/tests` | 3/3 | local |
| Android release build | `npx expo prebuild -p android --clean && cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (JDK 17) | BUILD SUCCESSFUL in 11 m | local 27 Nov |

Failing tests: **none** at HEAD. Only historical CI failure on the branch: `16b40ba` (expo-doctor
version alignment) → fixed in `7aa360f`.

### 7.2 Known problems / limitations

1. Auth Site URL = localhost; app redirect not allow-listed (§3.3). **P0.**
2. No public web deployment; no deployed AI service; no current IPA. **P0.**
3. Linting not runnable: no ESLint config in the mobile app (`expo lint` needs api.expo.dev to
   scaffold) nor in `apps/web` (`eslint .` → "couldn't find an eslint.config"). **P1.**
4. Mobile UI changes (NativeTabs, Liquid Glass, Field mode, camera) never run on hardware. **P1.**
5. Android map requires `GOOGLE_MAPS_ANDROID_API_KEY`. **P1.**
6. Real OSM import for New Damietta not performed (Overpass refused from sandbox). **P1.**
7. `docs/TEST_REPORT.md` summary row still says "all 19 migrations" (now 22). Minor doc drift.
8. AGPL-3.0 constraint from YOLOv8 weights for any closed deployment. **P1 (legal).**
9. Push notifications not configured. **P2.**
10. Doc upload UI, billing, SSO not implemented. **P2.**

---

## 8. Missing work vs. the full RoadShield platform brief

| Area | Missing | Priority |
|---|---|---|
| Auth | Fix Supabase URL config; universal links (https) instead of custom scheme | P0 |
| Deployment | Deploy web (Vercel; set `NEXT_PUBLIC_*` env + `NEXT_PUBLIC_SITE_URL`); deploy AI service (Render) and set `EXPO_PUBLIC_AI_API_URL`; merge PR #1 so `android-apk.yml`/`ios-build.yml` publish current builds | P0 |
| iOS | Signed build (EAS + Apple Developer) → TestFlight; on-device QA of Liquid Glass, tabs, camera, map sheets | P0 |
| Android | Signed release keystore/EAS; Maps key; device QA | P1 |
| Data | Real New Damietta OSM import; first real organization; real verified projects | P1 |
| AI | Train `rs-frcnn-mbv3` on RDD2022 (GPU, Colab notebook ready); evaluate (mAP, per-class, per-country); collect + label consented Egyptian road images; local evaluation; replace AGPL weights | P1 |
| Finance AI | Accumulate ≥5 / ≥30 verified projects; import cited public unit rates; then train cost ML | P2 (data-gated) |
| SaaS | Billing provider, SSO/SAML, document upload UI, usage metering UI | P2 |
| Quality | ESLint configs (mobile + web); mobile E2E (Maestro/Detox); Lighthouse/a11y audit | P1 |
| Design | Mobile screenshots/visual QA on device; mobile 3D (optional) | P2 |

---

## 9. Next execution plan (preserve existing code)

1. **Commit this handoff** on `claude/roadshield-ai-production-u7mtac`; fix the "19 migrations" doc drift.
2. **Auth URL config** (owner): Site URL `roadshield://auth/callback` (temporary) and redirect URLs
   `roadshield://**` plus the future web origin `https://<domain>/auth/callback`.
3. **Merge PR #1** (owner) → `android-apk.yml` + `ios-build.yml` publish APK/IPA releases from the
   current code; watch the runs and the emulator/simulator smoke tests.
4. **Deploy web** (Vercel, root `apps/web`, env from `apps/web/.env.example`), then set
   `NEXT_PUBLIC_SITE_URL` and add the origin to Supabase redirect URLs. Smoke: `/`, `/sign-up`, `/app`.
5. **Deploy AI service** via `render.yaml`; check `/health` → `"model_loaded": true`; set
   `EXPO_PUBLIC_AI_API_URL` (repo variable) and rebuild mobile.
6. **Device QA** on an iPhone (iOS 26) and an Android phone: tabs, glass, home, camera, report,
   Field mode, Arabic RTL. Capture screenshots into `docs/screenshots/mobile-*`.
7. **Add ESLint configs** (`eslint-config-expo` for mobile, `eslint-config-next` for web) in a
   networked environment; fix findings.
8. **Real OSM import** for New Damietta (`scripts/osm/fetch-osm-roads.mjs` → importer) into a real org.
9. **Detector training** on a GPU with `ml/detector/RoadShield_RDD2022_training.ipynb`; record
   metrics in `docs/TRAINING_REPORT.md`; register as candidate; admin-approve only with metrics.
10. **Signed store builds** (EAS) and TestFlight / Play internal testing.

Do not rebuild: schema, RPCs, dashboard, website, mobile app and ML pipeline all exist and pass CI.

---

## 10. Blockers requiring the owner

| Blocker | Why the agent could not do it |
|---|---|
| Supabase Auth URL config | Supabase MCP has no auth-config tool; the provided Management token belongs to another account |
| Merge PR #1 / dispatch workflows | Merge refused by the session permission classifier; `workflow_dispatch` → HTTP 403 (no Actions write) |
| Vercel deploy | CLI deploy refused by permission classifier; Vercel GitHub App not installed on the repo; token is for a different Vercel account than the connected MCP team |
| iOS signed build | Needs Apple Developer account + EAS credentials; no macOS available |
| RDD2022 training | No GPU; figshare.com unreachable from the sandbox |
| Device testing | No simulator/emulator (no macOS, no `/dev/kvm`) and no attached device |
