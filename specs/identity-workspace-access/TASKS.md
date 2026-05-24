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
- [ ] Add last workspace persistence service.
- [x] Add branding resolver.
- [x] Add permission helper.
- [ ] Add audit events for activation/revocation/switch.

## Phase 4 - Login And Workspace UX

- [ ] Add `Coach Enterprise` code entry without breaking coach standalone login.
- [ ] Add workspace selector for 2+ workspaces.
- [ ] Preserve direct redirect for one workspace.
- [ ] Add enterprise staff route isolation.
- [ ] Keep student login direct unless multiple student contexts exist.

## Phase 5 - Guards

- [ ] Route matrix in middleware/proxy.
- [ ] Server action guards.
- [ ] Repository filters for standalone vs enterprise.
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
