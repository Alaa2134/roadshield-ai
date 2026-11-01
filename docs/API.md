# RoadShield AI — API reference

Three interfaces: **Supabase RPC** (all business operations), **Edge Functions** and the
**AI service**. Every call is HTTPS with the user's session JWT. The mobile app only holds the
publishable key; privileged keys stay on the server.

## 1. Supabase RPC

Called as `supabase.rpc('<name>', { p_arg: value })` → `POST /rest/v1/rpc/<name>`.
All functions are `security definer` with an empty `search_path`, check `auth.uid()` and the
caller's role themselves, and raise the error codes below (message = code) on failure.
`anon` cannot execute any of them.

### Citizen (any signed-in user)

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `submit_hazard_report` | `client_draft_id uuid, category, severity, description, latitude, longitude, location_source 'gps'\|'manual', location_accuracy_m?, address?, city?, images jsonb [{path,width,height,privacy_blurred}], ai_payload?, ai_signature?` | `{id, public_code, status, already_submitted, ai_verified, image_count}` | `NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, VALIDATION_ERROR, INVALID_LOCATION, IMAGES_REQUIRED, INVALID_IMAGE_PATH, IMAGE_NOT_UPLOADED, RATE_LIMITED` |
| `confirm_hazard` | `hazard_id, still_present = true` | `{confirmations_count, …}` | `HAZARD_NOT_ACTIVE, CANNOT_CONFIRM_OWN` |
| `request_reopen` | `hazard_id, note?` | `{status: 'reopened'}` | `INVALID_TRANSITION, NOT_AUTHORIZED` (reporter or staff only) |
| `nearby_hazards` | `lat, lng, radius_m = 2000, limit = 50` | public hazards with `distance_m`, priority | — |
| `hazards_in_bbox` | `min_lat, min_lng, max_lat, max_lng, categories[]?, limit = 1000` | public hazards in the map viewport | — |
| `find_possible_duplicates` | `lat, lng, category?, radius_m = 50` | active hazards nearby (duplicate suggestions) | — |
| `my_report_stats` | — | `{total, pending, active, resolved, closed, confirmations_given}` | — |
| `my_activity` | `limit = 20` | latest status changes on my reports | — |
| `mark_notifications_read` | `ids uuid[]?` (null = all) | number updated | — |
| `register_push_token` | `token, platform 'ios'\|'android', device_name?` | — | `VALIDATION_ERROR` (must be an Expo push token) |
| `my_role`, `is_staff`, `is_admin` | — | role / boolean | — |
| `compute_priority` | `severity, confirmations, created_at, traffic_exposure, status, at` | `{model, score, level, active, factors[]}` | — |

Computed column: `select *, priority(hazards) from hazards` returns the live priority JSON.

### Maintenance officer (and admin)

| Function | Arguments | Returns | Notes / errors |
|---|---|---|---|
| `officer_queue` | `scope 'mine'\|'unassigned'\|'all_open'\|'history', search?, category?, limit, offset` | queue rows sorted by priority | `all_open` admin only |
| `assign_hazard` | `hazard_id, officer_id? (null = me), due_date?` | `{task_id, status}` | Officers can only claim for themselves. `ALREADY_ASSIGNED, INVALID_ASSIGNEE` |
| `update_task` | `task_id, status? 'in_progress'\|'completion_requested'\|'completed'\|'cancelled', note?` | task | Only the assignee or an admin; only admins can set `completed`. `TASK_CLOSED, INVALID_TRANSITION` |
| `attach_task_image` | `task_id, path, kind 'before'\|'after', privacy_blurred?, width?, height?` | image id | `TOO_MANY_IMAGES` (max 12 per task) |
| `priority_heatmap` | `cell_deg = 0.005` | grid cells `{lat, lng, hazard_count, avg_priority, max_priority}` | |

### Admin

