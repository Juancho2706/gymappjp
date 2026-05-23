# Enterprise Org Management - SPEC

**Status:** RETROACTIVE  
**Owner:** EVA  
**Last updated:** 2026-05-23  
**Related area:** `apps/web/src/app/org/[slug]`

---

## Problem

Gym owners and organization admins need a separate management surface to coordinate multiple coaches, shared clients, security posture, and operational reporting without mixing sessions with individual coach accounts.

## Users

- Primary: organization owner/admin
- Secondary: coaches attached to an organization
- Internal/operator: EVA support/admin

## Goals

- Provide a dedicated org dashboard under `/org/[slug]`.
- Keep org sessions isolated from coach/client sessions.
- Support org-level visibility into members, clients, invoices, and performance.
- Keep MFA enforcement compatible with enterprise access.

## Non-Goals

- Native mobile enterprise app.
- Full billing automation for every enterprise tier.
- Replacing individual coach dashboards.

## User Stories

- As an org owner, I want to see organization-level activity, so I can manage gym operations.
- As an org admin, I want to review coaches and clients, so I can detect workload and adherence issues.
- As EVA support, I want org routes separated from coach routes, so enterprise issues are easier to support.

## Acceptance Criteria

- [x] `/org/login` authenticates enterprise users.
- [x] Successful login redirects to `/org/[slug]`.
- [x] Org data is loaded through org repositories/services where already available.
- [x] MFA setup can be enforced by middleware.
- [x] Auth cookies remain isolated by subdomain/domain policy.
- [ ] Remaining `_data` direct Supabase calls are audited in `docs/architecture/CLEAN_ARCHITECTURE_AUDIT.md`.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Org and coach auth confusion | Users land in wrong surface | Keep separate login UI and explicit coach footer link. |
| Direct query drift | Future changes bypass service contracts | Migrate org `_data` calls module by module. |
| Enterprise scope creep | Delays revenue MVP | Validate sales flow before building native enterprise parity. |

## Open Questions

- [ ] Which org reports are required for first paid enterprise pilot?
- [ ] Should org invoices become self-serve or remain operator-managed in Phase 1?

