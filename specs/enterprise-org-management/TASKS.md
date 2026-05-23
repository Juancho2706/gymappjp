# Enterprise Org Management - TASKS

**Status:** RETROACTIVE  
**Owner:** EVA  
**Last updated:** 2026-05-23  
**Spec:** `specs/enterprise-org-management/SPEC.md`

---

## Completed

- [x] Enterprise login page exists at `/org/login`.
- [x] Org route area exists at `/org/[slug]`.
- [x] Org queries use repository helpers for the main org route.
- [x] Enterprise auth UX documented in `docs/architecture/AUTH_UX.md`.
- [x] Login hardening added: generic errors, fail counter, Turnstile helper, timing jitter.

## Remaining

- [ ] Confirm first paid pilot reporting requirements.
- [ ] Audit all org/admin `_data` direct Supabase usage.
- [ ] Move low-risk org reads through service/repository contracts.
- [ ] Add Storybook stories for enterprise login shell/components.
- [ ] Add/maintain E2E coverage for enterprise login and subdomain access.

## Universal Definition of Done

- [ ] `npm run typecheck`
- [ ] Targeted tests for touched domain
- [ ] No direct feature-data Supabase calls in `_data`
- [ ] Server actions validate with Zod
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Dark mode checked when UI changes
- [ ] Docs updated when routes, flows, DB, tests, or priorities change

