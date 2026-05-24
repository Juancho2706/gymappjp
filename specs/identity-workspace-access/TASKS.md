# Identity Workspace Access - TASKS

**Status:** ACTIVE
**Owner:** EVA
**Last updated:** 2026-05-24
**Spec:** `specs/identity-workspace-access/SPEC.md`
**Plan:** `specs/identity-workspace-access/PLAN.md`

---

## Phase 0 - Audit And Spec Lock

- [x] Create SPEC.
- [x] Create PLAN.
- [x] Create TASKS.
- [x] Audit existing enterprise identity tables at planning level.
- [x] Confirm current partial model: `organization_members.user_id`, nullable `coach_id`, `organization_invites.token_hash`, `clients.org_id`, `coaches.active_org_id`, `org_managed`.
- [ ] Audit current RLS policies table by table.
- [ ] Audit route/middleware guards.
- [ ] Audit storage buckets and paths.
- [ ] Audit login redirects and local cache usage.

## Phase 1 - Contracts

- [x] Define `ActiveWorkspace`.
- [x] Define `WorkspaceSummary`.
- [x] Define `WorkspaceBrand`.
- [x] Define workspace permissions.
- [ ] Add shared Zod schemas if needed.

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
- [ ] Add audit events for revocation and invite creation.
- [x] Add audit events for activation/switch. Completed 2026-05-24 18:22:42 -04:00.

## Phase 4 - Login And Workspace UX

- [x] Add `Coach Enterprise` code entry without breaking coach standalone login.
- [x] Add workspace selector for 2+ workspaces. Completed 2026-05-24 18:17:52 -04:00.
- [x] Preserve direct redirect for one workspace. Completed 2026-05-24 18:17:52 -04:00.
- [ ] Add enterprise staff route isolation.
- [ ] Keep student login direct unless multiple student contexts exist.

## Phase 5 - Guards

- [x] Route matrix helper before middleware/proxy integration.
- [ ] Route matrix in middleware/proxy for org/student routes.
- [x] Route matrix in middleware/proxy for coach routes. Completed 2026-05-24 18:24:45 -04:00.
- [ ] Server action guards.
- [ ] Repository filters for standalone vs enterprise across all coach domains.
- [x] Repository/action filters for `/coach/clients`. Completed 2026-05-24 18:34:11 -04:00.
- [x] Repository/action filters for workout library and builder mutations. Completed 2026-05-24 18:48:30 -04:00.
- [x] DB/read filters for nutrition plans/templates. Completed 2026-05-24 18:53:54 -04:00.
- [ ] Storage policy checks.
- [ ] Export/report guards.

## Phase 6 - QA

- [ ] Seed local multi-workspace data.
- [ ] Negative tests org A vs org B.
- [ ] Standalone coach unaffected.
- [ ] Enterprise coach no billing/brand.
- [ ] Student enterprise gets org brand.
- [ ] Student standalone gets coach brand.
- [ ] Revoked workspace cannot re-enter.
