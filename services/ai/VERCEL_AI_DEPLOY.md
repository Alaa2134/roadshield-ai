# RoadShield AI — Vercel demo endpoint

This uses an independent Vercel **Python function** to run the existing FastAPI API.
It is a **student/demo experiment on existing Hobby quota**, not a production SLA.
No paid hardware, subscription or model-training credit is required.

## Security
- Set `AI_SUPABASE_URL` to the existing Supabase URL and `AI_SUPABASE_PUBLISHABLE_KEY` to its publishable key.
- Set `AI_SIGNING_SECRET` as an encrypted/sensitive Vercel environment variable. It must match the existing private Supabase setting. **Do not commit, log or transmit it to the mobile client.**
- Leave `AI_REQUIRE_AUTH` at the secure default true. Only Supabase-authenticated requests may analyze road photos.
- Hosted model is a third-party YOLOv8s ONNX candidate, **not trained by RoadShield**. Existing weight license is AGPL-3.0.
- The function downloads the fixed model release on cold start to `/tmp` and verifies its SHA-256 against `models/model_card.json`. If unavailable/mismatched, `/health` returns `model_loaded=false` and analysis fails safely.
- `/health` is a liveness indicator, not a guarantee that a signed analysis has succeeded.

## Deployment setup
Vercel project root: `services/ai`, framework: FastAPI, Python 3.12,
branch: `deploy/roadshield-vercel-ai-demo`.
The entrypoint `api/index.py` adapts the existing `app.main:app` and
`vercel.json` maps incoming URLs to it.

1. Build Vercel project using `services/ai` root directory; use normal Hobby resources only.
2. Confirm `GET /health` has `model_loaded: true`, otherwise inspect read-only logs and verify the published GitHub model assets/hash.
3. On a test branch build, set `EXPO_PUBLIC_AI_API_URL=https://<project>.vercel.app` and ensure no secrets ship in the APK.
4. On a device, authenticate to Supabase and test `POST /v1/analyze` with a consented road photo.
5. Validate the signed result against the database, non-AI manual fallback, rate limits and timeout behavior before real pilot.

If Vercel Hobby function size, memory, startup time, or plan limits block this approach,
do not upgrade automatically; use the Android/web no-AI/manual-report submission flow for delivery.
