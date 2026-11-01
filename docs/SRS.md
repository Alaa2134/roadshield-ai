# RoadShield AI — Software Requirements Specification

*"Safer Roads. Smarter Cities."* · Version 1.0 · 31 October 2026
Structure follows IEEE 830 / ISO/IEC/IEEE 29148.

---

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements of **RoadShield AI**, a native iOS and Android application
with a cloud backend and an AI detection service. Citizens use it to report road hazards (potholes,
cracks, flooding and more), the city verifies the reports and maintenance crews repair them. It is
written for the development team, the course examiners and anyone deploying the system.

### 1.2 Scope
RoadShield AI:

- lets citizens photograph road damage, get an **AI suggestion from a trained detection model**, and
  submit a geo-tagged report, even offline;
- publishes **only verified** hazards on a live map and warns users about verified hazards on a
  planned route;
- gives maintenance officers a priority-ordered work queue, and administrators moderation tools,
  analytics, user and role management, announcements and an audit log;
- runs in **English and Arabic** (genuine right-to-left layout).

Out of scope: turn-by-turn navigation (handed off to Apple Maps / Google Maps), accident prediction,
live traffic data, payments.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Hazard / report | A geo-located road problem submitted by a citizen (table `hazards`). |
| Verified | Status set by an admin after review. Only verified, assigned, in-progress and reopened hazards are visible to other citizens. |
| Confirmation | Another citizen states that a verified hazard is still present. |
| Priority score | 0–100 maintenance-urgency score (model `rs-priority-v1`). **Not** an accident prediction. |
| Signed AI result | Detection JSON plus HMAC-SHA256 signature created by the AI service and verified by the database. |
| RLS | Postgres Row Level Security. |
| RPC | A Postgres function called through Supabase's REST API. |
| EAS | Expo Application Services, the cloud build and signing service for iOS and Android binaries. |

### 1.4 References
RDD2022 dataset (Arya et al., 2022) · Ultralytics YOLOv8 docs · Expo SDK 58 docs · Supabase docs ·
Apple Human Interface Guidelines · Material Design 3 · WCAG 2.2.

---

## 2. Overall description

### 2.1 Product perspective
A new, self-contained system made of three deployable parts (see `DESIGN.md` §1):

1. **Mobile app**: Expo SDK 58, React Native 0.88, TypeScript (strict), Expo Router.
2. **Backend**: Supabase (Postgres 17 + PostGIS, Auth, Storage, Realtime, Edge Functions).
3. **AI service**: Python FastAPI, YOLOv8s road-damage detector on ONNX Runtime.

### 2.2 User classes

| Role | Description | Main goals |
|---|---|---|
| Citizen (default) | Any registered user | Report hazards, see verified hazards, plan safer routes, track own reports |
| Maintenance officer | Field or office staff, role granted by an admin | Claim and work tasks, upload before/after photos, request completion |
| Administrator | City or university operator | Moderate, assign, approve completion, manage users and roles, analytics |

Roles are stored in `user_roles` and checked **on the server** by every privileged function.

### 2.3 Operating environment
iOS 16.4+ and Android 7.0+ (API 24+) phones and tablets (minimums of Expo SDK 58 / React Native 0.88); portrait orientation. The backend is hosted on
Supabase. The AI service runs in any Docker host (1 vCPU / 1 GB RAM is enough).

### 2.4 Constraints
- Must be a native app built with EAS: no WebView wrapper, no PWA.
- Secrets (service-role key, AI signing secret, push dispatch secret) never ship in the app.
- iOS distribution requires an Apple Developer account and valid signing (ad hoc or App Store).
- Android Google Maps tiles in release builds need a Google Maps Android API key.
- Background location is optional and limited by the operating system.

### 2.5 Assumptions and dependencies
- Users have a camera and GPS; connectivity may be weak or absent.
- Routing uses an OSRM-compatible server (the public demo server is for light testing only).
- Hazard data is crowd-sourced and may be incomplete. The app says so wherever it shows route safety.

---

## 3. Functional requirements

