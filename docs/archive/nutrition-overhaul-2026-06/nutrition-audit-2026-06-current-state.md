_no_text_response — this is a synthesis task. Let me produce the map directly.

I have all the findings I need. Let me synthesize.

# EVA Nutrition System — Current-State Map

## 1. End-to-End Architecture (build → assign → log → review)

```
COACH BUILD                    ASSIGN                     ALUMNO LOG                  COACH REVIEW
───────────                    ──────                     ──────────                  ────────────
/coach/nutrition-plans         AssignModal                /c/[slug]/nutrition         /coach/clients/[id]
 PlanBuilder (mode=             assignTemplateToClients     NutritionShell              ClientProfileDashboard
  template|client-plan)        → bulk INSERT                tap-to-complete meals       (6 tabs, 4 carry nutrition)
 ├ sidebar: goals(kcal/P/C/F)   nutrition_plans            portion% (25/50/75/100)     + /coach/dashboard KPI hint
 ├ Mifflin-St Jeor suggester   (macros only on org path)   satisfaction (1-3 emoji)
 ├ Auto-sync goals↔foods       editing a client plan       coach-bounded food swaps
 ├ dnd meal blocks             → detaches to CUSTOM         habits / streak / heatmap
 └ FoodSearchDrawer            ────────                    offline queue → drain
   (local foods only)          CYCLES                      ───────────
 exchanges overlay             nutrition_plan_cycles       crons: nutrition-reminder
  (client-plan only, paid)     advanced daily by cron      (push if no log) +
                                                           nutrition-cycles (advance block)
```

**Data flow:** RSC `_data/*.queries.ts` (React.cache) → `PlanBuilder` draft state → `_actions/*` server actions → `NutritionService` / direct Supabase → `revalidatePath`. Macro math is shared client+server (`lib/nutrition-utils.ts` grams, `services/nutrition-exchanges/exchange-calc.ts` exchanges). The model is **prescription + adherence**, never intake: the alumno cannot log a food the coach didn't pre-plan; "consumed" macros are `planned macros × completion%` via `calculateConsumedMacrosWithCompletionFallback`.

**Two backend generations side by side:** legacy "grams" (`plan→meals→food_items→foods`, per-100g) and the newer "exchanges" module (`exchange_groups`, `meal_exchange_targets`, day variants). The exchanges module is exemplary clean-arch (pure domain/calc/reconcile + repository boundary); the grams path (`NutritionService`) talks to Supabase directly, bypassing `nutrition.repository.ts` (read-only, zero write functions) — a stated-pillar violation.

## 2. Surfaces Where Nutrition Appears — The Fragmentation Problem

Nutrition has **no single canonical home** anywhere. It is scattered across:

