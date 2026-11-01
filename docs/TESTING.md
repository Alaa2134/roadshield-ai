# RoadShield AI — Testing

## 1. Strategy

| Level | Tool | Where | What it proves |
|---|---|---|---|
| Static | TypeScript strict (`noUncheckedIndexedAccess`) | whole app + tests | Type safety across the codebase |
| Unit | Jest (jest-expo) | `__tests__/unit` | Pure logic: priority, geo, warnings, validation, errors, translations |
| Component | React Native Testing Library 14 | `__tests__/component` | Rendering, accessibility roles, user actions, RTL language |
| Integration | Jest with faked Supabase / storage / SQLite | `__tests__/integration` | Report submission, offline queue, auth session, role guards, secure storage |
| Database security | PL/pgSQL scenario script, run as real Postgres roles | `supabase/tests/database_security_tests.sql` | RLS, privileges, role checks, state machine, notifications, rate limits, priority |
| AI service | pytest + FastAPI TestClient | `services/ai/tests` | Auth, signing, decoding, privacy, API contract |
| Model | `services/ai/scripts/evaluate.py` | real photos | Real model behaviour, latency, redaction false positives |
| End-to-end | AI service → live database | `docs/test-results/ai-service-results.md` §3 | A real signed detection is accepted and stored |
| Build | Metro export, `expo prebuild`, offline SDK version check | `docs/test-results/build-validation.txt` | Both platforms bundle and generate native projects |
| Manual | Real devices (checklist §4) | after an EAS preview build | Camera, GPS, push, maps, RTL on hardware |

## 2. Running the tests

```bash
npm run typecheck                 # tsc --noEmit (strict)
npm test                          # all Jest suites
npm run test:ci                   # with coverage
npm run bundle:check              # Android + iOS production bundles
cd services/ai && python -m pytest -q
psql "$DATABASE_URL" -f supabase/tests/database_security_tests.sql   # or paste into the SQL editor
```

The database script runs inside one transaction that always ends with an exception carrying the
results, so it never leaves data behind. It is safe to run against the live project.

## 3. Results (31 October 2026)

| Suite | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Jest | ✅ **106 / 106** tests, 10 suites |
| Database security (live Supabase project) | ✅ **42 / 42** |
| AI service pytest | ✅ **33 / 33** |
| Real model on 112 held-out crack photos | detections on 37.5 %, p95 185 ms; see analysis |
| End-to-end signed real detection → live DB | ✅ `ai_verified=true`, stored with model version |
| Android + iOS Hermes bundles | ✅ 7.4 MB / 7.3 MB |
| `expo prebuild` (both platforms) | ✅ |
| SDK compatibility (43 Expo packages) | ✅ |
| EAS APK / AAB / IPA | ⏳ requires the project owner's Expo and Apple accounts (see `DEPLOYMENT.md`) |

Raw outputs: `docs/test-results/`.

### Supabase advisors (live project, after the last migration)
- **Security**: 21 × *"signed-in users can execute SECURITY DEFINER function"* (WARN). Intended:
  these RPCs are the only write path and each checks `auth.uid()` and the caller's role itself;
  citizens calling admin or officer functions get `NOT_AUTHORIZED` (DB-T08a/b, T23). `anon`
  cannot execute any of them (DB-T36). No missing-RLS or exposed-secret findings.
- **Performance**: the 10 unindexed foreign keys were fixed by migration
  `20261031132340_foreign_key_indexes`. The only remaining notes are "unused index" (INFO),
  expected on a database with no traffic yet.

### Test catalogue (IDs used in the SRS)

