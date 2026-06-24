# Enterprise Subdomain - TASKS

**Status:** RETROACTIVE  
**Owner:** EVA  
**Last updated:** 2026-05-23  
**Spec:** `specs/enterprise-subdomain/SPEC.md`

---

## Completed

- [x] Enterprise login shell and footer exist.
- [x] Enterprise login tests exist in `tests/enterprise-login.spec.ts`.
- [x] Auth UX/security blueprint exists in `docs/architecture/AUTH_UX.md`.
- [x] Turnstile manual setup documented in `docs/operations/MANUAL_TASKS.md`.

## Remaining

- [ ] Keep subdomain routing E2E coverage current.
- [ ] Add Storybook stories for enterprise auth components.
- [ ] Verify production env vars before flipping any new enterprise auth flags.
- [ ] Update canonical flow docs when enterprise landing/routing changes.

## Universal Definition of Done

- [ ] `npm run typecheck`
- [ ] Targeted tests for touched domain
- [ ] No direct feature-data Supabase calls in `_data`
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Dark mode checked when UI changes
- [ ] Docs updated when routes, flows, DB, tests, or priorities change

