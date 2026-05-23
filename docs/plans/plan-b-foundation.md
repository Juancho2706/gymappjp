# Plan B - Foundation: Clean Architecture, Atomic Design, Feature-First, SDD

**Version:** 2.2  
**Date:** 2026-05-23  
**Priority:** P1  
**Status:** SESSION 1 COMPLETE  
**Replaces:** `plan-b-design-system.md` scope. Prior plans A/C/D/E were archived/removed in commit `17252b5`.

---

## Executive Decision

This plan is worth executing, but only incrementally.

Do **not** run the whole plan as one refactor. The safe path is:

1. Session 1: docs + specs + audit only. No runtime changes.
2. Session 2: Storybook setup and stories. No component moves.
3. Session 3+: small Clean Architecture fixes by module, with tests.
4. Atomic Design migration: additive only at first. Move files only when usage and imports are proven.

Goal: improve maintainability without breaking working coach/client/org flows.

---

## Current State

| Pillar | State | Gap |
|---|---:|---|
| Clean Architecture | Partial | `domain/`, `infrastructure/db/`, `services/` exist, but many `_data/*.queries.ts` still call Supabase directly. |
| Feature-First | Good | Route-local `_data/_actions/_components` pattern is present across major app areas. |
| Atomic Design | Skeleton | `atoms/`, `molecules/`, `organisms/` exist but are mostly barrels; real reusable auth components now live in `components/auth/`. |
| SDD | Started | `specs/_templates` and retroactive enterprise specs exist. Future features still need specs before code. |
| Storybook | Missing | No `.storybook/`, no `storybook` scripts in `@eva/web`, no visual catalog. |

Important repo reality:

- Monorepo uses root lockfile and workspaces.
- Web app package is `@eva/web` under `apps/web`.
- Root scripts delegate with `-w @eva/web`.
- Storybook commands and CI must respect that layout.

---

## Non-Negotiable Safety Rules

- Keep every change scoped and reversible.
- Never move a component in the same PR/session where Storybook is introduced.
- Never refactor all `_data` files at once.
- Auth/session reads are allowed in `_data` only to establish user context, then pass into services.
- No behavior rewrite while moving queries. Move code first, preserve return shapes.
- Run `npm run typecheck` after every code-changing session.
- Run targeted tests for touched domains.
- `npm run lint` currently has pre-existing failures; do not claim full lint green until those are fixed separately.

---

## Architecture Standard

Preferred data flow:

```text
app/[feature]/_data/*.queries.ts
  -> services/[domain]/*.service.ts
  -> infrastructure/db/*.repository.ts
  -> Supabase
```

Allowed in `_data`:

- `createClient()` to create request-scoped Supabase client.
- `supabase.auth.getUser()` / auth context reads.
- `React.cache`.
- Calling service functions.

Not allowed in `_data` for feature data:

- `supabase.from(...)`
- `supabase.rpc(...)`
- domain mapping/parsing that belongs in service/repository

Temporary exception:

- Admin/service-role operational pages may be audited first and migrated later. They still need explicit documentation if left as-is.

---

## B.1 - Clean Architecture Audit First

### Known Reality

Direct Supabase usage exists beyond the original list. Audit must include:

- `apps/web/src/app/coach/**/_data/*.queries.ts`
- `apps/web/src/app/c/[coach_slug]/**/_data/*.queries.ts`
- `apps/web/src/app/org/**/_data/*.queries.ts`
- `apps/web/src/app/admin/**/_data/*.queries.ts`

### Task B.1

- [x] B.1.1 Create audit doc: `docs/architecture/CLEAN_ARCHITECTURE_AUDIT.md`.
- [x] B.1.2 For every `_data/*.queries.ts`, classify:
  - `OK`: auth/context only + service call.
  - `BYPASS`: feature data uses `.from()` / `.rpc()` directly.
  - `ADMIN_EXCEPTION`: service-role admin page to migrate later.
  - `HIGH_RISK`: large query shape or user-facing critical flow.
