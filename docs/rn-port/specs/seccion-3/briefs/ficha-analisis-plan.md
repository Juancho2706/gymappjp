# Unidad: ficha-analisis-plan (key: `ficha-analisis-plan`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = dos tabs de la ficha: **Entreno** (Analisis / training analytics) y **Programa** (plan activo).

## Alcance exacto
- `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx` (293 L): tab "Entreno" — analitica de entrenamiento (volumen, fuerza, balance muscular, PRs).
- `apps/mobile/components/coach/clientDetail/PlanTab.tsx` (187 L): tab "Programa" — resumen del plan activo, estructura, sheet de detalle. Usa `@gorhom/bottom-sheet` DIRECTO (L4, `BottomSheetModal` L23, L83).

## webFiles (verdad web, paths verificados)
- Entreno: `apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx` (778 L) + `TrainingStrengthCards.tsx`, `profileTrainingAnalytics.ts`.
- Programa: `apps/web/src/app/coach/clients/[clientId]/ProgramTabB7.tsx` (817 L) + `ProfileProgramSummaryCard.tsx`, `profileProgramStructureUtils.ts`, `profileProgramUtils.ts`, `DeletePlanButton.tsx`.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/clientDetail/AnalisisTab.tsx`
- `apps/mobile/components/coach/clientDetail/PlanTab.tsx`

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/clientDetail/shared.tsx` → owner `ficha-shell-hero`.
- `apps/mobile/app/coach/cliente/[clientId].tsx` → owner `ficha-shell-hero` (monta los tabs; el badge de PRs de "Entreno" y planCount de "Programa" se calculan en [clientId].tsx L224-226 — read-only).
- Charts compartidos `apps/mobile/components/coach/charts/*` (MuscleRadar, BarComposed, etc.), `ProgramPhasesBar.tsx` — primitivos; cambios → `cambiosShell`.

## P0 / riesgos conocidos
- **BOMBA -999 (gotcha 6a) — CRITICO:** `PlanTab.tsx` usa `@gorhom/bottom-sheet` **DIRECTO** (no el wrapper): `import { BottomSheetModal, BottomSheetScrollView }` (L4), `<BottomSheetModal ref={sheetRef} index={0} snapPoints={['70%']} enableDynamicSizing={false} enablePanDownToClose>` (L83). Snapshot fijo 70% + `@gorhom` crudo = candidato claro a `containerHeight -999` en el primer present (reanimated 4). El sheet muestra el detalle del plan/dia = **CRITICO para el flujo del coach**. **Fix obligatorio:** migrar a `nativeModal` de `components/Sheet.tsx` (patron ronda 7) o al wrapper `<Sheet>`. Es la reparacion central de esta unidad.
- **Auditoria pendiente (R5 §3.4):** Entreno y Programa NO auditados a fondo. Comparar contra `TrainingTabB4Panels.tsx` (778 L) y `ProgramTabB7.tsx` (817 L) seccion-a-seccion — son paneles densos (fuerza, PRs, fases del programa).
- **Charts:** MuscleRadar/balance muscular con tokens del theme; cero hex crudo nuevo.
- **Congelamiento:** N/A directo (reciben `data` por props). Confirmar.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"TrainingTabB4"` (L~7301), `"ProgramTabB7"` (L~10775), `"MuscleRadar"`/`"ProgramPhasesBar"` (buscar). Base fuerte via ola0 para ambos tabs.

## Notas de datos (queries/RPC, claves de dia)
- Reciben `data` de la ficha por props (activeProgram, planCount, training analytics, weeklyPRs). Sin queries propias.
- **Claves de dia (gotcha 6d):** "esta semana" de volumen/PRs, `planCurrentWeek`, dias del programa — dia calendario Santiago. Estructura del plan via `profileProgramStructureUtils` (logica compartida — no reimplementar el modelo, portar solo la UI).
