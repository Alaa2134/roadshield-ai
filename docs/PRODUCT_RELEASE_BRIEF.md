# RoadShield AI — Product & Design Direction (owner-approved, 27 Nov 2026)

## North star
Build a **credible, field-ready Egyptian road infrastructure product**, not a generic AI dashboard/template. Users: citizen reporter; road inspector/engineer; municipality operator; contractor; finance reviewer. Pilot location: New Damietta. Web = public trust + operational control. Phone = low-friction real-world reporting and field workflows. Every data claim must come from real records.

## Resource and Claude Pro budget
- Reuse existing code in PR #1 (Next.js 16, Expo/React Native, Supabase, MapLibre, existing tests) rather than rewrite. Search before creating a component.
- **No paid services, API credits, bought GPU/compute units, or speculative tool calls**. GitHub Actions CI should run once per meaningful code batch, not repeated loops with no changes.
- Implement in focused batches, max one active @claude job for RoadShield. No AI-generated placeholder copy or mock customer logos. Avoid needless full-app rewrites and repeated dependency reinstalls.
- Fail fast on missing platform permissions/credentials; report a single, precise owner action. No production deployment, database mutation, secret reads/writes, billing, real-user notifications, app store releases, or model deployment without approval.
- Distinguish built vs tested vs on-device verified; preserve @claude OAuth workflow in main; don't merge PR #1 until CI/security release gates pass.

## Visual identity — distinctive road infrastructure, not SaaS/AI template
Brand story: the materiality of real asphalt, survey markings, street grids, road surface texture, maintenance blueprints, measured damage and repair evidence. Premium **civil-engineering command center**, not glowing AI bubbles.
- Palette: ink/navy #071629, asphalt graphite #151A22, off-white #F6F4EE, road/traffic amber #F3B33D for decisive accents, technical cyan/teal sparingly for intelligence, safety red only for critical issues. Maintain accessible text and chart semantics. Preserve existing brand cues when sensible.
- Typographic hierarchy: distinctive display face paired with precise, compact body and monospaced data labels; use licensed web fonts and strong Arabic RTL equivalents. Headings with editorial rhythm, deliberate negative space, no wall-to-wall cards.
- Imagery: actual photographs of roads/damage/field crews only with valid licences/credits. Existing photos may be reused after verifying attribution. Do not fabricate 'before/after repairs' or imply synthetic samples are actual local results. Map/vector motifs may be illustrated when labeled.
- Motion: subtle progressive reveal, scan line/map focus and hover feedback only if functional; respects reduced-motion, never heavy animation or auto-playing gimmicks.

### Public homepage / marketing
1. Immersive asymmetrical hero: real road photograph or licensed atlas/map treatment; concise mission-led headline and one main CTA to **See a product walkthrough**, one secondary CTA to request pilot. Visually memorable art direction, readable without image.
2. Show product through a **real, navigable product preview** with interactive map and clearly labeled sample/illustrative preview data, NOT fake live statistics.
3. Tell one coherent story: Detect → Verify → Plan → Repair → Measure, with visual transitions grounded in actual workflow/screens.
4. Use authentic feature detail: inspection fields, condition confidence/provenance, budget-vs-commitment distinction, private photo evidence, audit trails. Real empty states are not marketing failures.
5. A short, persuasive contact section; fast initial load, no fake testimonials, awards, prices, clients, SLA or accuracy metrics.
6. Arabic first-class and English parity with true RTL (text, alignment, charts, navigation), excellent narrow iPhone and large desktop layouts.

### RoadShield OS / operational app
- Map-led, actionable dashboard with 1 primary operational focus area, a compact status rail, severity legend and latest verified events (empty means empty). Avoid 20 equally weighted KPI cards.
- Interaction hierarchy: search/filters; selected road's provenance, last inspection, last verified condition; clear next action; understandable error and loading states.
- Financial figures must be explicit: approved budget vs estimate vs commitment vs invoice vs verified actual vs paid; no misleading totals or color-only meanings. Respect viewer role.
- High-density readable tables, keyboard navigation, thoughtful grouping of sidebar, accessible forms, clear destructive-action confirmations. Arabic labels should not clip.

