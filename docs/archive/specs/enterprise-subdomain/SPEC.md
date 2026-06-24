# Enterprise Subdomain - SPEC

**Status:** RETROACTIVE  
**Owner:** EVA  
**Last updated:** 2026-05-23  
**Related area:** `enterprise.eva-app.cl`, `/enterprise`, `/org/*`

---

## Problem

Enterprise buyers need a dedicated, credible surface for EVA Enterprise that separates gym/academy operations from the individual coach product.

## Users

- Primary: gym owner, academy director, franchise operator
- Secondary: org admin/owner
- Internal/operator: EVA sales/support

## Goals

- Route enterprise traffic through a dedicated subdomain.
- Present enterprise landing/login as a separate product surface.
- Keep auth cookies isolated between main and enterprise surfaces.
- Preserve working coach/client flows on the main domain.

## Non-Goals

- Separate deployment.
- Shared auth cookie across subdomains.
- Native enterprise mobile app in this phase.

## User Stories

- As a gym owner, I want a dedicated enterprise site, so I can evaluate EVA for my organization.
- As an org admin, I want a separate login surface, so I do not confuse enterprise access with coach access.
- As EVA support, I want subdomain isolation, so auth/session issues are easier to reason about.

## Acceptance Criteria

- [x] Enterprise login uses a distinct dark/amber identity.
- [x] Coach login and enterprise login are visually and semantically distinct.
- [x] Cookie isolation policy is documented in `docs/architecture/AUTH_UX.md`.
- [x] Enterprise auth footer links individual coaches back to `eva-app.cl`.
- [ ] Subdomain routing behavior remains covered by enterprise E2E tests.
- [ ] Future landing/subdomain changes update canonical architecture docs.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Subdomain routing regression | Enterprise login/funnel breaks | Keep E2E smoke coverage for `/org/login` and subdomain routing. |
| Cookie sharing temptation | Cross-subdomain CSRF/session confusion | Keep isolation policy explicit and documented. |
| Overbuilding enterprise before sales validation | Slower revenue MVP | Build landing/login/support first, validate pilot needs before native parity. |

## Open Questions

- [ ] What is the minimum enterprise landing needed for first demo conversion?
- [ ] Which enterprise domain/env vars are required in every Vercel environment?

