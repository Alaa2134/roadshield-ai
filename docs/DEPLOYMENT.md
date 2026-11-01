# RoadShield AI — Deployment & release builds

Status on 31 Oct 2026: the **Supabase backend is live** (project `roadshield-ai`,
`vdfvoxvkxicemgqrsxjh`, eu-central-1) with all 14 migrations, RLS, both Edge Functions and the
secrets in place. The app bundles and prebuilds for both platforms. What remains needs **your**
accounts: Expo (EAS builds), Apple Developer (iOS), Google (Maps key, FCM, Play Console), and a host
for the AI container.

## 0. Accounts you need

| For | Account | Cost |
|---|---|---|
| Any build | Expo account (expo.dev) | free tier works |
| iPhone install / TestFlight / App Store | Apple Developer Program | 99 USD / year |
| Google Play | Google Play Console | 25 USD once |
| Maps on Android | Google Cloud project with *Maps SDK for Android* | free quota |
| Push on Android | Firebase project (FCM) | free |
| AI service | Any Docker host: Google Cloud Run, Render, Fly.io, Railway, a VPS | small instance |

## 1. Backend (Supabase)

Already applied to the live project. To recreate it elsewhere:

```bash
npx supabase link --project-ref <ref>
npx supabase db push                                   # applies supabase/migrations
npx supabase functions deploy push-dispatch --no-verify-jwt
npx supabase functions deploy delete-account
```

Then store the server-side secrets (SQL editor, as the project owner):

```sql
insert into app_private.settings (key, value) values
  ('ai_signing_secret',    '<64 random hex chars, also given to the AI service>'),
  ('push_dispatch_secret', '<64 random hex chars>'),
  ('push_dispatch_url',    'https://<ref>.supabase.co/functions/v1/push-dispatch')
on conflict (key) do update set value = excluded.value;
-- the first administrator: becomes admin automatically when this e-mail is verified
insert into app_private.admin_bootstrap_emails (email) values ('you@example.com');
```

In the live project the three secrets are set, and **your account e-mail is registered as the first
admin**: sign up in the app with it and verify the e-mail.

**Dashboard settings to check** (Authentication → URL Configuration / Emails):
- Add `roadshield://auth/callback` to *Redirect URLs* (e-mail confirmation and password reset open the app).
- Keep *Confirm email* on.
- Configure custom SMTP before real users sign up. Supabase's built-in mailer is rate-limited and meant for testing.
- Optional: enable leaked-password protection.

## 2. AI service

```bash
cd services/ai
unzip ../../roadshield-ai-models.zip -d models/     # or: bash scripts/fetch_models.sh
cp .env.example .env    # AI_SIGNING_SECRET = the same value as ai_signing_secret above
                        # AI_SUPABASE_URL = https://vdfvoxvkxicemgqrsxjh.supabase.co
docker build -t roadshield-ai .
docker run -p 8080:8080 --env-file .env roadshield-ai
curl http://localhost:8080/health                  # model_loaded: true
```

Google Cloud Run example:

```bash
gcloud run deploy roadshield-ai --source services/ai --region europe-west1 \
  --memory 1Gi --cpu 1 --allow-unauthenticated \
  --set-env-vars AI_SUPABASE_URL=https://vdfvoxvkxicemgqrsxjh.supabase.co \
  --set-secrets AI_SIGNING_SECRET=roadshield-ai-signing:latest
```

`--allow-unauthenticated` only opens the network path: every request still needs a valid
RoadShield user session. Note the HTTPS URL; the app needs it as `EXPO_PUBLIC_AI_API_URL`.
Until it is set, the app works fully and shows *"AI analysis unavailable — continue manually."*

## 3. Mobile app: one-time EAS setup

```bash
npm ci
npm install --global eas-cli
eas login
eas init                      # creates the EAS project and prints its ID
```

`app.config.ts` is dynamic, so put the printed values in **both** places:
- `.env`: `EAS_PROJECT_ID=<id>` and `EXPO_OWNER=<your expo username>`
- `eas.json` → `build.base.env`: the same two keys

