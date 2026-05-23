# Enterprise Dashboard Revenue MVP - PLAN

**Status:** ACTIVE  
**Owner:** EVA  
**Last updated:** 2026-05-23  
**Spec:** `specs/enterprise-dashboard-revenue-mvp/SPEC.md`

---

## Architecture

First slice is visual/read-only:

```text
app/org/[slug]/page.tsx
  -> app/org/[slug]/_data/org.queries.ts
  -> infrastructure/db/org.repository.ts
  -> Supabase local
```

No new mutations. No migrations. No direct feature-data Supabase calls.

## Files

| Action | Path | Notes |
|---|---|---|
| UPDATE | `apps/web/src/app/org/[slug]/layout.tsx` | Enterprise navigation shell. |
| UPDATE | `apps/web/src/app/org/[slug]/page.tsx` | Fetch current data and compose dashboard. |
| CREATE | `apps/web/src/app/org/[slug]/_components/dashboard/EnterpriseDashboardHome.tsx` | Read-only dashboard UI. |
| CREATE | `apps/web/src/app/org/[slug]/_components/EnterpriseComingSoonPage.tsx` | Safe placeholder for future modules. |
| CREATE | `apps/web/src/app/org/[slug]/{brand,assignments,reports,payments,team,audit}/page.tsx` | Placeholder module routes. |

## Data Model

No DB changes in first slice.

Future model review needed for:

- `organization_branding`
- enterprise staff/permissions
- student payment status
- assignment audit events

## UI/UX

Tone: refined operational command center.

Rules:

- dense but readable;
- no nested cards;
- responsive without horizontal overflow;
- amber enterprise accent;
- action queue is prominent;
- placeholders explain product value, not generic "coming soon".

## Test Plan

- `npm run typecheck`
- Optional local browser smoke on `/org/[slug]` using Supabase local seeded org.

## Rollback

Revert this slice commit. No DB changes means rollback is simple.