- [x] B.1.3 Prioritize fixes by risk:
  1. Low-risk read-only catalogs.
  2. Settings/profile reads.
  3. Coach dashboard.
  4. Student dashboard/workout/nutrition.
  5. Admin pages.
- [x] B.1.4 Do not refactor during audit session.

### Fix Strategy

For each later fix:

- Add repository function first.
- Add service wrapper second.
- Update `_data` last.
- Preserve exact return object.
- Add or update focused tests if mapping logic changes.

---

## B.2 - Atomic Design: Additive, Not Big-Bang

Decision: **Domain-driven components + atomic namespace only for true cross-domain reuse.**

Rule from `AGENTS.md`: promote to `atoms/`, `molecules/`, `organisms/` only when used in **3+ domains** or clearly intended as platform primitive.

### Current Component Guidance

Keep:

- `components/ui/*`: shadcn/base primitives. Do not move.
- `components/auth/*`: auth-domain shared components. Keep here unless reused outside auth.
- `components/coach/*`, `components/client/*`, `components/landing/*`: domain-specific.

Atomic layers should start with:

- `atoms/`: platform primitives not tied to auth/coach/client.
- `molecules/`: reusable composites used in 3+ domains.
- `organisms/`: domain-aware but multi-domain.

### Task B.2

- [ ] B.2.1 Audit component reuse with `rg` before moving anything.
- [ ] B.2.2 Create candidate list with current usage counts.
- [ ] B.2.3 Prefer re-export wrappers over physical moves for first migration.
- [ ] B.2.4 If a file is moved, update imports in same commit and run typecheck.
- [ ] B.2.5 Add Storybook stories for new atomic components.

Do **not** migrate 50+ imports as cleanup. That is churn and risk.

---

## B.3 - SDD: Specs Foundation

Create:

```text
specs/
  _templates/
    SPEC.md
    PLAN.md
    TASKS.md
  enterprise-org-management/
    SPEC.md
    TASKS.md
  enterprise-subdomain/
    SPEC.md
    TASKS.md
```

### Template Rules

`SPEC.md`:

- Problem
- Users
- User stories
- Acceptance criteria
- Out of scope
- Risks

`PLAN.md`:

- Architecture
- Data flow
- DB changes, if any
- Phases
- Test plan
- Rollback plan

`TASKS.md`:

- Atomic tasks
- Owner/status
- Definition of Done

Universal DoD:

- [ ] `npm run typecheck`
- [ ] Targeted tests for touched domain
- [ ] No direct feature-data Supabase calls in `_data`
- [ ] Server actions validate with Zod
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Dark mode checked when UI changes
- [ ] New atomic UI has Storybook story
- [ ] Docs updated when routes, flows, DB, tests, or priorities change

### Task B.3

- [x] B.3.1 Create `specs/_templates/SPEC.md`.
- [x] B.3.2 Create `specs/_templates/PLAN.md`.
- [x] B.3.3 Create `specs/_templates/TASKS.md`.
- [x] B.3.4 Create retro spec `specs/enterprise-org-management/`.
- [x] B.3.5 Create retro spec `specs/enterprise-subdomain/`.
- [x] B.3.6 Link templates from `CLAUDE.md` and `AGENTS.md` only if content changed. Existing docs already had the core rules, so no edit was needed.

Session 1 can safely execute B.3 and B.1 audit.

---

## B.4 - Storybook 8/Latest: Monorepo-Safe Setup

Before install, verify current official package names/version because Storybook changes frequently.

Target:

- Framework: `@storybook/nextjs-vite` if compatible with current Next/React setup.
- Dark-first preview.
- Tailwind v4 via importing `src/app/globals.css`.
- No Chromatic for now.

### Install Commands

Run from repo root:

```bash
npx storybook@latest init --type nextjs --directory apps/web
```

Then normalize package scripts in `apps/web/package.json`:

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

Root convenience scripts may be added:

```json
{
  "scripts": {
    "storybook": "npm run storybook -w @eva/web",
    "build-storybook": "npm run build-storybook -w @eva/web"
  }
}
```

### CI Job

Use root lockfile. Do **not** run `npm ci` inside `apps/web`.

