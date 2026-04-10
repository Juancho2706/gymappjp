# Estado del Proyecto — GymApp JP

> Documento vivo. Actualizar cada vez que se cierre un rework, se agregue deuda técnica, o cambie la prioridad de algo pendiente.

### Biblia del proyecto (junto a [`ESTADO-COMPONENTES.md`](ESTADO-COMPONENTES.md))

- Ambos documentos deben mantenerse **al día con el trabajo del día** cuando haya cambios sustanciales.
- Incluir **fecha y hora** en **America/Santiago** en la línea **Última actualización** inferior (formato: `YYYY-MM-DD HH:mm`).

**Última actualización:** 2026-04-10 America/Santiago — Revisión completa del código real: corregidos porcentajes de check-in (~63%), workout execution (~68%), catálogo ejercicios alumno (~68%), onboarding (~58%), auth alumno (~50%). Módulos pendientes actualizados. TOTAL global sube a ~52%.

---

## Reworks y optimizaciones completados

### Biblioteca de Programas (Workout Programs)
**Fecha:** 2026-04-08

**Qué se hizo:**
- Reescritura total de `WorkoutProgramsClient.tsx` — de monolito a orquestador
- Nuevos componentes: `LibraryHeader`, `LibraryToolbar`, `ProgramRow`, `ProgramPreviewPanel`
- `libraryStats.ts` — capa de dominio cliente con tipos y lógica de filtrado pura
- Preview responsive: Dialog en desktop, Sheet en móvil (`useSyncExternalStore` + matchMedia)
- Filtros avanzados: Popover desktop / Sheet móvil
- Motion con `useReducedMotion`, sticky header con blur
- `duplicateWorkoutProgramAction` mejorada para devolver snapshot y hacer prepend local sin refresh

**Archivos clave:**
- `src/app/coach/workout-programs/WorkoutProgramsClient.tsx`
- `src/app/coach/workout-programs/libraryStats.ts`
- `src/app/coach/workout-programs/components/` (4 componentes: `LibraryHeader`, `LibraryToolbar`, `ProgramRow`, `ProgramPreviewPanel`)
- `src/app/coach/builder/[clientId]/actions.ts` (duplicate con snapshot)

---

### Builder de Plantillas / Programas (WeeklyPlanBuilder)
**Fecha:** 2026-04-08

**Qué se hizo:**
- Rework completo del builder de semanas (`WeeklyPlanBuilder.tsx`)
- Navegación entre días con flechas izq/der en desktop
- Semanas A/B (`ab_mode`): toggle, variante activa, lógica de alternancia impar→A / par→B en `programWeekVariant.ts`
- Bottom sheet drag en mobile para catálogo de ejercicios
- Detección correcta de `isBuilder` en `CoachMainWrapper` para rutas `/coach/workout-programs/builder`
- `BlockEditSheet` para editar prescripción de ejercicio (series, reps, peso, tempo, RIR, notas, progresión automática)

**Archivos clave:**
- `src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx`
- `src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx`
- `src/lib/workout/programWeekVariant.ts`
- `src/components/coach/CoachMainWrapper.tsx`

---

### Directorio de Alumnos — War Room (Plan A)
**Fecha:** 2026-04-08

**Qué se hizo:**
- War Room header con stat cards animadas (`useMotionValue` + `useSpring`)
- Banners de alerta inteligentes por attention score
- ActionBar: búsqueda, filtros (estado/riesgo/programa), sort, toggle grid/tabla
- `ClientCardV2`: compliance ring, attention badge, sparklines, semáforo actividad, quick actions, stagger con `useReducedMotion`
- Tabla virtualizable (`@tanstack/react-virtual`) con columnas ordenables
- Skeletons y empty states con Lottie
- Attention Score motor de datos en `dashboard.service.ts`

**Archivos clave:**
- `src/app/coach/clients/ClientsDirectoryClient.tsx`
- `src/app/coach/clients/CoachWarRoom.tsx`
- `src/app/coach/clients/DirectoryActionBar.tsx`
- `src/app/coach/clients/ClientsDirectoryTable.tsx`
- `src/components/coach/ClientCardV2.tsx`
- `src/services/dashboard.service.ts`

---

### Perfil del Alumno — Radiografía Completa (Plan B)
**Fecha:** 2026-04-08

