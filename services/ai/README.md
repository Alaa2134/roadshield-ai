# RoadShield AI — detection service

FastAPI service that analyses a road photo with a trained YOLOv8 road-damage detector, blurs faces
and licence plates, and returns a result **signed with HMAC-SHA256**. The mobile app forwards the
signed result to the database, which verifies it before storing it — so a detection shown in
RoadShield always comes from this model, never from the client.

```
POST /v1/analyze   multipart "image"  ·  Authorization: Bearer <Supabase access token>
GET  /health       {model_loaded, model_name, model_version, classes, face_detector, ...}
```

Response of `/v1/analyze`:

```json
{
  "payload": "{\"analyzed_at\":…,\"detection_id\":…,\"detections\":[{\"box\":[x1,y1,x2,y2],\"category\":\"crack\",\"confidence\":0.72,\"label\":\"Transverse Crack\"}],…,\"requested_by\":\"<user id>\",\"top_category\":\"crack\",\"top_confidence\":0.72}",
  "signature": "<hex HMAC-SHA256 of payload>",
  "privacy": {"faces": 1, "plates": 0, "applied": true},
  "redacted_image_b64": "<JPEG without metadata, or null>",
  "annotated_image_b64": "<only with ?annotate=true>"
}
```

Errors: `401` no/invalid session · `400` unreadable image · `413` > 8 MB · `429` rate limited ·
`503 model_not_loaded | signing_not_configured | auth_not_configured` — the app then shows
*"AI analysis unavailable — continue manually."*

## Run locally

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
# models: unzip roadshield-ai-models.zip into models/  — or build them: bash scripts/fetch_models.sh
cp .env.example .env   # set AI_SIGNING_SECRET and AI_SUPABASE_URL
uvicorn app.main:app --port 8080
python -m pytest -q
python scripts/evaluate.py path/to/photos --out report.json
```

## Deploy (Docker)

```bash
docker build -t roadshield-ai .
docker run -p 8080:8080 --env-file .env roadshield-ai
```

Works on any container host (Google Cloud Run, Render, Fly.io, Railway, a VPS). 1 vCPU / 1 GB RAM
is enough (≈150–250 ms per photo). Put it behind HTTPS and set the app's `EXPO_PUBLIC_AI_API_URL`.
The signing secret must equal the database value:

```sql
update app_private.settings set value = '<same 64-char secret>' where key = 'ai_signing_secret';
```

## Model

See `models/model_card.json` and `../../docs/test-results/ai-service-results.md`.
The bundled weights (YOLOv8s trained on RDD2022 Japan + India by oracl4/RoadDamageDetection) are a
working baseline. For production in Egypt, fine-tune on local dash-camera photos with
`scripts/train_rdd2022.py`, then export with `scripts/export_onnx.py`.

## Licence

This service serves Ultralytics YOLOv8 weights and is therefore distributed under **AGPL-3.0**:
if you run it for others, keep this service's source available. RDD2022 is CC BY-SA 4.0
(Arya et al., "RDD2022: A multi-national image dataset for automatic Road Damage Detection").
The face detector is OpenCV's ResNet-10 SSD sample model.