| ID | File | Tests | Covers |
|---|---|---|---|
| U-PRIO | `unit/priority.test.ts` | 35 | 28 cases computed by the live `compute_priority` replayed exactly; documented examples; determinism; inactive statuses; missing traffic data; factor explanation |
| U-GEO | `unit/geo.test.ts` | 5 | Haversine, point-to-segment, distance along a polyline, bounding boxes, bearings |
| U-WARN | `unit/warnings.test.ts` | 7 | Route corridor matching and ordering, exposure, warn only ahead and within threshold, never for passed hazards or when off route, 10-minute anti-spam |
| U-VAL | `unit/validation.test.ts` | 13 | E-mail normalisation, password rules incl. Arabic letters and digits, confirmation match, report limits (photos, coordinates, category, length) |
| U-I18N | `unit/i18n.test.ts` | 6 | Same keys in EN and AR, no empty strings, matching `{{variables}}`, Arabic script used, every category/severity/status translated, honest AI fallback text present |
| U-ERR | `unit/errors.test.ts` | 9 | Server and auth error mapping, network detection, typed `unwrap` |
| C-BTN | `component/Button.test.tsx` | 2 | Accessible role and name, action fires, disabled and loading states block presses |
| C-TIME / C-PRIO | `component/StatusTimeline.test.tsx` | 5 | All six main stages with timestamps and staff notes, side states (Reopened), Arabic rendering, priority badge, explanation says it is not an accident prediction |
| I-REP | `integration/report-submission.test.ts` | 13 | Upload paths in the owner folder, exact RPC arguments, resume after partial upload, AI payload forwarded only when signed, other-account drafts refused, client validation, already-attached photos, network → queued with backoff, permanent error → failed, queue sync when back online, batch stops on network loss |
| I-AUTH | `integration/auth-and-permissions.test.tsx` | 11 | Session restore + role load, password-recovery detection, sign-out resets permissions, staff mapping, admin/officer route guards for 4 roles, Keychain chunking, stale-chunk cleanup, corrupted session handling |
| DB-T01…T36 | `supabase/tests/database_security_tests.sql` | 42 | See `test-results/database-security-tests.txt` |
| AI-SEC | `services/ai/tests/test_security.py` | 12 | HMAC equals Postgres, canonical JSON, tamper detection, ES256 JWKS verification and rejections, HS256 fallback, rate limiter |
| AI-DET | `services/ai/tests/test_detector.py` | 7 | Letterbox, decoding, NMS, thresholds, missing model reported (not faked), category mapping ignores unknown classes |
| AI-IMG | `services/ai/tests/test_imaging.py` | 7 | EXIF/GPS stripped, orientation, bad and tiny uploads, redaction leaves clean images untouched |
| AI-API | `services/ai/tests/test_api.py` | 7 | Health, 503 without model or secret, 401 without a valid user, signed round trip with `requested_by`, 400/413, 429 |
| AI-E2E | `test-results/ai-service-results.md` | 1 | Real model → signed payload → `submit_hazard_report` on the live database |

## 4. Manual device checklist (run on the preview build)

| ID | Scenario | Expected |
|---|---|---|
| M-01 | First launch in Arabic phone language | Arabic UI, right-to-left layout, onboarding with Skip and progress dots |
| M-02 | Sign up → open verification e-mail on the phone | Link opens the app; account verified; sign-in works |
| M-03 | Change profile photo, name, theme (dark/light), language | Applied immediately (language switch reloads into the new direction) |
| M-04 | Delete account from Settings | Confirmation required; account and photos removed; sign-in no longer possible |
| M-05 | Open the map in New Damietta, zoom out, switch to satellite | Clusters, severity colours, bottom sheet on tap |
| M-06 | Report with camera, AI service online | Boxes and confidence shown; category editable; success code `RS-…` |
| M-07 | Same with AI service stopped | "AI analysis unavailable — continue manually." and report still possible |
| M-08 | Airplane mode → create report → reconnect | Saved as queued; uploads automatically when back online; one report only |
| M-09 | Admin verifies the report | Reporter receives a push in their language; timeline shows Verified |
| M-10 | Officer claims, starts, uploads before/after photos, requests completion; admin approves | Statuses progress; reporter notified of resolution |
| M-11 | Route with a verified hazard on it, walk/drive along as a passenger | Banner (and voice if enabled) once, before reaching it |
| M-12 | VoiceOver / TalkBack on the report flow | Every control announced with a meaningful label |
| M-13 | Reduce Motion enabled | Animations simplified |