**Qué se hizo (6 tabs completos):**
- **Hero:** `ClientProfileHero` con training age, stat chips, export print, attention score
- **TabNav:** sticky, badges por tab, indicador spring animado, `useReducedMotion`, offset mobile corregido (`top-[3.5rem] md:top-0`)
- **Overview (B3):** alerta prioritaria, compliance rings, heatmap actividad, KPI grid, resumen programa con `ProgramPhasesBar` y próximo entrenamiento, check-in snapshot con foto ampliable
- **Entrenamiento (B4):** PR banner + confetti, RadarChart volumen muscular, BarChart tonelaje con **media móvil 7 sesiones**, StrengthCards con 1RM estimado (Epley) y AreaChart
- **Nutrición (B5):** macro rings y adherencia con **datos reales** (comidas completadas + `food_items`), gráficos consumo vs meta, pie plan/consumido, heatmap o `AdherenceStrip`, acordeón comidas, historial con kcal consumidas donde aplica (Plan H)
- **Progreso (B6):** weight AreaChart + proyección 4 sem (regresión lineal), IMC + franja visual, gauge energía RadialBar, photo comparison slider, timeline check-ins
- **Programa (B7):** grid semanal/cíclico, variante A/B por semana, sheet ejercicio (GIF + prescripción + historial), enlace al builder
- **Facturación (B8):** timeline pagos, resumen CLP, agregar/eliminar pagos
- **UX (B9):** FAB móvil (WhatsApp/check-in/builder), `loading.tsx` con skeleton per-tab layout, skeletons al cambiar tab (`useTransition` + `isPending`)

**Archivos clave:**
- `src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx`
- `src/app/coach/clients/[clientId]/ProfileTabNav.tsx`
- `src/app/coach/clients/[clientId]/` — TrainingTabB4Panels, NutritionTabB5, ProgressBodyCompositionB6, ProgramTabB7, BillingTabB8, ProfileOverviewB3, ProfileFloatingActions, ProfileCheckInSnapshot, ProfileProgramSummaryCard
- `src/app/coach/clients/[clientId]/profileTrainingAnalytics.ts`
- `src/app/coach/clients/[clientId]/loading.tsx`

---

### Dashboard del Alumno — Rework Total (`jaunty-fluttering-spark`)
**Fecha:** 2026-04-09

**Qué se hizo:**
- Reescritura total de `page.tsx` — server component con Suspense por sección (9 boundaries independientes)
- Arquitectura nueva: `_data/` (React.cache), `_components/` (por dominio), `_actions/`
- `dashboard.queries.ts` — todas las queries cacheadas con timezone Santiago
- `heroComplianceBundle.ts` — bundle cacheado que calcula hero + 3 scores de compliance (§10 del plan maestro). `planned_days` calculado iterando días reales (no hardcoded)
- `DashboardShell` — grid responsive 1 col mobile / 2 cols desktop con sidebar sticky 280–300px
- `DashboardHeader` + `ClientGreeting` + `StreakWidget` (flame, confetti ≥ 30 días)
- `WeekCalendar` + `CalendarDay` — con variante A/B vía `resolveActiveWeekVariantForDisplay`
- `CheckInBanner` — lógica urgente/warning/normal con `prefers-reduced-motion`
- `HeroSection` + `WorkoutHeroCard` + `RestDayCard` + `QuickLogSheet` (log rápido sin navegar)
- `ComplianceRingCluster` + `ComplianceRing` — anillo gris si sin datos nutrición
- `NutritionDailySummary` + `MacroBar` + `MealCompletionRow` — macros **reales** (`calculateConsumedMacros` + bundle con `food_items`/`foods`)
- `WeightWidget` + `WeightSparkline` + `TrendArrow` + `WeightQuickLog`
- `PersonalRecordsBanner` + `PRBadge` — confetti si PR < 24h
- `ActiveProgramSection` + `ProgramPhaseBar` + `WorkoutPlanCard` (stagger animado)
- `RecentWorkoutsSection` + `WorkoutLogItem`
- `DashboardPullToRefresh` — PWA-first, pull en mobile
- `loading.tsx` con skeletons por sección, replicando grid de dos columnas (sin layout shift)
- `quickLogWeightAction` server action (validación 20–400 kg)
- `src/lib/animation-presets.ts` + `src/lib/date-utils.ts` creados como utilidades compartidas
- E2E smoke test (Playwright, Chromium) — `npm run test:e2e` OK
- `npm run build` OK

