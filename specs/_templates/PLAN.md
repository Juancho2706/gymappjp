# [Feature Name] - PLAN

**Status:** DRAFT  
**Owner:** TBD  
**Last updated:** YYYY-MM-DD  
**Spec:** `specs/[feature]/SPEC.md`

---

## Architecture

Describe the chosen architecture and why it fits existing EVA patterns.

Required data flow:

```text
app/[feature]/_data/*.queries.ts
  -> services/[domain]/*.service.ts
  -> infrastructure/db/*.repository.ts
  -> Supabase
```

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `...` | |
| UPDATE | `...` | |

## Data Model

- DB changes: none / migration required
- RLS impact: none / policy changes required
- Generated types impact: none / update `database.types.ts`

## Server Actions

- Action name:
- Validation schema:
- Revalidation path:

## UI/UX

- Mobile viewport: use `dvh`, safe areas where needed.
- Dark mode: define expected behavior.
- Components: route-local first; atomic only if reused in 3+ domains.

## Phases

1. Phase 1
2. Phase 2
3. Phase 3

## Test Plan

- Unit:
- Integration:
- E2E:
- Manual:

## Rollback Plan

Describe the smallest safe revert path.

