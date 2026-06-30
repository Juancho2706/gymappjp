# Identity Workspace Access - PLAN

**Status:** ACTIVE
**Owner:** EVA
**Last updated:** 2026-05-24
**Spec:** `specs/identity-workspace-access/SPEC.md`

---

## Architecture

Target flow:

```text
auth.users
  -> workspace resolver
    -> ActiveWorkspace
      -> permission helper
      -> branding resolver
      -> route/server-action guards
      -> UI
```

No UI should infer authority from a global role. Every protected path must resolve the workspace first and then evaluate permissions.

## Existing Model To Preserve

- `clients.org_id IS NULL` means standalone student.
- `clients.org_id IS NOT NULL` means enterprise student.
- `organization_members.user_id` is the enterprise identity.
- `organization_members.coach_id` links enterprise coach capability.
- `subscription_status = 'org_managed'` means coach plan is managed by enterprise.
- `/org/login` remains staff enterprise login.
- `/coach/*` remains coach surface.
- `/c/[coach_slug]/*` remains student surface.

## Proposed Data Additions

Create only after local audit and migration review:

### `workspace_preferences`

Purpose: remember last valid workspace without using localStorage as authority.

Candidate columns:

- `id uuid primary key`
- `user_id uuid references auth.users(id)`
- `last_workspace_type text`
- `last_org_id uuid null references organizations(id)`
- `last_coach_id uuid null references coaches(id)`
- `last_client_id uuid null references clients(id)`
- `updated_at timestamptz`

### Enterprise activation code model

Use existing `organization_invites` if it can be safely extended. Otherwise create a new table.

Required properties:

- code/token stored hashed only;
- expiry;
- status;
- role/scope;
- optional expected email;
- org id;
- created_by;
- redeemed_by;
- redeemed_at;
- attempt count / rate limit support;
- audit events.

Do not reuse `coaches.invite_code` for enterprise coach authentication.

## Domain Contracts

Add or update shared/domain types:

- `ActiveWorkspace`
- `WorkspaceType`
- `WorkspaceSummary`
- `WorkspacePermission`
- `WorkspaceBrand`

Preferred location:

- shared web/mobile contract: `packages/types`
- web domain helpers: `apps/web/src/domain/auth` or `apps/web/src/domain/org`

## Services

Create services after contract lock:

- `workspace.service.ts`
  - `listUserWorkspaces(userId)`
  - `resolveActiveWorkspace(userId, requested?)`
  - `setLastWorkspace(userId, workspace)`
  - `assertWorkspaceAccess(userId, workspace)`

- `workspace-brand.service.ts`
  - `resolveBrandForWorkspace(workspace)`

- `workspace-permissions.service.ts`
  - `can(workspace, permission, resource?)`

## Route Matrix

| Route | Allowed workspace |
|---|---|
| `/org/[slug]/*` | `enterprise_staff` only |
| `/coach/subscription` | `coach_standalone` only |
| `/coach/settings` | `coach_standalone` only for brand/billing sections |
| `/coach/clients` | `coach_standalone`, `enterprise_coach` scoped |
| `/coach/nutrition-plans` | `coach_standalone`, `enterprise_coach` scoped |
| `/c/[coach_slug]/*` | `student_standalone`, `student_enterprise` scoped |
| `/join/[invite_code]` | student join only, not enterprise staff/coach auth |

## Implementation Sequence

1. Audit current DB/routes/RLS.
2. Create contracts/specs.
3. Add local migration for `workspace_preferences` if needed.
4. Decide whether to extend `organization_invites` or add dedicated enterprise activation table.
5. Add workspace resolver service.
6. Add branding resolver service.
7. Add route/permission matrix.
8. Add login UX for `Coach Enterprise` code activation.
9. Add workspace switcher.
10. Add negative tests and Supabase local seed coverage.

## Rollback

- Do not mutate existing standalone auth behavior until resolver is behind explicit calls.
- Local migrations first.
- Production/live migration later with backup.
- If resolver causes incorrect routing, fallback to existing `resolvePostLoginRedirect` while keeping DB additions harmless.

## Local To Live Migration Path

1. Apply migrations locally against cloned Supabase data.
2. Run typecheck and local smoke tests.
3. Verify no existing standalone coach/client rows are changed by migration.
4. Verify new tables/columns are nullable/defaulted or backfilled safely.
5. Before live: backup live DB.
6. Apply migrations live during low-traffic window.
7. Keep code paths feature-gated until post-migration checks pass.
8. If issue appears, disable new resolver/code paths first; DB additions are additive and can remain inert.

Current additive migrations:

- `supabase/migrations/20260524155213_workspace_preferences.sql`
- `supabase/migrations/20260524155600_extend_organization_invites_workspace.sql`

## Verification

- `npm run typecheck`
- DB migration dry-run locally.
- RLS negative tests org A/org B.
- Playwright smoke:
  - standalone coach login;
  - enterprise staff login;
  - enterprise coach login;
  - student standalone;
  - student enterprise;
  - revoked workspace.