**Deuda residual (baja):**
- §12 QA manual: Lighthouse PWA, iOS/Android real, auditoría contraste
- `goal_weight` no existe en schema — sin línea target en `WeightProgressChart`
- `StudentDashboardPreview` en coach settings sigue mostrando una vista desactualizada del dashboard alumno

**Archivos clave:**
- `src/app/c/[coach_slug]/dashboard/page.tsx` (rewrite)
- `src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts`
- `src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.ts`
- `src/app/c/[coach_slug]/dashboard/_components/` (30+ componentes)
- `src/app/c/[coach_slug]/dashboard/_actions/dashboard.actions.ts`
- `src/app/c/[coach_slug]/dashboard/loading.tsx`
- `src/lib/animation-presets.ts`
- `src/lib/date-utils.ts`

---

### Rework Nutrición — Alumno + Coach (planes A–H + cierre hacia maestro)
**Fecha inicio núcleo:** 2026-04-09 · **Ampliaciones:** 2026-04-10

**Qué se hizo (resumen):**
- **Alumno** (`/c/[slug]/nutrition`): arquitectura `_data` / `_actions` / `_components`; `NutritionShell` con día navegable, macros reales, adherencia 30 días, streak; eliminado `NutritionTracker` monolítico. Dashboard: `NutritionDailySummary` con consumo real alineado al plan + comidas completadas. Fix Motion en `MealCard` (spring vs keyframes).
- **Coach — hub**: `NutritionHub` (layout ancho 2000px), plantillas, alumnos SYNCED/CUSTOM, **`getActivePlansBoardData`** (barras 7d + kcal hoy en tarjetas), biblioteca alimentos con **`FoodListCompact`** (lista densa responsive en hub y `/coach/foods`).
- **Coach — PlanBuilder** y rutas `new` / `edit` / `client/[clientId]`; queries `nutrition-coach.queries.ts`; **todas** las server actions del hub en `_actions/nutrition-coach.actions.ts` (eliminado barrel `nutrition-plans/actions.ts` por límite Next/Turbopack); `unassignNutritionPlan` con sesión y chequeo de plan.
- **Redirect** desde `/coach/nutrition-builder/[clientId]`; `/coach/foods` con `FoodBrowser` + `AddFoodSheet`.
- **Perfil coach** tab Nutrición (B5): datos reales — `MacroRingSummary`, `AdherenceStrip`, kcal en gráficos/tabla, enlaces a editor y vista alumno.
- **BD / Supabase:** `nutrition-utils`; migraciones RLS **fase 1** (`daily_nutrition_logs`, `nutrition_meal_logs`, `nutrition_plans`, `nutrition_meals`, `food_items`, `foods`) y **fase 2** (`saved_meals`, `saved_meal_items`). Aplicación en proyecto vinculado vía MCP donde corresponda; copia en `supabase/migrations/`.
- **Pulido UI (plan `fizzy-skipping-torvalds`, 2026-04-09):** toasts en errores de búsqueda/toggle, `AlertDialog` en borrar plantilla y desasignar plan, `useReducedMotion` en `MealCard` / `MacroRingSummary`, validación plan vacío en PlanBuilder, sparkline cap 100, stats hub en grid 2 cols móvil, etc. — ver [`claudeplans/fizzy-skipping-torvalds.md`](../claudeplans/fizzy-skipping-torvalds.md).

**Backlog futuro (sin urgencia acordada):** código de barras / `FoodImportRow`; rework `/coach/meals`, UX `/coach/meal-groups`, `/coach/recipes`. Bitácora Cursor: [`progreso cursor/PROGRESO-sesion-2026-04-09.md`](../progreso%20cursor/PROGRESO-sesion-2026-04-09.md).

**QA RLS nutrición (E2E alumno + coach):** se ejecutará cuando [`ESTADO-COMPONENTES.md`](ESTADO-COMPONENTES.md) supere **~90%** en TOTAL ESTIMADO global (acordado 2026-04-10).

