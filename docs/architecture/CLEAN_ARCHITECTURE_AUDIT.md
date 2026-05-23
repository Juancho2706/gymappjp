# Clean Architecture Audit

**Date:** 2026-05-23  
**Scope:** `apps/web/src/app/**/_data/*.queries.ts`  
**Plan:** `docs/plans/plan-b-foundation.md` Session 1  
**Status:** AUDIT ONLY - no runtime changes

---

## Standard

Preferred feature-data flow:

```text
app/[feature]/_data/*.queries.ts
  -> services/[domain]/*.service.ts
  -> infrastructure/db/*.repository.ts
  -> Supabase
```

Allowed in `_data`:

- Create the request-scoped Supabase client.
- Read auth/session context.
- Use `React.cache`.
- Call services.

Bypass:

- `_data` calls `.from(...)` or `.rpc(...)` for feature data directly.

Admin exception:

- Admin/service-role operational pages currently use service-role clients directly. They are documented here and should be migrated later behind admin repositories/services when touched.

---

## Summary

Audited files: 40

| Classification | Count | Meaning |
|---|---:|---|
| OK | 7 | No direct feature-data `.from()` / `.rpc()` detected, or already delegates to services/repositories. |
| BYPASS | 22 | User-facing `_data` directly queries Supabase for feature data. |
| HIGH_RISK | 4 | Large or critical user-facing query surface; migrate only with focused tests. |
| ADMIN_EXCEPTION | 7 | Service-role/admin operational pages; document now, migrate later. |

Priority:

1. Low-risk read-only coach catalogs/settings.
2. Coach builder/program list.
3. Coach nutrition query cluster.
4. Student dashboard/workout/nutrition.
5. Admin service-role pages.

---

## File Classification

