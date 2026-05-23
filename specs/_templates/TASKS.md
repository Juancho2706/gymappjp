# [Feature Name] - TASKS

**Status:** DRAFT  
**Owner:** TBD  
**Last updated:** YYYY-MM-DD  
**Spec:** `specs/[feature]/SPEC.md`  
**Plan:** `specs/[feature]/PLAN.md`

---

## Tasks

- [ ] T1 - Task title
  - Scope:
  - Verification:
- [ ] T2 - Task title
  - Scope:
  - Verification:

## Universal Definition of Done

- [ ] `npm run typecheck`
- [ ] Targeted tests for touched domain
- [ ] No direct feature-data Supabase calls in `_data`
- [ ] Server actions validate with Zod
- [ ] Mutations call `revalidatePath()` where needed
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Fixed edge UI uses safe-area utilities
- [ ] Dark mode checked when UI changes
- [ ] New atomic UI has Storybook story
- [ ] Docs updated when routes, flows, DB, tests, or priorities change

## Notes

- Keep changes scoped.
- Prefer route-local components unless reuse is proven.
- Preserve existing behavior unless the spec explicitly changes it.

