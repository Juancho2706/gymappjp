# Unidad: ficha-overview-progreso (key: `ficha-overview-progreso`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = dos tabs de la ficha: **Resumen** (Overview) y **Progreso** (body composition + evolucion), mas el banner de PRs semanales.

## Alcance exacto
- `apps/mobile/components/coach/clientDetail/OverviewTab.tsx` (460 L): tab "Resumen" — snapshot, alertas, resumen de programa/nutricion, check-in reciente. Incluye un `<Sheet ... snapPoints={['88%']}>` (L409-414).
- `apps/mobile/components/coach/clientDetail/ProgresoTab.tsx` (540 L): tab "Progreso" — peso/composicion, graficos, historial. Incluye `<Sheet ... snapPoints={['55%']}>` (L189-194).
- `apps/mobile/components/coach/clientDetail/WeeklyPRBanner.tsx` (122 L): banner de records de la semana.

## webFiles (verdad web, paths verificados)
- Resumen: `apps/web/src/app/coach/clients/[clientId]/ProfileOverviewB3.tsx` (1005 L) + `ProfileCheckInSnapshot.tsx`, `ProfileTopAlertBanner.tsx`, `ProfileProgramSummaryCard.tsx`, `profileOverviewUtils.ts`, `profileDataHelpers.ts`.
- Progreso: `apps/web/src/app/coach/clients/[clientId]/ProgressBodyCompositionB6.tsx` (1017 L) + `profileBodyCompositionUtils.ts`, `bodycomp/page.tsx`.
- PRs: seccion de PRs dentro de `TrainingTabB4Panels.tsx`/`profileTrainingAnalytics.ts` (el banner semanal).

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/clientDetail/OverviewTab.tsx`
- `apps/mobile/components/coach/clientDetail/ProgresoTab.tsx`
- `apps/mobile/components/coach/clientDetail/WeeklyPRBanner.tsx`

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/clientDetail/shared.tsx` → owner `ficha-shell-hero` (helpers/primitivos compartidos).
- `apps/mobile/app/coach/cliente/[clientId].tsx` → owner `ficha-shell-hero` (monta estos tabs).
- Charts compartidos: `apps/mobile/components/coach/charts/*` (AreaTrend, CalendarHeatmap, RadialGauge, etc.), `TrendChart.tsx`, `WeightTrendChart.tsx` — primitivos compartidos entre tabs; si necesitan cambio → `cambiosShell`, no editar aqui salvo que ninguna otra ficha-unit los use.

## P0 / riesgos conocidos
- **BOMBA -999 (gotcha 6a) — ALTO x2:**
  - OverviewTab `<Sheet snapPoints={['88%']}>` (L409-414): snapPoint fijo 88%. Si el sheet es CRITICO para el flujo (ej. detalle de check-in / accion) → verificar primer present; si da containerHeight -999 → migrar a `nativeModal`.
  - ProgresoTab `<Sheet snapPoints={['55%']}>` (L189-194): idem. Verificar en device.
  - Ambos usan el wrapper `components/Sheet.tsx` (soporta `nativeModal`). Snapshots con snapPoint fijo (no dependen de medir contenido) pueden sobrevivir, pero PROBAR el primer present es obligatorio.
- **Auditoria pendiente (R5 §3.4):** los paneles de tab NO fueron auditados a fondo en R5 — cada `*Tab.tsx` requiere pasada propia vs su panel web (`ProfileOverviewB3`, `ProgressBodyCompositionB6`). Comparar seccion-a-seccion (cards, tipografia, tonos, copy).
- **Charts:** verificar que los graficos de composicion/peso usen los primitivos `charts/*` con tokens del theme (cero hex crudo nuevo).
- **Congelamiento:** N/A directo (los tabs reciben `data` de [clientId].tsx por props; no fetch propio). Confirmar por import.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"ProfileOverviewB3"` (14 hits, L~7060) — el mas rico de la ficha; `"ProgressBodyComposition"` (L~7432); `"NutritionTabB5"` NO (es otra unidad). Base fuerte para Overview via ola0 + R5.

## Notas de datos (queries/RPC, claves de dia)
- Reciben `data` de la ficha por props (perfil, checkIns, compliance, bodyComp, weeklyPRs). Sin queries propias.
- **Claves de dia (gotcha 6d):** adherencia semanal, "esta semana" de PRs, ultima actividad — dia calendario Santiago. Body composition usa fechas de check-in (respetar TZ Santiago en el eje temporal de los graficos).