Priority: **M** = must, **S** = should. Verification column: test IDs from `TESTING.md`.

### 3.1 Authentication & accounts (AUTH)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-AUTH-01 | Users can sign up with full name, e-mail and password (≥ 8 chars, a letter and a digit; Arabic letters and digits accepted). | M | U-VAL, DB-T01 |
| FR-AUTH-02 | E-mail verification is required before sign-in; the app offers to resend the e-mail. | M | Manual M-02 |
| FR-AUTH-03 | Sign-in with e-mail and password; clear, translated errors for wrong credentials and unverified e-mail. | M | U-ERR |
| FR-AUTH-04 | Password recovery by e-mail link that opens the app (`roadshield://auth/callback`) and lets the user set a new password. | M | I-AUTH (recovery detection) |
| FR-AUTH-05 | Sessions persist across restarts in the iOS Keychain / Android Keystore and refresh automatically. | M | I-AUTH (secure storage) |
| FR-AUTH-06 | Users can edit their name and profile photo, and sign out. | M | DB-T07b, Manual M-03 |
| FR-AUTH-07 | Users can permanently delete their account; their photos and personal data are removed, and reports they made are anonymised. | M | Edge function `delete-account`, Manual M-04 |
| FR-AUTH-08 | Three roles (citizen, maintenance officer, admin) are enforced on the server; a user cannot change their own role or suspension. | M | DB-T07a, T08, T23, I-AUTH |
| FR-AUTH-09 | Suspended accounts cannot submit reports. | S | DB `ACCOUNT_SUSPENDED` |

### 3.2 Onboarding (ONB)

| ID | Requirement | P |
|---|---|---|
| FR-ONB-01 | A 4-screen animated onboarding (welcome, AI detection, live map, community) with illustrations, progress dots, *Skip* and *Get started*. | M |
| FR-ONB-02 | Location, camera and notification permissions are requested only when a feature first needs them, with an explanation shown first. | M |

### 3.3 Home dashboard (HOME)

| ID | Requirement | P |
|---|---|---|
| FR-HOME-01 | Personalised greeting, current city (reverse geocoded) and whether location is available. | M |
| FR-HOME-02 | Safety overview of verified hazards near the user, computed from the database (no invented city ratings). | M |
| FR-HOME-03 | Nearby verified hazards, the user's recent reports and report statistics, and active maintenance updates on the user's reports. | M |
| FR-HOME-04 | Quick Report and Open Map buttons, a safety-tips carousel, and a notification bell with unread count. | M |

### 3.4 Live road map (MAP)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-MAP-01 | Full-screen native map centred on the user (initial demo area: New Damietta, Egypt), usable worldwide. | M | Manual M-05 |
| FR-MAP-02 | Only verified / assigned / in-progress / reopened hazards are shown to citizens. | M | DB-T10, T15 |
| FR-MAP-03 | Markers by category (pothole, crack, surface damage, flooding, damaged signage, obstruction, street lighting, other), coloured by severity, clustered when zoomed out. | M | |
| FR-MAP-04 | Tapping a marker opens a bottom sheet with details, photos (privacy-approved only), priority, confirmations and actions. | M | DB-T16 |
| FR-MAP-05 | Filter by category, search by city or place, nearby-hazard list, standard and satellite map types. | M | |
| FR-MAP-06 | Offline: the last cached verified hazards are shown with a clear "offline: may be out of date" banner. | M | |

### 3.5 AI hazard detection (AI)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-AI-01 | Users can capture a photo or pick existing photos (up to 6). | M | U-VAL |
| FR-AI-02 | The first photo is sent to the AI service, which returns the predicted category, confidence, bounding boxes, model name and version (and an annotated image on request). | M | AI-API, AI-E2E |
| FR-AI-03 | Results come only from the trained model (YOLOv8s on RDD2022: potholes, cracks, surface damage). Unknown classes are ignored, never guessed. | M | AI-DET |
| FR-AI-04 | Below 50 % confidence the app asks the user to double-check; the user can always correct the category. | M | AI-API (`low_confidence`) |
| FR-AI-05 | If the service is not configured, unreachable, has no model or fails, the app shows **"AI analysis unavailable — continue manually."** and never fabricates a detection. | M | AI-API 503, U-I18N |
| FR-AI-06 | Results are signed; the database stores them only if the signature is valid and the result was issued to the submitting user. | M | DB-T04a/b/c, AI-E2E |
| FR-AI-07 | Before the camera opens, the app shows a notice not to use it while driving; the user must confirm (re-asked after 30 minutes). | M | |

