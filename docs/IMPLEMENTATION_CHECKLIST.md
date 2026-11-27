# Implementation checklist

Legend: ✅ done and tested · 🟡 done, partially verified · ⏳ blocked / pending (reason given) · ⬜ not started

## Platform & data
- ✅ Multi-tenant schema: organizations, six roles, invitations, plans/quotas, usage, per-org audit
- ✅ Tenant isolation via RLS + role-checked RPCs (70 enterprise SQL tests)
- ✅ Road network model with OSM provenance; geodesic length; unknowns stay unknown
- ✅ Inspections and measured defects; approval updates road condition
- ✅ Projects, contractors, contracts, change orders, work orders, work logs
- ✅ Finance ledger: budgets, estimates, unit rates, actual costs, invoices, payments; four-eyes; guards
- ✅ Read models: overview, trend, activity, project roll-ups, GIS feeds, analytics, predictive flags
- ✅ Cost prediction (comparables, honest refusal) and budget optimiser (4 strategies)
- ✅ AI dataset/model registry with metrics-before-deploy
- ✅ Public contact/demo requests (anonymous, rate-limited)
- ⏳ Apply the migrations to the live Supabase project (project paused, needs owner action)
- ⏳ Real New Damietta OSM import (`overpass-api.de` blocked in the build sandbox; scripts ready)

## Web
- ✅ Design system (tokens, light/dark, typography scale, components, validated chart palette)
- ✅ Public website (14 pages, EN/AR, SEO/OG, sitemap, robots)
- ✅ Auth (sign-in/up, reset, callback), onboarding (create/join org)
- ✅ RoadShield OS (overview, map, roads, import, inspections, reports, assets, projects, work orders,
  finance, procurement, predictions, budget studio, contractors, analytics, predictive, exports,
  model center, organization, members, settings, search)
- ✅ 30-check E2E, 120-combination responsive matrix, production build, CI workflow
- ✅ Interactive map: road search with fly-to, hover highlight, clustered verified defects,
  colour by condition or verified spend (from approved cost items only)
- ✅ Finance explorer: period filter (3/6/12/24 months) and click-a-month drill-down into the exact
  approved cost items, invoices and payments (`org_month_records`, tests E67–E70)
- ✅ Website: real-photo galleries with lightbox/zoom, before/after compare slider (keyboard + drag),
  illustrative 3D pavement-layer model (Three.js; labelled approximate; reduced-motion aware)
- ⬜ Document upload UI (storage bucket, policies and `register_document` RPC exist; UI pending)
- ⬜ Billing provider integration (plan column + quotas ready)

## Mobile
- ✅ Citizen app and officer queue (existing; 110 Jest tests; bundles)
- 🟡 Native tab bar (Expo Router NativeTabs: SF Symbols / Material icons), Liquid Glass controls
  (`expo-glass-effect` on iOS 26+, system blur below, solid Material surface on Android), map hero,
  swipeable report previews with progress, camera glass controls + torch + GPS pill, pinch-zoom
  lightbox, before/after slider: typecheck + Jest pass; **visual behaviour not verified on a real
  iPhone/Android device or simulator** (none available in the build sandbox)
- 🟡 Field mode (inspections, work orders, logs with photos, costs, offline outbox): typecheck,
  Jest i18n parity and bundle pass; **not yet exercised on a device or simulator**
- ⏳ APK with Field mode: built by GitHub Actions on `main` (or a manual dispatch on this branch)
- ⏳ IPA / AAB: need Apple Developer and Expo/Play credentials (see `DEPLOYMENT.md`)

## AI / ML
- ✅ Inference service (existing, 33 tests), signed results, redaction
- ✅ RDD2022 official-source download with licence + MD5 checks (code; not run here)
- ✅ Dataset preparation with near-duplicate grouping and versioned manifest (tested)
- ✅ Detector training/evaluation pipeline (torchvision, BSD-3) + metrics module (tested) + ONNX export
- 🟡 Pipeline smoke test on a synthetic fixture (ran end to end; not a quality result)
- ⏳ Real RDD2022 training + evaluation (needs a GPU and network; Colab notebook ready)
- ✅ Cost-model training pipeline (chronological validation; tested on a labelled synthetic fixture)
- ⏳ Cost ML on real data (needs ≥ 30 verified completed projects)
- ⬜ Serve a torchvision ONNX candidate in `services/ai` (needs a boxes/labels/scores decoder)

## Docs
- ✅ README, ARCHITECTURE, SETUP, DATA_SOURCES, MODEL_CARD, TRAINING_REPORT, FINANCIAL_MODEL,
  SECURITY, TEST_REPORT, DEPLOYMENT (updated)
