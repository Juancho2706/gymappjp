# Identity Workspace Access - TASKS

**Status:** ACTIVE
**Owner:** EVA
**Last updated:** 2026-05-26
**Spec:** `specs/identity-workspace-access/SPEC.md`
**Plan:** `specs/identity-workspace-access/PLAN.md`

---

## Phase 0 - Audit And Spec Lock

- [x] Create SPEC.
- [x] Create PLAN.
- [x] Create TASKS.
- [x] Audit existing enterprise identity tables at planning level.
- [x] Confirm current partial model: `organization_members.user_id`, nullable `coach_id`, `organization_invites.token_hash`, `clients.org_id`, `coaches.active_org_id`, `org_managed`.
- [x] Audit current RLS policies table by table. Completed 2026-05-25 18:12:17 -04:00.
- [x] Audit route/middleware guards. Completed 2026-05-25 18:35:14 -04:00. Found and closed `/org/*` broad membership gap: enterprise coaches no longer qualify for org dashboard routes.
- [x] Audit storage buckets and paths. Completed 2026-05-25 18:14:16 -04:00.
- [x] Audit login redirects and local cache usage. Completed 2026-05-25 18:40:56 -04:00. Post-login redirects now prefer server-side `workspace_preferences`; no auth/workspace permission relies on `localStorage`.

## Phase 1 - Contracts

- [x] Define `ActiveWorkspace`.
- [x] Define `WorkspaceSummary`.
- [x] Define `WorkspaceBrand`.
- [x] Define workspace permissions.
- [x] Add shared Zod schemas if needed. Completed 2026-05-25 18:40:56 -04:00. `EnterpriseCoachLoginSchema` moved to `@eva/schemas` for web/PWA and future React Native parity.

## Phase 2 - Supabase Local Migrations

- [x] Design `workspace_preferences` migration.
- [x] Decide whether to extend `organization_invites` or add dedicated enterprise activation table.
- [x] Add constraints/indexes for workspace safety.
- [x] Regenerate/update `database.types.ts`.
- [x] Document local/live migration path.

## Phase 3 - Services

- [x] Add workspace resolver service.
- [x] Add last workspace persistence service.
- [x] Add branding resolver.
- [x] Add permission helper.
- [x] Add audit events for revocation and invite creation. Completed 2026-05-25 18:30:08 -04:00.
- [x] Add audit events for activation/switch. Completed 2026-05-24 18:22:42 -04:00.

## Phase 4 - Login And Workspace UX

- [x] Add `Coach Enterprise` code entry without breaking coach standalone login.
- [x] Add workspace selector for 2+ workspaces. Completed 2026-05-24 18:17:52 -04:00.
- [x] Preserve direct redirect for one workspace. Completed 2026-05-24 18:17:52 -04:00.
- [x] Add enterprise staff route isolation. Completed 2026-05-25 18:35:14 -04:00. `/org/*` is limited to `org_owner`, `org_admin`, and future staff roles; `role=coach` stays in `/coach/*`.
- [x] Keep student login direct unless multiple student contexts exist. Completed 2026-05-25 18:23:07 -04:00. Current DB supports one client row per auth user; future multi-student contexts need a client identity model migration.

## Phase 5 - Guards

- [x] Route matrix helper before middleware/proxy integration.
- [x] Route matrix in middleware/proxy for org/student routes. Completed 2026-05-25 18:35:14 -04:00. Org route middleware validates staff membership by slug; student routes already validate direct client or org client + active coach membership.
- [x] Route matrix in middleware/proxy for coach routes. Completed 2026-05-24 18:24:45 -04:00.
- [ ] Server action guards.
  - [x] Guard pass 1 for org/client enterprise mutations. Completed 2026-05-26 19:55:20 -04:00. Covered brand/org updates, coach invites/removal/reassignment, client create/import/assign. Verification: `npm run typecheck`.
  - [ ] Guard pass 2 for announcements, nutrition templates, payments, onboarding, exports/reports.
- [x] Repository filters for standalone vs enterprise across high-risk coach domains. Completed 2026-05-25 18:12:17 -04:00.
- [x] Repository/action filters for `/coach/clients`. Completed 2026-05-24 18:34:11 -04:00.
- [x] Repository/action filters for workout library and builder mutations. Completed 2026-05-24 18:48:30 -04:00.
- [x] DB/read filters for nutrition plans/templates. Completed 2026-05-24 18:53:54 -04:00.
- [x] Action filters for primary nutrition template/plan mutations. Completed 2026-05-24 18:59:44 -04:00.
- [x] Action filters for nutrition cycles/history edge cases. Completed 2026-05-25 17:50:22 -04:00.
- [x] Coach dashboard data/API filters for active workspace. Completed 2026-05-25 17:58:56 -04:00.
- [x] Mobile coach API filters for active workspace. Completed 2026-05-25 17:58:56 -04:00.
- [x] RLS guards for sensitive workspace tables. Completed 2026-05-25 18:12:17 -04:00.
- [x] Storage policy checks. Completed 2026-05-25 18:14:16 -04:00.
- [ ] Export/report guards.

## Phase 6 - QA

- [ ] Seed local multi-workspace data.
- [ ] Negative tests org A vs org B.
- [ ] Standalone coach unaffected.
- [ ] Enterprise coach no billing/brand.
- [x] Student enterprise gets org brand. Completed 2026-05-25 18:17:31 -04:00.
- [ ] Student standalone gets coach brand.
- [x] Revoked workspace cannot re-enter. Completed 2026-05-25 18:27:32 -04:00 for enterprise coach removal path.
