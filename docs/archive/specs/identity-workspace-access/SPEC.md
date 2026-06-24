# Identity Workspace Access - SPEC

**Status:** ACTIVE
**Owner:** EVA
**Last updated:** 2026-05-24
**Parent plan:** `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md`

---

## Problem

EVA now has two business flows that share auth, coaches, clients, branding and student dashboards:

- `coach standalone -> alumno`
- `enterprise -> coach enterprise -> alumno enterprise`

If identity and workspace rules stay implicit, future features can leak data, show enterprise UI to standalone users, or let enterprise state overwrite standalone billing/branding.

## Goal

Create a canonical identity/workspace model that keeps one global person identity while allowing multiple isolated workspaces:

```text
auth.user unico
  -> coach_standalone
  -> enterprise_coach
  -> enterprise_staff
  -> student_standalone
  -> student_enterprise
```

## Non-Goals

- Rebuild all auth screens in the first pass.
- Add native mobile app code now.
- Replace Supabase Auth.
- Add paid identity providers.
- Change live production data before local migrations and rollback are verified.

## Current Audit Summary

Existing useful pieces:

- `auth.users` already acts as global identity.
- `check_platform_email_availability` exists for global email checks.
- `organizations` exists.
- `organization_members.user_id` exists and separates staff users from coach rows.
- `organization_members.coach_id` is nullable for enterprise staff.
- `organization_invites` exists with `token_hash`, `expires_at`, `used_at`.
- `is_active_org_member(p_org_id)` exists for RLS.
- `clients.org_id` exists; `NULL` means standalone.
- `coaches.active_org_id` exists.
- `subscription_status = 'org_managed'` exists.
- Coach settings/subscription are already hidden/blocked for `org_managed`.
- Enterprise brand publish already syncs to enterprise coaches.

Gaps:

- No canonical `ActiveWorkspace` type yet.
- No `workspace_preferences` table yet.
- `coaches.active_org_id` only supports one active org and is not enough for future multi-org/multi-role.
- `organization_invites` is email/token based, but UX requirement needs a clear coach-enterprise code activation flow.
- `coaches.invite_code` is public/plain and currently doubles as student join code; it must not become enterprise auth.
- Login redirect still resolves by broad heuristics, not by explicit workspace preference.
- Student multi-context is not modeled explicitly.
- Branding resolver is spread across middleware/pages instead of centralized by workspace.

## Required Workspaces

```ts
type ActiveWorkspace =
  | { type: 'coach_standalone'; userId: string; coachId: string }
  | { type: 'enterprise_coach'; userId: string; orgId: string; coachId: string; memberId: string }
  | { type: 'enterprise_staff'; userId: string; orgId: string; memberId: string; role: 'org_owner' | 'org_admin' | 'ops' | 'analyst' | 'brand_manager' }
  | { type: 'student_standalone'; userId: string; clientId: string; coachId: string }
  | { type: 'student_enterprise'; userId: string; clientId: string; orgId: string; coachId: string | null }
```

## Access Rules

- Standalone coach sees standalone coach features only.
- Enterprise coach sees coach operations under org constraints.
- Enterprise coach does not see billing or own brand settings.
- Enterprise staff sees `/org/[slug]` only if membership allows it.
- Student enterprise sees org branding.
- Student standalone sees coach branding.
- Same email can have multiple workspaces but one active workspace per session.
- UI hiding is never authorization.

## Data Rules

- Enterprise reads/writes must include `org_id`.
- Standalone reads/writes must exclude `org_id` when operating standalone data.
- Revocation changes membership/workspace status, not global identity.
- Invite/code redemption writes audit events.
- Exports and storage need tenant context.

## UX Rules

- One workspace: redirect directly.
- Multiple workspaces: use last valid workspace, with switcher available.
- Revoked last workspace: show selector or login context choice.
- Web/PWA and future React Native share the same workspace contract.

## Acceptance Criteria

- [ ] SPEC/PLAN/TASKS exist.
- [ ] Current DB/auth/routing model is audited.
- [ ] `ActiveWorkspace` contract is defined in shared/domain layer.
- [ ] Workspace resolver can list available workspaces for a user.
- [ ] Workspace preference can persist last workspace safely.
- [ ] Branding resolver can derive brand from workspace.
- [ ] Route guards block wrong workspace types.
- [ ] Enterprise coach code activation is scoped, audited, expiring and rate-limited.
- [ ] Standalone coach flow keeps working unchanged.
- [ ] Student enterprise/standalone branding remains isolated.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Treating role as global | Cross-context access | Workspace-scoped permissions only. |
| Reusing public coach invite code for enterprise access | Account takeover/confusion | Separate enterprise activation codes from student join codes. |
| `active_org_id` as source of truth forever | Cannot support multi-org or multi-role | Introduce workspace resolver/preference. |
| Missing `org_id` filters | Tenant data leak | RLS + repository guards + negative tests. |
| Local cache stale after revocation | Revoked access persists in UI | Server validation on workspace entry. |