**Archivos clave:**
- `src/app/c/[coach_slug]/nutrition/` (`NutritionShell`, queries, actions)
- `src/app/c/[coach_slug]/dashboard/_components/nutrition/NutritionDailySummary.tsx`
- `src/app/coach/nutrition-plans/_components/` (hub, PlanBuilder, `ActivePlansBoard`, `FoodLibrary`, …)
- `src/app/coach/nutrition-plans/_data/nutrition-coach.queries.ts`, `_actions/nutrition-coach.actions.ts`
- `src/components/coach/FoodListCompact.tsx`
- `src/components/coach/CoachMainWrapper.tsx` (ancho nutrición)
- `src/app/coach/clients/[clientId]/NutritionTabB5.tsx`, `actions.ts` (`getClientProfileData`)
- `src/app/coach/foods/`
- `src/lib/nutrition-utils.ts`
- `supabase/migrations/20260410000000_nutrition_rls_phase1.sql`, `20260410120000_nutrition_rls_phase2_saved_meals.sql`

---

### iOS Bug Fixes (builder + workout-programs)
**Fecha:** 2026-04-08 | Reportados por tester en iPhone 16

| Bug | Archivo | Fix |
|-----|---------|-----|
| Label "Alumnos (0)" pegado al combobox | `WorkoutProgramsClient.tsx` | `space-y-2` → `space-y-3` |
| Título ejercicio chocaba con notch/Dynamic Island | `BlockEditSheet.tsx` | `pt-[max(1.5rem,env(safe-area-inset-top))]` en SheetHeader |
| Day tabs del builder desplazadas hacia abajo | `WeeklyPlanBuilder.tsx` | Removido `paddingTop: env(safe-area-inset-top)` erróneo + `mt-2→mt-1` |

---

### Coach panel móvil / PWA (refinamiento 2026-04-09)

- **Safe area:** se quitó `pt-safe` del contenedor del layout coach (evitaba **doble** inset con el header móvil). Solo el header móvil (`CoachSidebar`) usa `pt-safe` bajo Dynamic Island.
- **Directorio alumnos:** vista **tabla** por defecto; tabla con scroll horizontal único (cabecera + filas); menús Base UI con `DropdownMenuGroup`; `modal={false}` en dropdowns para menos saltos con nav fijo.
- **PWA:** `PwaRegister` ajusta viewport en `standalone` (sin zoom); layout coach con `min-h-[100dvh]` en móvil.
- **Tarjetas:** menú “más opciones” con icono visible (`MoreHorizontal`).

---

## Deuda técnica pendiente

### Media prioridad

#### ~~`consumedCals` en tab Nutrición del perfil~~ *(cerrado 2026-04-09)*
El alumno marca comidas en `/nutrition`; el perfil coach agrega kcal consumidas estimadas por `food_items` de comidas completadas (`nutritionLogsEnriched` + `NutritionTabB5`). Opcional futuro: persistir `consumed_*` en `daily_nutrition_logs` para historial sin recomputar con el plan actual.

---

#### Unificar `LIBRARY_PROGRAM_LIST_SELECT`
El string de select de la biblioteca está duplicado en `actions.ts` y en `page.tsx`.
**Trabajo:** Extraer a `src/lib/supabase/queries/workout-programs-library.ts`.

---

#### `goal_weight` en tabla `clients` — línea target en chart de peso
El `WeightProgressChart` del dashboard del alumno no tiene línea de objetivo porque el campo `goal_weight` no existe en el schema de `clients`.
**Trabajo cuando aplique:** Agregar columna `goal_weight_kg numeric` en `clients` (migración Supabase) y pasar el valor al componente para mostrar `<ReferenceLine>` en el chart.
**Dependencia:** Decisión de producto sobre si se expone al coach en el perfil del alumno o en onboarding.

---

#### `ClientCard.tsx` V1 — archivo huérfano
`src/components/coach/ClientCard.tsx` sigue en el repo pero nada lo importa (el directorio usa `ClientCardV2`).
**Trabajo:** Confirmar con `grep` y borrar.

---

#### Workout execution — variante A/B en `page.tsx`
`/c/[coach_slug]/workout/[planId]/page.tsx` carga el plan pero no resuelve la variante A/B activa de la semana. El dashboard sí lo hace vía `resolveActiveWeekVariantForDisplay`. Alinear la página de ejecución para que sepa si el alumno está en semana A o B.
**Trabajo:** Pasar `week_variant` resuelto desde la query de `page.tsx` al cliente, y mostrarlo como contexto en el header.