### 3.6 Reporting (REP)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-REP-01 | Multi-step form: photos → AI review → category & severity → description → location (GPS fix with accuracy, or manual pin) → review → submit. | M | I-REP |
| FR-REP-02 | Each report gets a unique public code `RS-YYMM-NNNNN`. | M | DB-T02 |
| FR-REP-03 | Drafts are saved on the device (SQLite + local photo files) and can be resumed later or offline. | M | I-REP |
| FR-REP-04 | Upload progress is shown per photo; partially uploaded drafts resume where they stopped. | M | I-REP |
| FR-REP-05 | Before submitting, similar active reports within 50 m are suggested; the user can confirm the existing one instead. | M | DB `find_possible_duplicates` |
| FR-REP-06 | Client and server validation (1–6 photos, valid coordinates, category, severity, ≤ 1000-char description). | M | U-VAL, I-REP, DB |
| FR-REP-07 | Submission is idempotent: retries never create duplicates. | M | DB-T03, I-REP |
| FR-REP-08 | A success screen shows the report code and links to tracking. | M | |
| FR-REP-09 | Rate limits: 10 reports per hour, 30 per day per user. | S | DB-T34 |

### 3.7 Safety warnings & route assistant (WARN / ROUTE)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-ROUTE-01 | Choose start (current location or search) and destination; fetch up to 3 real routes from the routing service. | M | |
| FR-ROUTE-02 | For each route: verified hazards within 35 m of the path, count by severity, and an exposure indicator (severity-weighted hazards per 10 km). | M | U-WARN |
| FR-ROUTE-03 | Compare alternative routes side by side; durations are the routing engine's own estimates (no live traffic, no invented ETAs). | M | |
| FR-ROUTE-04 | If routing is unavailable, offer navigation in Apple Maps / Google Maps. | M | |
| FR-ROUTE-05 | A disclaimer states that hazard data may be incomplete and the app does not guarantee road safety. | M | |
| FR-WARN-01 | While a route is followed with the app open, warn about the next verified hazard **ahead** within a configurable distance (150 / 300 / 500 / 800 m), with a banner, haptics and optional voice. | M | U-WARN |
| FR-WARN-02 | No warning for hazards already passed or when the user is more than 80 m off the route; each hazard is announced at most once per 10 minutes. | M | U-WARN |
| FR-WARN-03 | Optional background alerts only after the user enables them and grants "Always" location; the app explains that the OS limits how often they run and never promises real-time background warnings. | S | |

### 3.8 Priority engine (PRIO)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-PRIO-01 | Priority 0–100 from severity (40 %), independent confirmations (20 %), age (15 %), traffic exposure (15 %, excluded when unknown) and maintenance status (10 %). Resolved, rejected and duplicate hazards score 0. | M | DB-T31–33, U-PRIO |
| FR-PRIO-02 | Levels: ≥ 70 High, ≥ 40 Medium, otherwise Low. | M | U-PRIO |
| FR-PRIO-03 | The app explains each factor's contribution and states that the score is not an accident prediction. | M | C-PRIO |
| FR-PRIO-04 | Calculations are deterministic and identical on server and client. | M | U-PRIO (28 server-computed cases) |

