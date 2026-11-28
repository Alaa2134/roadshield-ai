# Security and data protection

RoadShield does **not** claim any security certification (ISO 27001, SOC 2, …). This document
describes what is implemented and tested, and what still needs doing before production.

## Implemented

| Area | Implementation | Evidence |
|---|---|---|
| Authentication | Supabase Auth: e-mail verification, bcrypt password hashing, short-lived JWTs, refresh rotation. Org creation requires a verified e-mail | E01 |
| Tenant isolation | RLS on every enterprise table; org membership checked in every RPC | E16–E19, E52–E55, E62, E2E cross-tenant checks |
| Granular roles | 6 org roles + platform admin; finance read and approve rights separated; contractors see only their own contracts, work orders, invoices and costs | E08, E22, E29, E37–E40, E47–E51 |
| Write path | No direct table writes for `authenticated`; only validated `SECURITY DEFINER` RPCs with `search_path = ''` | migrations |
| Financial approvals | Four-eyes rule; commitment/overpayment/source guards; every action audited per org | E28, E41–E46, E61 |
| Invitations | 192-bit random tokens, stored as SHA-256 only, single use, bound to the verified e-mail, expiring | E04–E07 |
| Rate limiting | Per-user fixed windows (org creation, invitations, acceptance, citizen reports); anonymous contact form limited per e-mail and globally | migrations |
| Storage | Private buckets; signed URLs; per-folder upload policies (`<org>/<uid>/…`); document rows tie objects to an org entity | storage policies |
| Image privacy | EXIF/GPS stripping on device; face and plate blurring in the AI service; staff approval before public display | services/ai tests |
| AI integrity | HMAC-signed detection results bound to the requesting user and image hash | 42-test suite T04 |
| Web | CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; CSV exports neutralise formula injection; Server Action allow-list; honeypot on the public form | `next.config.ts`, `api/export` |
| Mobile | Session in SecureStore/Keychain; no service keys in the app; only the publishable key ships | app config |
| Secrets | Service-role key, AI signing secret and webhook URLs are server-side env/secrets only | `.env.example` files |

## Required before production

1. Apply the enterprise migrations to the production project, then run both SQL suites against
   it (they roll themselves back).
2. Supabase dashboard: enable leaked-password protection, set the minimum password length to 10,
   configure SMTP, set the site URL and redirect URLs for the web domain, and enable MFA for owners
   and finance managers.
3. Run `get_advisors` (security + performance) and resolve findings.
4. Backups: enable PITR (Pro plan) or schedule `pg_dump` to encrypted object storage. Test a
   restore quarterly. The SQL suites double as a post-restore smoke test.
5. Logging and monitoring: ship Postgres/API logs to a SIEM. Add error reporting (e.g. Sentry) to web
   and mobile with PII scrubbing.
6. Independent penetration test and a DPIA for the citizen-image processing.
7. Responsible disclosure: publish security.txt pointing to the contact form or a security address.

## Known limitations

* The local dev gateway (`supabase/local/dev-gateway`) is for tests only: it skips Storage and
  uses an HS256 dev secret. Never expose it.
* Face/plate redaction is best-effort, which is why staff approval stays mandatory.
* Platform admins can manage organisations but cannot read tenant finance. Support access needs an
  explicit, audited temporary membership.

## Organization verification (migration `20261127101100`)

A new organization is created in **limited mode** (`verification_status = 'pending'`). Every
role-checked write RPC goes through `app_private.require_org_role`, which now raises
`ORG_NOT_VERIFIED` unless the organization is `verified`. Only setup actions use
`require_org_role_any_status`: editing the profile, setting the service area, choosing the
jurisdiction, uploading verification documents and submitting them.

* **Jurisdiction:** `admin_areas` holds country → governorate → city/district. Egypt's 27
  governorates are seeded from ISO 3166-2:EG, plus the pilot city New Damietta. An organization
  picks its governorate and either an existing city/district or requests a new one (EN + AR
  names); a requested area becomes active only when the organization is approved. Other countries
  are supported by adding their areas (`admin_add_area` for platform admins).
* **Documents:** PDF/JPG/PNG files go to the private `org-documents` bucket under
  `<org>/<uploader>/…` and are registered with `register_verification_document`
  (`org_documents.entity_type = 'organization'`, with a `doc_kind`). Only the organization's
  owners and platform admins can read them; admins open them through short-lived signed URLs.
  Submission requires a governorate, an official letter and an authorization document.
* **Review:** `review_org_verification` is platform-admin only. The reviewer must not be a member
  or the creator of the organization, a rejection needs a reason, and approval activates any
  requested area. `set_org_suspended` suspends or reinstates with a reason. All steps are audited.
* **Tests:** enterprise SQL E80–E93; web E2E journey covers banner → blocked write → jurisdiction →
  two uploads → submit → admin queue with signed document links → approval.
