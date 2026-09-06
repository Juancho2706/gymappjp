---
status: active
owner: product-engineering
last_verified: "2026-09-06"
canonical: false
---

# PLAN — Cantidades honestas (Nutrición V2)

Ver [SPEC](SPEC.md) · [TASKS](TASKS.md). Cuatro olas en un worktree propio (`.claude/worktrees/nutrition-cantidades-honestas`,
rama `nutrition-cantidades-honestas` desde `rnmobiledenuevo`), un commit por ola como mínimo, un deploy web + una OTA
1.1.2 por ola. Sin dependencias nuevas, sin cambios nativos, sin DDL destructiva. Tres migraciones aditivas (W2, W3, W4),
validadas en LIVE con `BEGIN … ROLLBACK`, aplicadas después del deploy y antes de la OTA, con OK del owner por ola.

Jerarquía: decisiones del owner (SPEC §3) > este PLAN > TASKS. Ningún worker reabre D1–D7.

## Reparto (regla de la casa)

- **Fable (jefe):** SDD, arquitectura, mockups (M1–M4 del artifact `5091b8db` + caption de W1.2), componentes
  visuales nuevos (`ImplausibleNotice` web/RN, chip «versión anterior», diálogo de vigencia, panel de registros),
  juicio de cada diff contra lo pedido, merges y decisiones. Nunca fan-out de Fable.
- **Opus (implementación por informe):** reductores y helpers del paquete, wizards, RN del alumno, RPC y
  migraciones, read models, acciones server y API móvil, alertas, ficha del coach.
- **Sonnet (mecánico masivo):** reemplazo del rótulo de cantidad en las 16 superficies (W2.3), scripts de backfill y
  CSV de sugerencias (W2.4), tests de tabla (W1.1, W1.3).
- Tras cada wave: pasada de juicio del jefe (diff contra archivo:línea + contrato + tests pedidos) ⇒ correcciones
  numeradas **BLOQUEA/MEJORA** al MISMO worker. Un worker no entrega «verde» sin pegar la salida real del gate.

## Arquitectura por ola (sin cambios de capa)

```text
W1  packages/nutrition-v2/unit-change.ts        convertQuantityTextOnUnitChange (puro, web+RN+wizards)
    packages/nutrition-v2/plausibility.ts       umbrales D7 + assess* + copy (única casa de los números)
    packages/nutrition-v2/today-entries.ts      slotFreeEntries & co. extraídos de la web + isPriorVersionEntry
    editor-state.ts  SET_ITEM_UNIT convierte · qeItemPlausibility junto a qeItemMacros
    bulk-mark.ts     consumedPrescriptionItemIds solo ids vigentes
    web  _quick-edit/EditableItemRow (caption «1 un = 100 g» + ImplausibleNotice) · PublishBar (aviso día)
         builder/_lib/draft-builder (convierte) · builder/_components/DayTotalsBar (aviso día)
         c/[coach_slug]/nutrition-v2 TodayExperience (confirmación «Lo comí»)
    RN   quick-edit/EditableItemRow (caption + notice) · PublishBar/PublishConfirmSheet (aviso día)
         coach/nutrition-v2/builder/[clientId] (convierte) · alumno/(tabs)/nutrition-v2/index (huérfanos + confirm)
    PostHog nutrition_item_implausible (web events.ts · RN analytics.ts)

W2  intake-units.ts   HOUSEHOLD_UNIT='casera' · foodUnitOptions(food) · conversión con casera
    editor-food.ts    BuilderFood += householdGrams/householdLabel · computeItemMacros(casera ⇒ gramos)
    contracts.ts      ítem del borrador += householdLabel/householdGrams/sourceItemId (W3) opcionales
    quantity-format.ts formatItemQuantity («2 huevos (122 g)») · nutrition-engine/micros.ts exporta formatHouseholdCount
    plan-draft-rows.ts buildItemInsertRow: casera ⇒ g/ml + columnas congeladas
    SQL  nutrition_prescription_items_v2 += household_label, household_grams (+ CHECKs) · foods CHECK 1–1000
         persist_and_publish (2 columnas) · build_prescription_snapshot / plan_read / intake_item_json emiten el par
    Sonnet 16 superficies con formatItemQuantity · scripts/nutrition-household/*.mjs (SQL + CSV, sin aplicar)
    Badge «Revisar unidad» (editor web+RN) · docs/audits/cantidades-honestas-revisar-unidad-2026-09.md

W3  SQL  nutrition_prescription_items_v2 += source_item_id (FK, índice parcial)
         private.nutrition_v2_item_alias_map(version_id) · get_nutrition_today_v2 (+history-detail) resuelven
         persist_and_publish acepta source_item_id del mismo plan
    editor-state.ts   QeItem.sourceItemId (hidratado; se anula al cambiar contenido)
    quick-edit.actions.ts / api/mobile/.../coach/mutate  effectiveFromChoice 'today' | 'tomorrow'
    web PublishBar diálogo M3 · RN PublishConfirmSheet paso M3 · (extra) chip «Tu plan cambió hoy»

W4  packages/nutrition-v2/coach-alerts.ts   deriveNutritionV2Alerts (puro; web + RN lo consumen)
    web SelectedDayPanel (registros + Retirar/Editar, M4) · _actions/coach-intake.actions.ts
    RN  coach/nutrition-v2/[clientId] (lista + hoja) · api/mobile/.../coach/mutate ops void-intake/correct-intake
    SQL foods.review_reason + trigger private.foods_flag_density_review (no bloquea)
```

