# RoadShield AI — engineering operating rules for Claude Code

## Mission
Build a **working, evidence-based road-damage reporting and maintenance product** for a controlled
New Damietta pilot. A good UI is not proof of a working product.

## Source of truth
- The enterprise/web/Field-mode candidate is draft PR **#1** from
  `claude/roadshield-ai-production-u7mtac`. It is **not yet merged** into `main`.
- The live Supabase database is `vdfvoxvkxicemgqrsxjh`, but production access is **not a test
  environment**. Current enterprise migrations already exist there; verify migration state
  before proposing any changes.
- `.github/workflows/claude.yml` on `main` is the verified Claude Pro OAuth integration. Preserve
  its normalized-token launcher when bringing other branches into main.

## Non-negotiable integrity
1. **No invented facts:** do not fabricate client names, pricing, real inspections, defects,
   financial amounts, model precision/mAP, traffic, savings, deployment or test results. Show
   honest empty states and `NOT VERIFIED` where evidence is absent.
2. **Strong tenancy:** every org read/write must be constrained by the authenticated user's
   membership and role. Do not weaken RLS or `SECURITY DEFINER` guards to fix an error. Audit
   definer grants and `search_path` on every added function.
3. **Financial truth:** keep budget, estimate, commitment, invoiced, verified actual and payment
   separate. Decimal strings end-to-end; approvals require distinct actors where mandated.
4. **Privacy:** consent for GPS and images; strip photo metadata; no public citizen photos without
   staff approval; private storage/signed URLs; no hidden leaks in logs/analytics.
5. **AI honesty:** synthetic fixture results are engineering smoke tests only. Third-party
   pretrained models are not RoadShield-trained. No accuracy claims without held-out real
   benchmark, per-class metrics, model/version provenance and evaluation plan.
6. **Offline reliability:** persist uploads/drafts; retry idempotently; never silently mark evidence
   as delivered if files are lost or missing; expose recoverable errors to staff.

## Shipping gates
- Do not merge draft PR #1, deploy production, change live Supabase, create paid services, publish
  mobile releases, send real-user notifications, or touch account secrets without explicit owner
  approval. Preview/staging changes also require a clear target and reproducible tests.
- Every scoped implementation should land in a reviewable branch/PR, with a problem statement,
  file-by-file summary, relevant security notes, specific executed tests and failures.
- Run applicable checks and report results faithfully: mobile typecheck/Jest/Expo bundle, web
  typecheck/unit/build/E2E, local PostGIS RLS/enterprise SQL, AI service pytest, and ML tests.
  If tooling forbids testing, say **NOT RUN** — never turn documentation into fresh evidence.
- Manual launch gates: real Supabase Auth/Storage E2E on staging, Android+iPhone device testing,
  offline recovery, data privacy, real road photo+GPS → staff review → work order → verification,
  backup restore, observability and incident handling.

## Collaboration protocol
- Read the issue or PR context before modifying code. Keep each task focused; avoid simultaneous
  broad rewrites of PR #1.
- State `PASS / FAIL / NOT VERIFIED` with exact code paths and evidence. Identify P0 blockers
  separately from enhancements.
- Never print tokens, passwords, `.env` values or user data into issues, PRs or CI logs.
- When blocked by missing accounts, hardware, permissions or data, give one precise owner action,
  then continue with independent safe improvements.