### Mobile / Field Mode
- Citizen first: **Report damage in 3 clear steps**: capture photo → locate/verify GPS + consent → review/submit, with edit/cancel and privacy explanation. AI detection optional; manual submission always available.
- Field staff: clear assigned inspection/work-order queue, on-site evidence with timestamp/location, visible offline state/outbox retry, upload progress and failures. Don't mark work/photos delivered when missing.
- Native-feeling iOS and Android, safe area/notch/keyboard, readable tap targets >=44pt, efficient low bandwidth, good accessibility, no Android 'iOS glass copied badly' aesthetic.
- Make one consistent component system and hand-tuned first-time states, error states, loading states and permission denial states.

## ML training — credible free-GPU pipeline
Current state: code and Colab notebook exist in `ml/`; **no training on real RDD2022**. Synthetic 48-image smoke test mAP50 0.0 is NOT a real benchmark.
1. Dataset official source: https://doi.org/10.6084/m9.figshare.21431547.v1 ; validate license and Figshare-reported MD5 using existing `ml/datasets/download_rdd2022.py`. Avoid unverified mirrors unless independently revalidated.
2. First choice: **Kaggle Notebooks free accelerator** (user's account availability/quota-dependent). Fallback: **Google Colab free GPU** (dynamic availability/limits). Never assume guaranteed free hours. **No paid GPU** without separate approval.
3. Prepare **Kaggle-ready notebook** as sibling to existing Colab notebook, or document precise portable run config. Verify on CPU for imports/config with tiny synthetic fixture, not a claimed GPU training run. If no GPU access in connected tooling, make it runnable by user with a short UI checklist rather than burning Claude credits trying remote execution.
4. Start with a modest **real** RDD2022 stratified subset (subject to available resources), fine-tune an appropriate public pre-trained detector rather than full 47k from random weights. Fix seed, validate class mapping (D00,D10,D20,D40), group near-duplicates and split by location/video/country where possible. Preserve a never-tuned held-out test set. Avoid test leakage and synthetic augmentation in test.
5. Checkpoints and resume are mandatory; include safe recovery after 12h runtime expiry. Record exact model/backbone/version/license, hashes, input resolution, batch size, epochs, GPU model, actual GPU runtime, training/validation curves, mAP50/mAP50-95, precision/recall per class, confusion/error galleries and CPU latency. Label all unexecuted results `NOT RUN`.
6. Add deployment adapter only when candidate ONNX exports are actually tested against the AI service, with decoding/postprocess, signed results, privacy safeguards, error handling and metrics gate. No silent model replacement. Real Egyptian phone photos require appropriate consent and separate local validation.

## Work sequence and acceptance
**Gate 0 (P0 safety)**: preserve fixes from issues #11,#12,#14, outstanding evidence-photo outbox fix, ensure DB migration ledger/rollback, concurrent finance tests. If open P0 security problems exist, no release.
**Gate 1 (design first batch)**: targeted homepage + app dashboard design refinements **and** mobile report workflow visual polish, preserving functionality; commit changes to PR #1 branch and link exact files. Test web typecheck/unit/build, mobile typecheck/Jest where possible, at least 390px/desktop/Arabic/dark/reduced-motion. Share screenshots if tooling permits. No fake data.
**Gate 2 (training readiness)**: Kaggle-ready reproducible notebook/checkpoint-resume with CPU dry-run validation, documented manual free GPU setup. Do not claim actual training unless real run logs exist.
**Gate 3 (staging)**: real Supabase Auth/Storage, user role isolation, pilot E2E, real iPhone/Android (manual if device unavailable), deployment only with approval.
**Gate 4 (pilot proof)**: real report photo & GPS → staff approval → road status → work order → repair evidence → finance closure, with verified timestamps, consent and documented results.

Quality bar: not 'looks pretty'; looks **purpose-built**, fast, legible, inclusive, and operates on actual field data. No cosmetic feature at expense of correctness.