| Function | Arguments | Returns | Notes |
|---|---|---|---|
| `transition_hazard` | `hazard_id, to, note?, duplicate_of?, approve_images?` | hazard | State machine; `USE_DEDICATED_ACTION` for assigned/in_progress/reopened |
| `admin_metrics` | `days = 30` | `{totals, resolution_hours {avg, median}, daily[], by_category[], by_region[], workload[], priority_mix, users}` | Computed from stored data |
| `admin_list_users` | `search?, role?, limit, offset` | users with e-mail, role, report counts | |
| `admin_set_role` | `user_id, role` | — | `LAST_ADMIN`; audited; user is notified |
| `admin_set_suspended` | `user_id, suspended` | — | `CANNOT_SUSPEND_SELF`; audited |
| `list_officers` | — | officers and admins | |
| `set_image_privacy` | `image_id, approved` | — | Photo becomes visible to the public only when approved |
| `set_traffic_exposure` | `hazard_id, level 1..5 \| null` | — | Feeds the priority engine |
| `send_announcement` | `title_en, body_en, title_ar, body_ar` | recipients | One notification per user |

Audit log: `select * from audit_logs` (RLS: admins only).

### Realtime
`notifications`, `hazards` and `status_history` are in the `supabase_realtime` publication.
Subscriptions respect RLS, so each user receives only rows they may read.

### Storage
| Bucket | Path | Rules |
|---|---|---|
| `hazard-images` (private, JPEG, ≤ 8 MB) | `<uid>/<draftId or taskId>/<n>.jpg` | Upload only into your own folder; overwrite or delete only while not attached to a report. Read: owner, staff, or anyone signed in once the photo is privacy-approved on a public hazard. Served through signed URLs. |
| `avatars` (private, JPEG, ≤ 2 MB) | `<uid>/avatar.jpg` | Owner writes; owner or admin reads |

## 2. Edge Functions

| Function | Auth | Purpose |
|---|---|---|
| `delete-account` | user JWT + body `{"confirm": "DELETE"}` | Deletes the caller's photos (storage + rows), writes an audit entry, deletes the auth user. Reports stay as anonymised public-safety records. |
| `push-dispatch` | header `x-dispatch-secret` (called by a `pg_net` trigger, not by the app) | Claims a pending notification exactly once, picks the recipient's language, respects their preferences, sends through Expo Push, records `sent / failed / skipped / no_tokens` and disables dead tokens. |

## 3. AI service

Base URL = `EXPO_PUBLIC_AI_API_URL`.

### `GET /health`
```json
{"status":"ok","model_loaded":true,"model_name":"roadshield-rdd-yolov8s",
 "model_version":"YOLOv8_Small_RDD@7f2ceb8f6f3d",
 "classes":["Longitudinal Crack","Transverse Crack","Alligator Crack","Potholes"],
 "face_detector":"opencv-res10-ssd","signing_configured":true,"auth_configured":true,"error":null}
```

### `POST /v1/analyze[?annotate=true]`
`multipart/form-data` field `image` (JPEG/PNG/WebP/HEIC, ≤ 8 MB) · `Authorization: Bearer <access token>`.

`payload` is a canonical JSON **string** (sorted keys, no spaces). Forward it unchanged:

| Field | Meaning |
|---|---|
| `detection_id` | UUID; becomes `ai_detections.id` (single use) |
| `requested_by` | user id from the verified JWT |
| `model_name`, `model_version` | from the model card |
| `image_sha256`, `image_width`, `image_height` | the analysed upload |
| `detections[]` | `{category, label, confidence, box:[x1,y1,x2,y2] normalised 0..1}`, best first |
| `top_category`, `top_confidence` | best detection, or `null` when nothing was found |
| `low_confidence` | `true` when nothing was found or the top confidence < 0.5 |
| `conf_threshold`, `inference_ms`, `analyzed_at` | run metadata |

Plus `signature` (hex HMAC-SHA256 of `payload`), `privacy {faces, plates, applied}`,
`redacted_image_b64` (when something was blurred) and `annotated_image_b64` (with `annotate=true`).

| Status | Meaning | App behaviour |
|---|---|---|
| 200 | Signed result | Show boxes; user confirms or corrects |
| 400 `bad_image` / 413 `image_too_large` | Upload problem | Error toast |
| 401 | Missing or invalid session | Re-authenticate |
| 429 `rate_limited` | > 12 analyses per minute | Ask to wait |
| 503 `model_not_loaded` / `signing_not_configured` / `auth_not_configured` | Service not ready | **"AI analysis unavailable — continue manually."** |

## 4. Error codes → user messages
All codes above have English and Arabic messages in `src/lib/i18n/{en,ar}.ts` under `errors.*`.
Unknown errors show a generic message; network errors keep drafts queued for retry.