### 3.9 Profile & tracking (PROF / TRACK)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-PROF-01 | Profile with participation metrics computed from the user's own data (reports, verified, resolved, confirmations). No invented impact figures. | M | |
| FR-PROF-02 | My reports and history, saved locations (max 10), notification preferences, language, theme (system / dark / light), privacy information, help & support, account deletion. | M | |
| FR-TRACK-01 | A timeline of Submitted → Under review → Verified → Assigned → In progress → Resolved, plus Rejected, Duplicate and Reopened, each with timestamp and note. | M | C-TIME, DB-T12 |
| FR-TRACK-02 | Status changes follow a server-side state machine and notify the reporter. | M | DB-T13, T14, T26 |
| FR-TRACK-03 | The reporter can reopen a resolved hazard. | S | DB-T27 |

### 3.10 Maintenance officer (OFF)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-OFF-01 | Work tab with scopes *My tasks*, *Unassigned verified*, *History* (admins also *All open*), sorted by priority, with search and category filter. | M | DB-T21 |
| FR-OFF-02 | Claim an unassigned hazard, or be assigned one by an admin, with an optional due date. | M | DB-T22 |
| FR-OFF-03 | Update the task to *in progress*, add repair notes and before/after photos, request completion. | M | DB-T24 |
| FR-OFF-04 | Only admins approve completion, which resolves the hazard and notifies the reporter. | M | DB-T25, T26 |
| FR-OFF-05 | Officer routes and RPCs are inaccessible to citizens. | M | I-AUTH, DB-T23 |

### 3.11 Administration (ADM)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-ADM-01 | Dashboard (7 / 30 / 90 days): total reports, active hazards, pending verification, resolved, average and median resolution time, daily trend, reports by category and region, officer workload, priority mix. All computed from stored data. | M | DB-T29 |
| FR-ADM-02 | Priority heatmap over a geographic grid. | M | |
| FR-ADM-03 | Moderation queue: verify, reject, mark duplicate (link to original), approve photo privacy, set traffic exposure. | M | DB-T12, T16 |
| FR-ADM-04 | User management: search, filter by role, change role, suspend or reactivate; the last admin cannot be demoted. | M | DB-T28 |
| FR-ADM-05 | Bilingual system announcements to all users. | M | |
| FR-ADM-06 | Audit log of every privileged action (role changes, moderation, assignments, suspensions). | M | DB-T30, T08c |

### 3.12 Notifications (NOTIF)

| ID | Requirement | P |
|---|---|---|
| FR-NOTIF-01 | Native push notifications through Expo Push (APNs / FCM) using real device tokens registered after permission is granted. | M |
| FR-NOTIF-02 | Types: report confirmation, verification update, nearby hazard, maintenance progress, report resolved, system announcement. | M |
| FR-NOTIF-03 | Sent in the recipient's language and only if their preferences allow. Delivery status is recorded (`sent / failed / skipped / no_tokens`) and never shown as successful when it is not. | M |
| FR-NOTIF-04 | In-app notification history with unread state and live updates (Realtime). | M |

### 3.13 Offline (OFFL)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-OFFL-01 | Connection status banner. | M | |
| FR-OFFL-02 | Cached verified hazards and the user's reports when offline. | M | |
| FR-OFFL-03 | Offline drafts, pending-upload queue, automatic retry with exponential backoff (30 s → 30 min) when connectivity returns. | M | I-REP |
| FR-OFFL-04 | Conflict handling: queued drafts are locked; the server is authoritative; permanent errors are shown for review. | M | I-REP |

### 3.14 Language (I18N)

| ID | Requirement | P | Verified by |
|---|---|---|---|
| FR-I18N-01 | Every screen, form, alert, status, notification and error exists in English and Arabic. | M | U-I18N |
| FR-I18N-02 | Arabic uses a true RTL layout (`I18nManager`), Arabic typography (IBM Plex Sans Arabic) and Arabic-Indic number formatting. | M | C-TIME (ar) |
| FR-I18N-03 | The language defaults to the device language and can be changed in Settings (the app reloads to switch direction). | M | |

---

## 4. Non-functional requirements