Bundle ID / package name: `com.roadshieldai.app` (change `APP_BUNDLE_ID` before the first store
upload if you want another one; it cannot change afterwards).

EAS environment variables (expo.dev → project → Environment variables, or the CLI):

```bash
eas env:create --environment preview    --name EXPO_PUBLIC_AI_API_URL --value https://<ai-host> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_AI_API_URL --value https://<ai-host> --visibility plaintext
eas env:create --environment preview    --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --visibility sensitive
eas env:create --environment production --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --visibility sensitive
# Android push: download google-services.json from Firebase (Android app = com.roadshieldai.app)
eas env:create --environment preview    --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
```

Push credentials:
- **Android**: in Firebase → Project settings → Service accounts, generate a key, then
  `eas credentials -p android` → *Google Service Account* → *FCM V1* → upload it.
- **iOS**: EAS creates the APNs key during the first iOS build when you log in with your Apple account.

Google Maps key: restrict it to *Maps SDK for Android*, package `com.roadshieldai.app` and the
SHA-1 fingerprint shown by `eas credentials -p android`. iOS uses Apple Maps, so no key is needed.

## 4. Preview builds (internal testing)

### Android APK
```bash
npm run validate                                   # typecheck + tests + bundle
eas build --platform android --profile preview
```
EAS generates and stores the upload keystore on the first run. When the build finishes, the CLI
prints the **build ID** and an **artifact URL / QR code**. Open it on the phone to install the APK
(allow "install unknown apps" for the browser).

### iPhone IPA (ad hoc)
```bash
eas device:create                                  # share the link/QR with each tester's iPhone
eas build --platform ios --profile preview
```
Log in with your Apple Developer account when asked. EAS creates the distribution certificate and
an **ad hoc provisioning profile that includes the registered devices**. Only those iPhones can
install the build. Re-run `eas build` after registering new devices. iOS 16+ testers must turn on
*Settings → Privacy & Security → Developer Mode*.

## 5. Production builds and store submission

```bash
eas build --platform all --profile production     # Android .aab + iOS App Store .ipa
```

**TestFlight / App Store**: create the app in App Store Connect (bundle ID `com.roadshieldai.app`),
put its *Apple ID* number in `eas.json → submit.production.ios.ascAppId`, then:
```bash
eas submit --platform ios --profile production --latest
```
The build appears in TestFlight after Apple's processing. Add internal testers there.

**Google Play**: create the app in Play Console. Upload the **first** `.aab` manually (Internal
testing track). After that:
```bash
eas submit --platform android --profile production --latest   # needs a Play service-account key
```

Store listing must-haves: privacy policy URL (location, camera, photos, account data), data-safety
form (location and photos collected, shared with the city administration, deletion supported), and
the background-location declaration for Google Play (background alerts are optional and off by
default; record a short video of the opt-in screen).

## 6. Continuous integration
- `.github/workflows/ci.yml`: typecheck, Jest, both bundles, expo-doctor, AI pytest on every push.
- `.github/workflows/eas-build.yml`: manual "Run workflow" button that starts an EAS build. Add
  the repository secret `EXPO_TOKEN` (expo.dev → Access tokens).

## 7. After the first build
Run the manual checklist in `TESTING.md` §4 on a real Android phone and iPhone, and record the build
IDs and artifact URLs in your report.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank map on Android release | `GOOGLE_MAPS_ANDROID_API_KEY` missing or not restricted to the build's SHA-1 |
| Push settings say "not configured" | No EAS project ID in the build, or (Android) no `GOOGLE_SERVICES_JSON` / FCM V1 key |
| E-mail links open a browser, not the app | Add `roadshield://auth/callback` to Supabase redirect URLs |
| AI says unavailable | Check `GET /health`: `model_loaded`, `signing_configured`, `auth_configured` must be true |
| AI result not saved (`ai_verified=false`) | The AI service secret differs from `app_private.settings.ai_signing_secret` |
| iPhone cannot install the preview | Device not registered before the build: `eas device:create`, then rebuild |