```yaml
storybook-build:
  runs-on: ubuntu-latest
  needs: quality
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - run: npm ci
    - name: Build Storybook
      run: npm run build-storybook -w @eva/web
```

### Stories Priority

Start with components already shared and low-risk:

- `components/auth/AuthFormField.stories.tsx`
- `components/auth/PasswordInput.stories.tsx`
- `components/auth/AuthErrorAlert.stories.tsx`
- `components/auth/AuthSubmitButton.stories.tsx`
- `components/auth/CaptchaSlot.stories.tsx` with mocked/no-site-key state
- `app/org/login/_components/EnterpriseLoginShell.stories.tsx`

Atomic stories can wait until actual atomic components exist.

### Task B.4

- [ ] B.4.1 Verify latest Storybook package compatibility.
- [ ] B.4.2 Install Storybook in `apps/web` workspace.
- [ ] B.4.3 Add scripts to `apps/web/package.json`; optional root wrappers.
- [ ] B.4.4 Configure `.storybook/main.ts` and `preview.ts`.
- [ ] B.4.5 Add first auth/login stories.
- [ ] B.4.6 Add CI build job using root `npm ci`.
- [ ] B.4.7 Run `npm run build-storybook -w @eva/web`.

---

## B.5 - Docs Updates

Update only if not already present:

- `CLAUDE.md`: SDD workflow, data flow, Storybook rule.
- `AGENTS.md`: keep aligned with actual repo rules.
- `docs/architecture/PROJECT_STRUCTURE.md`: only if structure changes.
- `docs/architecture/FLOWS_AND_COMPONENTS.md`: only if flows/components change.
- `docs/testing/TEST_STATUS.md`: record relevant Storybook/test status.
- `docs/status/NEXT_STEPS.md`: only if priorities change.

Avoid doc churn. Update docs in the same commit as the change that makes them true.

---

## Execution Order

### Session 1 - Foundation Without Runtime Risk

- [x] Create `specs/_templates/*`.
- [x] Create retro specs for enterprise work.
- [x] Create `docs/architecture/CLEAN_ARCHITECTURE_AUDIT.md`.
- [x] Audit `_data/*.queries.ts` and classify.
- [x] Update CLAUDE/AGENTS only for missing rules. No edit needed.
- [x] Run `npm run typecheck`.

No UI changes. No component moves. No query refactors.

### Session 2 - Storybook

- [ ] Install/configure Storybook.
- [ ] Add auth/login stories first.
- [ ] Add CI build check.
- [ ] Run `npm run build-storybook -w @eva/web`.

No component moves.

### Session 3 - First Clean Architecture Fixes

- [ ] Pick 1-2 low-risk BYPASS files from audit.
- [ ] Move read queries to repository/service.
- [ ] Preserve return shape.
- [ ] Run typecheck + targeted tests.

### Session 4 - Atomic Additive Pass

- [ ] Promote only proven 3+ domain components.
- [ ] Prefer wrappers/re-exports first.
- [ ] Add stories.
- [ ] Run typecheck + Storybook build.

---

## Verification

Always:

```bash
npm run typecheck
```

For auth-related changes:

```bash
npm run test -- apps/web/src/lib/auth/fail-counter.test.ts apps/web/src/lib/auth/timing.test.ts apps/web/src/lib/auth/turnstile.test.ts
```

For Storybook:

```bash
npm run build-storybook -w @eva/web
```

Known current caveat:

```text
npm run lint
```

At time of plan update, lint is not clean because of a pre-existing React Compiler purity error in:

```text
apps/web/src/app/coach/nutrition-plans/new/page.tsx
```

Do not mix that fix into Plan B unless the session explicitly owns lint cleanup.

---

## Ready Criteria

Session 1 completed:

- Specs templates created.
- Retro enterprise specs created.
- Clean Architecture audit created.
- Runtime untouched.

Ready to execute Session 2 when:

- Session 1 audit exists.
- No uncommitted runtime work.
- Storybook package/version has been verified.

Ready to execute Session 3 when:

- Audit identifies first low-risk bypass candidates.
- Each candidate has expected current behavior noted.
