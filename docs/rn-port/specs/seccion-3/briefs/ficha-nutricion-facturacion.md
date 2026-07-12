# Unidad: ficha-nutricion-facturacion (key: `ficha-nutricion-facturacion`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = el tab **Nutricion** de la ficha (el mas denso) + el tab **Facturacion** (existente en RN pero oculto del chrome — RULING D2).

## Alcance exacto
- `apps/mobile/components/coach/clientDetail/NutricionTab.tsx` (702 L): tab "Nutricion" — plan activo, adherencia semanal, alertas, contexto de check-in, historial de ciclos, targets.
- `apps/mobile/components/coach/clientDetail/FacturacionTab.tsx` (108 L): tab "Facturacion" — estado de pago/suscripcion del alumno. **NO montado** por el tab bar (5 tabs, sin Facturacion; ver `ficha-shell-hero`). Conservar (regla 2), es divergencia documentada.

## webFiles (verdad web, paths verificados)
- Nutricion: `apps/web/src/app/coach/clients/[clientId]/NutritionTabB5.tsx` (1722 L) + `CoachNutrientTargetsEditor.tsx`, `CoachPrivateNotesPanel.tsx`, `ClientFoodRestrictionsCard.tsx`, `NutritionCheckinContextCard.tsx`, `NutritionCoachAlertsPanel.tsx`, `NutritionCycleHistorySection.tsx`, `_nutrition-tab/presentationals.tsx`, `_data/nutrient-targets.queries.ts`, `_actions/nutrient-targets.actions.ts`, `_actions/nutrition-notes.actions.ts`.
- Facturacion: `apps/web/src/app/coach/clients/[clientId]/BillingTabB8.tsx` (414 L).

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/clientDetail/NutricionTab.tsx`
- `apps/mobile/components/coach/clientDetail/FacturacionTab.tsx`

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/clientDetail/shared.tsx` → owner `ficha-shell-hero`.
- `apps/mobile/app/coach/cliente/[clientId].tsx` → owner `ficha-shell-hero` (monta NutricionTab; calcula el badge "!" de nutricion L227).
- Primitivos de nutricion compartidos (si NutricionTab reusa componentes del builder de nutricion / editores de targets ya portados en Seccion builder) — no editar aqui.

## P0 / riesgos conocidos
- **BOMBA -999 (gotcha 6a):** NutricionTab (702 L) es candidato a tener sheets (editor de targets, swap de comida, historial). Grep `@gorhom`/`snapPoints`/`<Sheet` en el archivo: si hay sheet con snapPoint fijo sin dynamicSizing → si es CRITICO (editar targets) migrar a `nativeModal`. Verificar el primer present.
- **Fabric 45798 (gotcha 6c) — ALTO:** el editor de targets de nutrientes tiene `TextInput` numericos (kcal/macros). NINGUN wrapper de TextInput con estilo condicional por focus.
- **Auditoria pendiente (R5 §3.4):** Nutricion NO auditado a fondo — panel mas grande de la ficha (1722 L web). Comparar contra `NutritionTabB5.tsx` seccion-a-seccion.
- **Nutricion Pro es POR-ALUMNO (memoria):** el gate de nutricion avanzada exige `mode='client-plan'`; editar plantilla NO lo muestra (no es bug). Respetar el gating compartido.
- **Facturacion (regla 2):** no montado pero vivo; si se re-skina, mantener oculto del tab bar salvo decision CEO. Enlaces de dinero = link-out / money-safety (no reimplementar cobros en RN).
- **Congelamiento:** N/A directo (recibe `data` por props); confirmar. Si el editor de targets hace fetch propio de `nutrient-targets.queries`, cargar on-open.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"NutritionTabB5"` (L~7163), `"CoachNutrientTargets"`/`"NutritionCoachAlerts"`/`"NutritionCycleHistory"` (buscar), `"BillingTabB8"` (buscar). ola0 cubre Nutricion.

## Notas de datos (queries/RPC, claves de dia)
- Nutricion: `data.activeNutrition`, `compliance.nutritionWeeklyAvgPct`, targets via `nutrient-targets.queries` (read-only), notas privadas via `nutrition-notes.actions`. Adherencia = motor unico `computeNutritionAdherence` (compartido; no reimplementar).
- **Claves de dia (gotcha 6d):** adherencia semanal de nutricion, "hoy" de comidas, historial de ciclos — dia calendario Santiago. `meal_id` cascade-safety: no tocar logica de propagacion (es web/service, RN solo lee).
- Facturacion: estado de suscripcion del alumno (read-only); acciones de dinero = link-out.
