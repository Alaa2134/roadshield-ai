# Developer setup

Requirements: Node 22, npm, Python 3.12+, PostgreSQL 16 + PostGIS 3 (for local database work),
Chromium/Playwright (end-to-end tests). Optional: a GPU for detector training.

## 1. Database (local, no Docker needed)

```bash
sudo apt-get install -y postgresql-16 postgresql-16-postgis-3   # or postgis/postgis:16-3.4 image
export PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres
supabase/local/reset_local_db.sh roadshield_local
# → migrations applied: 20 · ROADSHIELD_TESTS passed=42 failed=0 · ENTERPRISE_TESTS passed=70 failed=0
```

`supabase/local/supabase_stub.sql` provides the `auth`, `storage` and `net` schemas and roles
that Supabase normally supplies, so the real migrations run unchanged.

## 2. Web (RoadShield Web + RoadShield OS)

Against the local database, through the test-only dev gateway (PostgREST/GoTrue subset; RLS applies):

```bash
(cd supabase/local/dev-gateway && npm ci && DATABASE_URL=postgres://postgres:postgres@localhost/roadshield_local node gateway.mjs) &
cd apps/web
cp .env.example .env.local          # then set:
#   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-dev-anon-key
npm ci && npm run dev               # http://localhost:3000
npm run typecheck && npm test && npm run build
NODE_PATH=$(npm root -g) SHOTS=/tmp/shots node tests/e2e/run.mjs   # 30 end-to-end checks
```

Against Supabase: keep the values from `.env.example` (project URL + publishable key) and apply
the migrations first (see `DEPLOYMENT.md`).

## 3. Mobile (iOS + Android, Expo SDK 58)

```bash
npm ci
cp .env.example .env
npx expo start --dev-client          # needs a development build (native modules)
npm run typecheck && npx jest --ci && npm run bundle:check
```

## 4. Road network (OpenStreetMap)

```bash
node scripts/osm/fetch-osm-roads.mjs --out datasets/osm/new-damietta-roads.geojson   # needs overpass-api.de
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... RS_EMAIL=owner@org RS_PASSWORD=... \
  node scripts/osm/import-osm-roads.mjs --file datasets/osm/new-damietta-roads.geojson --org <org-uuid> \
  --city "New Damietta" --region Damietta
```
or upload the GeoJSON at **RoadShield OS → Road Network → Import roads**.

## 5. AI / ML

```bash
cd services/ai && pip install -r requirements-dev.txt && python -m pytest -q      # inference service
pip install -r ml/requirements.txt && python -m pytest -q ml/tests                 # dataset + metrics
python ml/datasets/download_rdd2022.py --out datasets/raw/rdd2022                  # official source
python ml/datasets/prepare_rdd2022.py --raw datasets/raw/rdd2022/RDD2022 --out datasets/rdd2022
python ml/detector/train_detector.py --data datasets/rdd2022 --raw datasets/raw/rdd2022/RDD2022 --out runs/rs-frcnn-mbv3 --onnx
cd services/cost-intelligence && pip install -r requirements.txt && python -m pytest -q
```