---

### Baja prioridad / UX futura

#### `ProgramPhasesBar` en filas de biblioteca
Las filas de la biblioteca solo tienen badge "Fases". Las cards antiguas mostraban la barra visual.
**Opción:** Mostrar en vista previa o al hover (tooltip desktop).

---

#### Ordenación y agrupación en biblioteca
El orden actual viene del servidor (`created_at DESC`).
**Opciones:** Ordenar por nombre / última actividad / cliente. Agrupar plantillas vs en curso con encabezados sticky.

---

#### `useReducedMotion` en todos los child components del perfil
Aplicado en tab transitions, FAB y grid del directorio. No aplicado en todos los componentes hijo del perfil (hovers de imágenes, animaciones internas de B3–B8).

---

## Módulos pendientes de rework (próximos planes)

> Estado revisado contra código real 2026-04-10. Los módulos "pendientes" ya tienen implementación base; el % indica cuánto queda para considerarlos "reworkeados".

| Módulo | Estado actual | Pendiente | Prioridad |
|--------|--------------|-----------|-----------|
| ~~**Nutrición (alumno + núcleo coach)**~~ | ~~`/nutrition`, hub, PlanBuilder, foods, tab B5, board enriquecido, RLS en repo, lista compacta alimentos.~~ | — | ~~Alta~~ → **COMPLETADO (núcleo)** 2026-04-09/10 |
| **Extensión nutrición coach** | Stub / parcial | Barcode/import; `/coach/meals`, `/coach/recipes`, UX meal-groups | **Futura** (baja prioridad) |
| ~~**Dashboard del alumno**~~ | ~98% | §12 QA manual (Lighthouse, iOS/Android real) | ~~Media~~ → **COMPLETADO** 2026-04-09 |
| **Workout execution** (`/c/[coach_slug]/workout/[planId]`) | ~68% funcional | Optimistic updates, PRs en summary, A/B en page, confetti al completar | Media |
| **Check-in del alumno** (`/c/[coach_slug]/check-in`) | ~63% funcional | Múltiples fotos, medidas corporales, UX step wizard mobile | Media |
| **Dashboard coach principal** (`/coach/dashboard`) | ~0% rework | Rework completo UX + queries enriquecidas | Media |
| **Mi Marca / Settings** (`/coach/settings`) | ~0% rework | Rework branding, `StudentDashboardPreview` alineado al dashboard actual | Media |
| **Onboarding** (`/c/[coach_slug]/onboarding`) | ~58% funcional | Progress bar visual, foto inicial, validación por paso | Baja |
| **Catálogo ejercicios alumno** (`/c/[coach_slug]/exercises`) | ~68% funcional | Rework visual, favoritos, historial por ejercicio | Baja |
| **Ejercicios coach** (`/coach/exercises`) | Funcional básico, sin rework | Rework UX: upload GIF, bulk edit, organización | Baja |
| **Login / auth alumno** | ~50% | Rework visual con branding avanzado | Baja |
| **Pagos & Suscripciones** | 0% | Stripe/MercadoPago, webhook, feature flags por tier | **Alta (producto)** |
| **Panel CEO / Superadmin** | 0% | Métricas globales: coaches, MRR, churn, actividad | Baja |

---

## Notas de arquitectura

- **Colores por coach:** `--theme-primary` CSS var en `CoachLayout`. Respetar en todos los charts y elementos de énfasis.
- **Dark mode primario:** Verificar variantes dark en todos los componentes nuevos.
- **`GlassCard`:** Base de todas las cards del perfil y directorio. No crear cards custom sin revisar si aplica.
- **Safe area iOS:** Usar `env(safe-area-inset-top/bottom)` en fixed/sticky en mobile. En **coach móvil**, el **header superior** (`CoachSidebar`) lleva `pt-safe`; el contenedor del layout **no** debe duplicar `pt-safe` (evita doble hueco bajo Dynamic Island). No re-aplicar inset en hijos que ya quedan bajo ese header.
- **Variante A/B:** Lógica centralizada en `src/lib/workout/programWeekVariant.ts`. Semana impar del programa → A, par → B. Usada en builder, perfil (tab Programa, badges, `resolveNextProgramWorkout`) y dashboard cliente.