| File | Class | Evidence | Recommended next step |
|---|---|---|---|
| `apps/web/src/app/admin/(panel)/auditoria/_data/auditoria.queries.ts` | ADMIN_EXCEPTION | service-role client | Leave until admin repository pass. |
| `apps/web/src/app/admin/(panel)/dashboard/_data/admin.queries.ts` | ADMIN_EXCEPTION | service-role + rpc | Leave until admin repository pass. |
| `apps/web/src/app/admin/(panel)/finanzas/_data/finanzas.queries.ts` | ADMIN_EXCEPTION | service-role + direct reads | Leave until admin repository pass. |
| `apps/web/src/app/admin/(panel)/novedades/_data/novedades.queries.ts` | ADMIN_EXCEPTION | service-role + direct reads | Leave until admin repository pass. |
| `apps/web/src/app/admin/(panel)/orgs/_data/orgs.queries.ts` | ADMIN_EXCEPTION | service-role + direct reads | Leave until admin repository pass. |
| `apps/web/src/app/admin/(panel)/personal/_data/gastos.queries.ts` | ADMIN_EXCEPTION | service-role + direct reads | Leave until admin repository pass. |
| `apps/web/src/app/admin/(panel)/sistema/_data/sistema.queries.ts` | ADMIN_EXCEPTION | service-role + many direct counts | Leave until admin repository pass. |
| `apps/web/src/app/admin/(panel)/_data/layout.queries.ts` | OK | auth context only | No action. |
| `apps/web/src/app/admin/login/_data/login.queries.ts` | OK | auth context only | No action. |
| `apps/web/src/app/org/[slug]/_data/org.queries.ts` | OK | delegates to org repository helpers after auth context | Keep; optional service wrapper later. |
| `apps/web/src/app/coach/foods/_data/foods.queries.ts` | OK | no direct feature-data query detected | No action unless behavior changes. |
| `apps/web/src/app/coach/nutrition-plans/new/_data/new-template.queries.ts` | OK | auth/context only detected | No action. |
| `apps/web/src/app/coach/nutrition-plans/[templateId]/edit/_data/edit-template.queries.ts` | OK | auth/context only detected | No action. |
| `apps/web/src/app/coach/onboarding/complete/_data/complete.queries.ts` | OK | auth/context only detected | No action. |
| `apps/web/src/app/coach/settings/_data/settings.queries.ts` | BYPASS | direct `coaches` read | Low-risk repository candidate. |
| `apps/web/src/app/coach/settings/preview/_data/preview.queries.ts` | BYPASS | direct `coaches` read | Low-risk repository candidate. |
| `apps/web/src/app/coach/clients/_data/clients.queries.ts` | BYPASS | direct `clients` read | Low-risk repository candidate. |
| `apps/web/src/app/coach/exercises/_data/exercises.queries.ts` | BYPASS | direct `exercises` reads | Low-risk catalog candidate. |
| `apps/web/src/app/coach/meal-groups/_data/meal-groups.queries.ts` | BYPASS | direct `saved_meals` read | Low-risk catalog candidate. |
| `apps/web/src/app/coach/recipes/[recipeId]/_data/recipe-detail.queries.ts` | BYPASS | direct `recipes` read | Low-risk repository candidate. |
| `apps/web/src/app/coach/_data/layout.queries.ts` | BYPASS | direct `organization_members` read | Keep auth/layout behavior stable; migrate later. |
| `apps/web/src/app/coach/_data/public-code.queries.ts` | BYPASS | admin client + direct `coaches` read | Treat separately because it uses admin client. |
| `apps/web/src/app/coach/reactivate/_data/reactivate.queries.ts` | BYPASS | direct `coaches` and `clients` reads | Medium-risk subscription/access flow. |
| `apps/web/src/app/coach/workout-programs/_data/workout-programs.queries.ts` | BYPASS | direct `workout_programs` and `clients` reads | Good first workout repository candidate. |
| `apps/web/src/app/coach/workout-programs/builder/_data/template-builder.queries.ts` | BYPASS | direct `exercises` and `workout_programs` reads | Migrate after workout program list. |
| `apps/web/src/app/coach/builder/[clientId]/_data/builder.queries.ts` | BYPASS | direct `clients`, `exercises`, `workout_programs` reads | Medium-risk builder flow; test before migrating. |
| `apps/web/src/app/coach/nutrition-plans/client/[clientId]/_data/client-plan-page.queries.ts` | BYPASS | direct `clients`, `client_intake` reads | Low/medium-risk nutrition candidate. |
| `apps/web/src/app/coach/nutrition-plans/_data/nutrition-page.queries.ts` | BYPASS | direct `coaches`, `org_nutrition_templates` reads | Migrate with nutrition service. |
| `apps/web/src/app/coach/nutrition-plans/_data/nutrition-coach.queries.ts` | HIGH_RISK | 12 direct reads across nutrition tables | Defer until targeted nutrition tests exist. |
| `apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts` | HIGH_RISK | 8 direct reads + 2 rpc calls mixed with services | Defer; migrate in small slices only. |
| `apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts` | BYPASS | direct `coaches` read | Low-risk client repository candidate. |
| `apps/web/src/app/c/[coach_slug]/login/_data/login.queries.ts` | BYPASS | direct `coaches` reads | Low-risk public coach lookup candidate. |
| `apps/web/src/app/c/[coach_slug]/onboarding/_data/onboarding.queries.ts` | BYPASS | direct `clients` read | Low-risk client repository candidate. |
| `apps/web/src/app/c/[coach_slug]/nutrition/_data/nutrition-auth.queries.ts` | BYPASS | direct `clients` read | Low-risk auth-context candidate. |
| `apps/web/src/app/c/[coach_slug]/workout-history/_data/workout-history.queries.ts` | BYPASS | direct `clients` read | Low-risk client repository candidate. |
| `apps/web/src/app/c/[coach_slug]/check-in/_data/check-in.queries.ts` | BYPASS | direct `clients`, `check_ins` reads | Medium-risk student check-in flow. |
| `apps/web/src/app/c/[coach_slug]/exercises/_data/exercises.queries.ts` | BYPASS | direct `clients`, `exercises` reads | Low-risk catalog candidate. |
| `apps/web/src/app/c/[coach_slug]/nutrition/_data/nutrition.queries.ts` | BYPASS | direct nutrition reads | Medium-risk student nutrition flow. |
| `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts` | HIGH_RISK | 16 direct reads + 1 rpc across dashboard domains | Defer; migrate in small slices only. |
| `apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/workout-execution.queries.ts` | HIGH_RISK | workout execution critical path | Defer until E2E/targeted tests are ready. |

---

## Suggested First Fix Candidates

Start with these only after Session 1 is committed:

1. `coach/settings/_data/settings.queries.ts`
2. `coach/settings/preview/_data/preview.queries.ts`
3. `coach/exercises/_data/exercises.queries.ts`
4. `coach/clients/_data/clients.queries.ts`
5. `c/[coach_slug]/login/_data/login.queries.ts`

Reason: small read-only shapes, low blast radius, easy to preserve return values.

---

## Do Not Start With

- `c/[coach_slug]/workout/[planId]/_data/workout-execution.queries.ts`
- `c/[coach_slug]/dashboard/_data/dashboard.queries.ts`
- `coach/dashboard/_data/dashboard.queries.ts`
- `coach/nutrition-plans/_data/nutrition-coach.queries.ts`

These are high-traffic/high-complexity flows. They need focused tests and slice-by-slice migration.