| ID | Category | Requirement | Verified by |
|---|---|---|---|
| NFR-SEC-01 | Security | RLS on all 13 public tables; all writes go through security-definer RPCs that check `auth.uid()` and role. Direct table writes are denied. | DB-T06, T35, T36 |
| NFR-SEC-02 | Security | Only the publishable (anon) key is in the app. The service-role key, AI signing secret and dispatch secret live only on the server. | Code review, `env.ts` |
| NFR-SEC-03 | Security | Uploads only into the user's own storage folder; reports may only reference the user's own photos. | DB-T05 |
| NFR-SEC-04 | Security | Rate limits on report submission (DB) and AI analysis (12 / minute / user). | DB-T34, AI-SEC |
| NFR-SEC-05 | Security | The AI service verifies Supabase JWTs (ES256 via JWKS; HS256 via `/auth/v1/user`) and rejects wrong audience, issuer, expired or foreign-key tokens. | AI-SEC |
| NFR-PRIV-01 | Privacy | Photos are re-encoded on the phone and on the server, removing EXIF/GPS/device metadata. | AI-IMG |
| NFR-PRIV-02 | Privacy | Faces (ResNet-10 SSD) and licence plates are blurred where detectable; photos are visible to other users only after staff privacy approval. | AI results §Privacy, DB-T16 |
| NFR-PRIV-03 | Privacy | Citizens can read only their own profile; other users' e-mails are visible only to admins. | DB-T19 |
| NFR-PERF-01 | Performance | AI inference ≤ 300 ms p95 on 2 CPU threads (measured: 185 ms). | AI results |
| NFR-PERF-02 | Performance | Map queries are bounded by viewport with a server-side limit; PostGIS GiST and lat/lng indexes. | |
| NFR-PERF-03 | Performance | Photos are resized to ≤ 1600 px and JPEG 82 % before upload. | |
| NFR-REL-01 | Reliability | No duplicate reports from retries (idempotency key). Each push notification is dispatched at most once. | DB-T03, I-REP |
| NFR-USE-01 | Usability | Follows Apple HIG and Material 3 conventions: bottom tab bar, bottom sheets, pull to refresh, haptics, skeleton loaders. | |
| NFR-ACC-01 | Accessibility | Screen-reader roles and labels on interactive elements, enlarged hit areas (`hitSlop`) on small controls, system font scaling up to 160 %, reduced-motion support, colour never the only signal (icons + text on every status). | C-BTN |
| NFR-SAFE-01 | Safety | No camera use encouraged while driving; warnings are glanceable with optional voice; no claims of guaranteed safety; priority ≠ accident prediction. | |
| NFR-HON-01 | Data integrity | No fabricated statistics, routes, ETAs, detections, notifications or build artifacts. | AI-API 503, U-I18N |
| NFR-MAIN-01 | Maintainability | TypeScript strict mode, typed API layer, schema in versioned migrations, CI workflow. | `tsc --noEmit` |
| NFR-PORT-01 | Portability | One codebase for iOS and Android via Expo / EAS; AI service as a Docker image. | Build validation |

---

## 5. External interfaces

- **User interface**: see `DESIGN.md` §8 (design system) and the screens under `src/app`.
- **Software**: Supabase REST/RPC, Auth, Storage, Realtime; AI service REST (`API.md`); OSRM
  `/route/v1/driving`; Expo Push API; native maps (Apple Maps / Google Maps SDK).
- **Hardware**: GPS, camera, haptics engine, speaker (voice warnings).
- **Communication**: HTTPS only; JWT bearer tokens.

## 6. Requirement coverage summary

| Area | Requirements | Automated verification |
|---|---|---|
| Security & permissions | AUTH, NFR-SEC, NFR-PRIV | 42 database tests on the live project · 11 client auth/guard tests · 12 AI auth tests |
| Reporting & offline | REP, OFFL | 13 integration tests |
| AI | AI, NFR-PERF-01 | 33 AI service tests · real-model evaluation · end-to-end signed submission |
| Priority | PRIO | 28 server-computed parity cases + 7 property tests |
| Language | I18N | 6 translation-parity tests |
| UI components | TRACK, PRIO-03, ACC | 7 component tests |
