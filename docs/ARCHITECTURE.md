# RoadShield AI — architecture

```
                       ┌────────────────────────────── clients ──────────────────────────────┐
 Citizens ─────────────│ RoadShield iOS / Android (Expo SDK 58, React Native 0.88)            │
 Engineers/inspectors ─│   citizen app · officer queue · Field mode (offline outbox)          │
 Contractors ──────────│ RoadShield Web (Next.js 16, apps/web)                                │
 Finance / executives ─│   public website · RoadShield OS dashboard (MapLibre, Recharts)      │
                       └───────────────┬───────────────────────────────┬─────────────────────┘
                                       │ supabase-js (user JWT)        │ HTTPS multipart
                       ┌───────────────▼───────────────┐   ┌───────────▼─────────────────────┐
                       │ Supabase                      │   │ RoadShield Vision (FastAPI)     │
                       │  Auth · PostgREST · Storage   │◀──│  ONNX Runtime detector          │
                       │  Postgres 17 + PostGIS        │   │  face/plate redaction           │
                       │   RLS · SECURITY DEFINER RPCs │   │  HMAC-signed results            │
                       │   audit · four-eyes · roll-ups│   └─────────────────────────────────┘
                       │  Edge Functions (push, delete)│
                       └───────────────┬───────────────┘
                                       │ exports (verified records only)
                       ┌───────────────▼───────────────────────────────────────────────────┐
                       │ ml/ (detector: torchvision Faster R-CNN, BSD-3)                     │
                       │ services/cost-intelligence (scikit-learn, chronological validation) │
                       │ → candidate models registered in ml_models; deploy needs approval    │
                       └─────────────────────────────────────────────────────────────────────┘
```

## Repository layout

| Path | What |
|---|---|
| `src/` (root) | Mobile app (Expo Router). Kept at the root so the existing EAS and GitHub Actions builds stay unchanged |
| `apps/web/` | Website + RoadShield OS (Next.js 16, TypeScript, Tailwind CSS v4, MapLibre GL, Recharts) |
| `supabase/migrations/` | Versioned SQL migrations (19). The `2026112710xxxx_*` files add the enterprise platform |
| `supabase/tests/` | SQL test suites run as real Postgres roles (`database_security_tests.sql`, `enterprise_tests.sql`) |
| `supabase/local/` | Plain-Postgres stub of the Supabase schemas, `reset_local_db.sh`, and the test-only dev gateway |
| `services/ai/` | RoadShield Vision inference service (FastAPI, ONNX Runtime) |
| `services/cost-intelligence/` | Cost-model training and evaluation |
| `ml/` | Dataset download/preparation, detector training/evaluation, Colab notebook |
| `scripts/osm/` | OpenStreetMap road fetch and import |
| `docs/` | Documentation and test evidence |

## Why Supabase and not a separate FastAPI backend

The brief suggests FastAPI for the core API. RoadShield already ran on Supabase (Postgres +
PostGIS, Auth, Storage), and the security model needs authorization **next to the data**:

* Tenant isolation and role permissions are enforced by row-level security on every table, so a
  bug in any client or API layer cannot leak another organisation's records.
* Every write is a `SECURITY DEFINER` function that checks the caller's org role, validates state
  transitions and money rules, writes, and appends an audit record in **one transaction**.
* Postgres `numeric` does all money arithmetic; PostGIS computes geodesic lengths.

FastAPI is used where Python adds something: model inference (`services/ai`) and model training
(`ml/`, `services/cost-intelligence`). This keeps one authorization model instead of two.

## Multi-tenancy

* `organizations`, `org_members (org_id, user_id, role, contractor_id)`, `org_invitations` (hashed
  one-time tokens, e-mail bound, 14-day expiry).
* Roles: `owner`, `finance_manager`, `road_engineer`, `field_inspector`, `contractor`,
  `executive_viewer`. The platform role `admin` (super administrator) manages the platform and the
  model registry but does **not** read tenant financial records without membership (test E55).
* Helpers: `my_org_role`, `has_org_role`, `is_org_staff`, `can_read_org_finance`, `my_contractor_id`.
* Plans (`pilot`, `professional`, `enterprise`) carry quotas (members, road segments, AI analyses)
  enforced by RPCs (`QUOTA_EXCEEDED`). `org_usage` meters monthly usage. Prices are not stored.
* Billing integration point: plans are referenced by `organizations.plan_code`. A billing provider
  webhook only needs to update that column through a service-role function.

## Data model (enterprise)

`road_segments` (LineString, length, OSM provenance, condition from the latest approved inspection)
→ `road_inspections` → `inspection_defects` (measured L × W × depth, engineer severity).
`maintenance_projects` ↔ `project_roads`; `budgets`, `cost_estimates`/`estimate_lines`,
`unit_rates`, `contracts`/`change_orders`, `work_orders`/`work_logs`, `cost_items`, `invoices`,
`payments`, `budget_scenarios`, `org_documents` (private bucket `org-documents/<org>/<uid>/…`),
`ml_datasets`, `ml_models`, `ml_training_runs`, `contact_requests`.

## Read models

`org_overview`, `org_spending_trend`, `org_activity`, `project_list`, `project_financials`,
`roads_geojson`, `defects_geojson`, `road_detail`, `search_roads`, `road_asset_register`,
`org_analytics`, `predictive_flags`, `org_citizen_reports`, `predict_project_cost`,
`optimize_budget`. Invoker functions rely on RLS; definer functions check the role first.

## Web app

* Server Components fetch with the user's session (`@supabase/ssr` cookies), so RLS applies.
* All mutations use one Server Action (`runRpc`) with an **allow-list** of RPC names and typed
  parameters (UUIDs validated, decimals passed as strings). The database re-checks everything.
* `proxy.ts` refreshes the session and redirects unauthenticated `/app` requests (an optimistic
  check only).
* i18n: dictionaries for English and Arabic, with parity enforced by tests. `<html lang dir>` comes
  from a cookie or `Accept-Language`. Fonts: Inter and IBM Plex Sans Arabic (`next/font`, self-hosted).
* Security headers: CSP (self, the Supabase origin and the tile host only), HSTS, frame-ancestors
  none, nosniff, referrer and permissions policy.

## Mobile app

Existing citizen and officer flows, plus **Field mode**: role-gated tab, inspections with measured
defects and GPS, work orders with progress logs, EXIF-stripped evidence photos and cost submission.
Submissions go to a SQLite outbox. Each item's UUID is sent as `p_client_id`, so replays are
idempotent server-side, with backoff and sync on reconnect.

## AI

* Inference: `services/ai` (unchanged): YOLOv8s ONNX (third-party pretrained on RDD2022), redaction,
  results signed with HMAC and verified by `submit_hazard_report`.
* Training: `ml/detector/train_detector.py` (torchvision Faster R-CNN MobileNetV3-FPN, BSD-3).
  Evaluation is in `ml/detector/metrics.py` (COCO AP, P/R/F1, confusion matrix, per-country, latency).
* Registry: `ml_models` keeps provenance, licence, metrics and their source, artifact hash and status.
  `approve_model_deployment` enforces metrics-before-deploy and keeps one production model per kind.