## Orden y dependencias

1. SDD (este paquete) → `pnpm docs:check`.
2. Pregunta única al owner: ¿M1–M4 del artifact valen como mockups aprobados (con la caption «1 un = 100 g» de W1.2 y
   el chip/lista de registros bajo cada franja en RN)?
3. **W1** (1 sesión): Opus A (paquete + reductor + wizards + tests) ∥ Opus B (RN alumno: huérfanos + confirmación) →
   juicio → Fable (componentes visuales) → Opus A cablea el aviso en editor/publish/wizard + PostHog → gates → commit.
4. **W2** (2–3 sesiones): Opus C (modelo: unidades, BuilderFood, computeItemMacros, contrato, draft rows, selector web/RN,
   alumno libre) ∥ Opus D (migración + RPC + read models + test SQL + `database.types.ts`) → juicio → Sonnet E (16
   superficies) ∥ Sonnet F (scripts + CSV) ∥ Opus C (badge + audit doc) → gates + ROLLBACK en LIVE → commit.
5. **W3** (1–2 sesiones): Opus G (migración linaje + alias map + RPCs + test SQL) ∥ Opus H (QeItem.sourceItemId +
   contrato + draft rows + effectiveFromChoice en action y API) → juicio → Fable (diálogo M3 web/RN) → Opus H cablea →
   gates + ROLLBACK → commit. W3.3 solo si todo lo anterior está verde.
6. **W4** (1 sesión): Opus I (acciones server + API móvil + alertas V2 + trigger densidad + tests) → juicio → Fable
   (panel M4 web/RN) → Opus I cablea → gates + ROLLBACK → commit.
7. Cierre: docs de estado (CURRENT, MOBILE_PARITY, TEST_STATUS, RUNBOOK) en el último commit de cada ola; E2E
   `qa:prod:suave` solo al cierre del tren; resumen + checklist de QA en device.

## Gates por ola (reales, con salida pegada en TASKS)

| Gate | Comando | Cuándo |
|---|---|---|
| Vitest paquete | `pnpm exec vitest run packages/nutrition-v2 packages/nutrition-engine` | todas |
| Vitest tocados | `pnpm exec vitest run <tests nuevos y afectados>` (web, `tests/mobile-*`) | todas |
| Typecheck web | `pnpm typecheck` | todas |
| Typecheck mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` | todas |
| Lint por archivo | `pnpm exec eslint <archivos web>` · `pnpm lint:mobile -- <archivos>` | todas |
| Boundaries V2 | `pnpm check:nutrition-v2-boundaries` | todas |
| Docs | `pnpm docs:check` | todas |
| SQL rollback | `supabase/tests/<ola>_rollback.sql` en LIVE dentro de `BEGIN … ROLLBACK` (MCP `execute_sql`) | W2, W3, W4 |
| Tipos DB | `supabase gen types` → `apps/web/src/lib/database.types.ts` (solo tras aplicar en LIVE) | W2, W3, W4 |
| E2E | `pnpm qa:prod:suave` | cierre del tren |

Modo CPU ocupado: vitest por archivo y eslint por archivo mientras otra sesión corre tsc o suite; avisar antes de
un typecheck completo.

## Riesgos y cómo se cubren

- **Drift de macros congelados**: `computeItemMacros` byte-idéntico para g/ml/un/porción (test fija los tres regímenes
  de `intakeEntryFactor`). La rama `casera` es nueva y solo se activa con `householdGrams`.
- **Builds RN viejas**: toda clave nueva de read model es `.nullable().optional()`; la unidad `casera` nunca sale del
  cliente; un ítem con columnas caseras se muestra en gramos si el cliente no las entiende.
- **Linaje cruzado**: la RPC solo acepta `source_item_id` de versiones del mismo plan; la CTE tiene tope de profundidad.
- **Sesiones paralelas**: worktree propio; docs de status se mergean al final avisando; nunca `--amend` ni `add -A`.
- **Catálogo**: el backfill produce SQL + CSV y no toca LIVE; el guard de densidad no bloquea filas existentes.

## Estimación

W1 ≈ 1 sesión · W2 ≈ 2–3 · W3 ≈ 1–2 · W4 ≈ 1 · cierre ½. Total ≈ 5–7 sesiones + QA del owner por ola.