**Authoring (coach):**
- `/coach/nutrition-plans` hub — 3 tabs (Plantillas / Alumnos / Alimentos)
- `PlanBuilder` drives both template + client-plan modes (good) but exchanges only attach to client-plans (templates can't be exchange-based)
- **Two food-create paths** (inline `FoodSearchDrawer.addCoachCustomFood` JSON vs standalone `AddFoodSheet.saveCustomFood` FormData) — duplicated validation/rounding
- **Two food-browse UIs** (`FoodSearchDrawer` vs `FoodBrowser`)
- `/coach/recipes` (Edamam) is a **completely separate** nutrition surface, not wired into the builder

**Coach review of one student — nutrition bleeds into 4 of 6 tabs + dashboard (9 entry points):**
1. Dashboard `KpiStrip` — nutrition is a tiny hint string under "Adherencia" (not its own KPI)
2. Dashboard `ClientStatsSheet` — nutrition is a hidden 2nd tab
3. Client `ProfileTabNav` badge — overloaded: "!" risk OR meal count
4. Overview `ProfileOverviewB3` — a 3rd adherence ring "Nutrición (7d)"
5. Overview `ProfileProgramSummaryCard` — a red "Nutri. en riesgo" dot inside the *training* card
6. Overview top alert — nutrition<60% rule, **silently suppressed** by workout/checkin rules in a priority cascade
7. Progreso tab — 3 nutrition charts hidden under a *body-composition* pill toggle
8. Nutrición tab — `NutritionTabB5` (1411-line mega-component, ~12 cards, edit+analytics mixed)
9. Nutrición tab links OUT to the plan builder and "ver como alumno"

**Alumno + mobile:** swap/macro transform duplicated across `NutritionShell`, `NutritionDailySummary`, PDF builders; macro colors differ between page (orange/blue/yellow) and dashboard (rose/amber/emerald).

**Persistence is split-brain:** grams data saves atomically on Save; exchange portions/variants auto-save on a 700ms debounce; cycles via yet another action — **no unified dirty/saved state for "is this plan saved."**

**Three template stores:** `nutrition_plan_templates` (coach/org/team), `org_nutrition_templates` (org, separate, **dead-end** — no code consumes it into a plan), `nutrition_plan_templates.team_id` (flat team pool, **no UI at all**). Legacy FormData actions coexist with JSON actions = two live serialization formats.

## 3. Data Model Summary

15 RLS-enabled tables, 3-way tenant scoping (standalone / org / team pool).

- **Prescription:** `nutrition_plans` (1/client, daily_calories/protein_g/carbs_g/fats_g, plan_mode `grams|exchanges`, template_id, org_id) → `nutrition_meals` (day_of_week, day_variant_id) → `food_items` (food_id, qty, unit, swap_options jsonb) → `foods` (per-100g, **4 macros only** + INTEGER, serving_size, is_liquid, exchange_* cols; 343 rows: 316 global / 27 coach / **0 org**)
- **Templates:** `nutrition_plan_templates → template_meals → template_meal_groups → saved_meals → saved_meal_items` (note: `saved_meals` is **overloaded** as both coach meal library AND internal `Internal_<name>_<Date.now()>` join container) + separate `org_nutrition_templates`
- **Exchanges:** `exchange_groups` (8 system C/P/F/V/LAC/ARL/SP/G + composed LEG, ref macros per portion, macros_confirmed flag) → `meal_exchange_targets` (portions/group/meal) + `nutrition_plan_day_variants`
- **Logging:** `daily_nutrition_logs` (UNIQUE client+plan+date, **snapshots target_*_at_log**) → `nutrition_meal_logs` (is_completed, consumed_quantity pct, satisfaction_score) + `nutrition_meal_food_swaps`
- **Versioning/periodization:** `nutrition_plan_history` (snapshot jsonb), `nutrition_plan_cycles` (week-range blocks jsonb, 1-active-per-client)
- **Prefs/habits:** `client_food_preferences` (favorites), `daily_habits`

## 4. What Works

- **Single `PlanBuilder` for templates + client-plans** — low drift between authoring modes
- **Pure, centralized, tested macro math** — `nutrition-utils.ts` + `exchange-calc.ts` are IO-free, shared web↔mobile↔PDF; documented liquid-serving_size fix (15ml oil = 15g fat)
- **Meal-id-preserving reconciliation** protects client adherence logs across plan edits; **auto-history snapshot before every client-plan save** + restore = real versioning
- **Exchanges module is RD-shaped and textbook clean-arch** — portion-per-group, composed groups, day variants, equivalences, "macros referenciales" provisional badge, defense-in-depth tenant checks (`verifyGroupsVisibleToActor`, `groupMatchesTenant`)
- **Genuinely robust offline/PWA + native mobile** — localStorage/AsyncStorage read-model, dedup'd toggle queue draining on reconnect AND app-foreground; 1-tap logging with optimistic UI + haptics + confetti
- **target_*_at_log snapshotting** keeps historical adherence correct after plan edits (read on web; **written-but-unread on mobile** — gap)
- **Server-side enforcement is real:** tier gate short-circuits in RSC before fetch; every exchanges mutation routes through `assertExchangesModuleForPlan`; resource-context resolution (pool wins over coach); money-safety P0 guards on add-on purchase
- **White-label PDF/text export** done correctly (client-side only, fail-safe EVA fallback, legal disclaimer stamped)

## 5. Most Serious Weaknesses (ranked)

1. **4-macro ceiling (kcal/P/C/F only) — hard clinical wall.** No fiber, sodium, sugar, saturated/unsaturated fat, or any micronutrient anywhere in `foods`, goals, logging, PDFs, or alerts. Makes hypertension/renal/diabetes/pregnancy/deficiency management impossible. This is *the* dominant limitation — it propagates through every surface.
2. **Adherence has 2 divergent formulas + 4 incompatible definitions, shown simultaneously.** `client-detail.service` counts done/total over ALL meal logs (no day-of-week filter); `dashboard.service` + the "today" % DO filter via `nutritionMealAppliesOnIsoYmdInSantiago` → Overview ring, Nutrición strip, dashboard KPI, and today badge can legitimately disagree for the same student. On one screen "adherence" means: logged ≥1 meal (heatmap) / % of plan meals (strip) / weekly avg % (ring) / today % (badge). The UI ships apologetic InfoTooltips. **No single source of truth; erodes trust in the data.**
3. **Consumed = plan-adherence, not real intake.** `calculateConsumedMacrosWithCompletionFallback` credits full planned macros on completion. No off-plan/free-food entry, no >100% portion, no barcode. Rings can read 100% while the client ate something entirely different. Streak/heatmap reward marking-done → **gameable, can reinforce dishonest self-report.** UI implies real macro tracking without labeling it as plan-adherence.
4. **Empty-meal production data corruption (unaddressed).** 2026-04-30 audit (`audit-nutrition-empty-meals.mjs`, manual, not in CI/cron) found 17 empty meals across 6 clients of one coach — 2 clients with **entirely empty plans still accruing daily logs**. Nothing prevents saving an empty meal or activating an empty plan; these feed adherence math and export to PDF as valid.
5. **Org bulk-assign is destructive, non-selective, transaction-less.** `assignOrgNutritionPlanTemplateToClientsAction` always targets ALL active org clients (UI implies a subset), unconditionally deactivates prior plans and inserts **macro-only** plans (no meals), wiping coach customization, with no transaction → partial failure leaves clients with zero active plan. The rich `org_nutrition_templates.meal_names` is **never propagated anywhere** (two competing org template tables, one usable-but-mealless, one rich-but-dead).
6. **Propagation is serial, transaction-less, partial-failure-prone.** `propagateTemplateChanges` loops clients sequentially with many awaited queries each, no `Promise.all`, no DB transaction, ignores most insert/update errors. For a 300-client team this is thousands of serial round-trips; a mid-loop error leaves earlier clients mutated, later untouched.
7. **Scope columns UPDATE-grantable to `authenticated` on `nutrition_plans` and `foods`** (client_id/coach_id/org_id) — cross-tenant re-scoping gated only by RLS WITH CHECK, not by grant revocation (contrary to the `clients`-hardening doctrine in CLAUDE.md). `foods` has no column allowlist → a coach could flip `coach_id→NULL` to promote a private food toward the global pool.
8. **Grams-mode meal reconciliation keys on `order_index` (positional).** Reorder+save can attach a client's historical logs to a different meal — the exchanges path was explicitly fixed to match by id; grams was not.
9. **Food edits retroactively rewrite history.** Macros read live from `foods` at calc time; only plan-level snapshots exist, not per-log → editing a food silently changes every past log's computed intake. Adherence analytics are non-reproducible.
10. **Two parallel nutrition gates with no unifying resolver** (tier `canUseNutrition` inline in RSC vs `enabled_modules`/`coach_addons` via `assertModule`); cross-dependency hand-enforced in only 2-3 call sites — easy for a future surface to check one and forget the other.
11. **Mobile parity gaps:** alumno cannot apply coach swaps (data fetched, `activeSwapMealIds` dead-wired), entire exchanges module absent, no off-plan logging, historical days show live (not snapshotted) targets. `expo-camera` installed but **no barcode/photo affordance** — the single biggest unused native affordance.
12. **No observability on crons** (console-only, no alerting); **no per-row error isolation** in cycle automation (one bad row aborts the whole tenant run); reminder cron unbatched/un-rate-limited (single long invocation risks Vercel timeout at scale) and fires even when nothing is prescribed for today.

## 6. What a Professional Nutritionist Cannot Do Today

- **Manage any clinical case** — no fiber, sodium, sugar, saturated/unsaturated fat, or micronutrients (iron/calcium/potassium/etc.); only kcal/P/C/F. Blocks hypertension, renal, diabetes, pregnancy, GI, deficiency work.
- **Trust the food data** — no provenance/source/verified flag, no USDA/INTA/national table or barcode in the builder; macros are coach-typed and INTEGER-rounded (precision loss on low-cal/high-fat items). Edamam exists only in the separate `/coach/recipes` surface, not the builder or mobile food search.
- **Drive targets off assessment** — `daily_calories` is effectively free-text; no BMR/TDEE engine wired into the plan beyond an optional Mifflin suggester; **nutrition is siloed from the `body_composition` add-on** (a separate $9.990 module) so targets can't consume ISAK/BIA lean-mass data.
- **Enforce safety** — no kcal cross-check (`4P+4C+9F ≈ kcal` never validated); in exchange mode prescribed portions can silently fail to meet the stated kcal/protein goal (5% mismatch banner is grams-only); only safety rail is a hardcoded kcal<1200 alert — no high-end bound, no protein-floor check.
- **Model the client** — no structured allergy/intolerance/dislike enforcement (`client_food_preferences` only pins favorites in search, never blocks an allergen); no edible-portion/cooked-raw yield; no per-meal timing beyond a free-text note; no hydration/supplement/recipe structured fields; no clinical notes/SOAP.
- **Build reusable RD-grade artifacts** — exchange mode is client-plan-only (no exchange templates); org templates carry no meals/foods/timing; no "insert saved meal/recipe" in the canvas (rebuild food-by-food every time).
- **Get reliable monitoring** — adherence is "meals checked off," not consumed-vs-target nutrient compliance; consumed numbers are estimates, not real intake; cycle periodization auto-advances on a calendar with no checkpoint requiring RD review before the next block applies.
- **Review efficiently** — a weekly review forces hopping across Overview ring + program red-dot + (often-suppressed) top alert + Nutrición tab (12 cards) + Progreso hidden charts + the separate builder, with adherence numbers that don't reconcile.

**Net:** EVA is a competent **macro-and-exchange tool for a personal-training coach** — strong daily-loop UX, real offline support, a clinically-shaped exchange-list method, and disciplined gating. The paid "el método de los nutricionistas" pitch sells the **artifact** (a tidy branded exchange PDF), not the **reasoning** (assessment → requirement calc → adequacy → monitoring) a licensed dietitian needs. The 4-macro ceiling, intake-vs-adherence conflation, and multi-formula adherence are the three structural gaps that cap it below clinical-grade.