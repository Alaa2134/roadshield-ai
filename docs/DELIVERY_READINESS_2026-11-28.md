# RoadShield AI — delivery readiness and honest demo checklist

**Snapshot:** 28 November 2026 (Egypt). This is a live integration prototype, **not** a validated municipal production rollout.

## Verified working

- **Public website:** https://roadshield-ai-eg.vercel.app ; Vercel production build READY; public homepage loaded and served without a Vercel login wall.
- **Vision API:** https://roadshield-vision-api.vercel.app/health ; real external GET returned `status=ok`, `model_loaded=true`, `model_name=roadshield-rdd-yolov8s`, 4 classes (longitudinal crack, transverse crack, alligator crack, pothole), `auth_configured=true`, `signing_configured=true`. A third-party pretrained ONNX model is used. API repo implementation is in PR #17, merged to PR #1's development branch.
- **Web and DB CI:** GitHub Actions Web + database and CI succeeded for current development changes. Security SQL 42/42, enterprise SQL 83/83.
- **Offline evidence integrity:** Missing queued photo references cannot silently disappear; 9 integration tests in `__tests__/integration/field-outbox-evidence.test.ts`. Issue #10 closed as **code fixed on branch**.
- **Invitations:** Stale inviter and invitation role-change protections in migration 20261127100800. Issue #11 closed as **code fixed on branch**.
- **Concurrent last-owner transitions:** 20261127101000 migration and `supabase/tests/last_owner_concurrency.sh`; two real simultaneous-session tests passed, leaving one owner in both cases. PR #18 merged to development branch, issue #14 closed as **code fixed on branch**.
- **Android APK prior version:** run #15 had successful release APK build and Android emulator smoke test. A previous Android APK is available but **predates the live AI API binding**.

## Release gates still unverified / not delivered

1. **AI-connected Android APK:** commit `fda5845` configures the public Vision API URL. Build **#16** https://github.com/Alaa2134/roadshield-ai/actions/runs/46074282282 must complete and its APK artifact must be installed and tested on a real device. Do not use the previous APK to claim live AI support.
2. **Authenticated end-to-end inference:** log in on a physical Android device; submit a consented road image + GPS; verify `POST /v1/analyze` supplies an AI result with valid HMAC and submission creates one correct report in Supabase. Then confirm an authorized staff view displays it and a repair workflow can be completed.
3. **Billing/finance concurrency test:** invoice approval contract-lock fix is in migration 20261127100900; a **separate, true two-session regression** is still missing. Issue #12 remains open.
4. **Staging/pilot:** project PR #1 remains Draft and not merged to `main`, though the live Supabase database has enterprise migrations. Do not assume any branch migration or fix is deployed to live without checking Supabase migration history.
5. **Model benchmark:** no verified training on real RDD2022, no Egypt-road held-out precision/recall/mAP. Existing third-party YOLOv8s weights are identified as AGPL-3.0 in model card. Do not market accuracy or ownership of the weights without evidence/license review.
6. **Operational readiness:** backups/restore drill, production incident monitoring, email auth flows, real iPhone/Android QA and access-control audit have not been proven.
7. **Visual quality:** live homepage renders with photographs and bilingual switch, but a full RTL/mobile accessibility sign-off and user testing are pending.

## Demo flow for competition (use real values; never invent results)

1. Open https://roadshield-ai-eg.vercel.app and show the actual bilingual homepage.
2. Open https://roadshield-vision-api.vercel.app/health and show `model_loaded=true`.
3. Install **Android build #16** once the artifact is successful. Start with login, give camera and location permissions.
4. Photograph a real road defect in an appropriate safe location (never while driving). Get user consent if people/license plates appear. Let RoadShield Vision analyze it; if AI fails, show the truthful manual-entry fallback.
5. Submit one report; confirm its server record with a genuine authenticated account and show staff queue or real report status.
6. Show road/finance dashboard only with records actually in the project. Empty states are acceptable; label demo/illustrative previews clearly.
7. Explain next steps: RDD2022 training/benchmark and real Egyptian pilot validation.

## References

- Product PR: https://github.com/Alaa2134/roadshield-ai/pull/1
- Vision deployment PR: https://github.com/Alaa2134/roadshield-ai/pull/17
- Owner concurrency PR: https://github.com/Alaa2134/roadshield-ai/pull/18
- Android connected build: https://github.com/Alaa2134/roadshield-ai/actions/runs/46074282282
- Pilot acceptance issue: https://github.com/Alaa2134/roadshield-ai/issues/13
- Training benchmark issue: https://github.com/Alaa2134/roadshield-ai/issues/15
