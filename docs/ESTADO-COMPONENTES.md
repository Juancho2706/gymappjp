# Estado de Componentes — Rework Progress

> Seguimiento del nivel de optimización de cada componente principal.
> El objetivo es que cada módulo sea fluido para el coach/alumno, eficiente con la BD y bien integrado con el resto del sistema.

### Biblia del proyecto (norma de mantenimiento)

- Este archivo y [`ESTADO-PROYECTO.md`](ESTADO-PROYECTO.md) son la **referencia fundamental** del estado del código: deben reflejar **lo hecho el mismo día** cuando haya trabajo sustancial (rework, features, migraciones, decisiones de alcance).
- Cada actualización debe llevar **fecha y hora** en **America/Santiago** en la línea **Última actualización** de ambos documentos (formato recomendado: `YYYY-MM-DD HH:mm America/Santiago`).
- Detalle nutrición día a día: [`progreso cursor/PROGRESO-nutricion-rework.md`](progreso%20cursor/PROGRESO-nutricion-rework.md).

**Última actualización:** 2026-04-10 19:00 America/Santiago — Nutrición coach (núcleo ~93%): board 7d+kcal, lista compacta alimentos, layout ancho, actions unificadas, RLS fase 1+2 en repo; gatillo QA RLS cuando este documento supere **~90% global**; barcode / meals / meal-groups / recipes → futuro.

---

## Leyenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Rework completo — listo y optimizado |
| 🔶 | Parcialmente optimizado — funciona pero tiene deuda pendiente |
| ❌ | Pendiente de rework |
| 🚧 | En progreso actualmente |

---

## MÓDULO PÚBLICO / MARKETING

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| Landing Page | `/` | ❌ | 0% | Existe pero sin rework |
| Pricing / Planes | `/pricing` | ❌ | 0% | Página estática — sin integración de pago real |
| Registro con pago | `/register` | ❌ | 0% | No hay método de pago real, no hay cuentas free — flujo completo pendiente |
| Login coach | `/login` | ❌ | 0% | Funcional básico, sin rework |
| Forgot / Reset password | `/forgot-password`, `/reset-password` | ❌ | 0% | Funcional básico, sin rework |

---

## MÓDULO COACH

### Dashboard Principal del Coach (`/coach/dashboard`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` (server) | ❌ | 0% | Existe con estadísticas básicas — sin rework |
| `CoachDashboardClient` | ❌ | 0% | Existe — sin rework de UX ni optimización de queries |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente de rework**

---

### Mi Marca / Brand Settings (`/coach/settings`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` (server) | ❌ | 0% | Existe — sin rework |
| `BrandSettingsForm` | ❌ | 0% | Formulario de colores y datos de marca — sin rework |
| `LogoUploadForm` | ❌ | 0% | Upload de logo — sin rework |
| `loading.tsx` | ❌ | 0% | Sin rework |
| `settings/preview/` `StudentDashboardPreview` | ❌ | 0% | Preview de cómo ve el alumno la app — sin rework |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente de rework**

---

### Directorio de Clientes (`/coach/clients`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `CoachClientsShell` | ✅ | 100% | Orquestador limpio, maneja riskFilter |
| `CoachWarRoom` | ✅ | 100% | Stat cards animadas, banners de alerta por attention score |
| `DirectoryActionBar` | ✅ | 100% | Búsqueda, filtros, sort, toggle grid/tabla |
| `ClientsDirectoryClient` | ✅ | 100% | Vista grid + tabla unificada, filtros activos |
| `ClientsDirectoryTable` | ✅ | 100% | Virtualizable con @tanstack/react-virtual, columnas ordenables |
| `ClientsDirectoryEmpty` | ✅ | 100% | Empty state con Lottie |
| `ClientCard.tsx` (V1) | ❌ | 0% | **Huérfano** — nada lo importa, pendiente borrar |
| `ClientCardV2` | ✅ | 100% | Compliance ring, attention badge, sparklines, semáforo, quick actions |
| `CreateClientModal` | ✅ | 100% | Crea auth user + registro vía Admin API |
| `dashboard.service.ts` | ✅ | 100% | Motor de Attention Score, cálculo de riesgo, 1RM Epley |
| `actions.ts` | ✅ | 100% | CRUD completo: crear/borrar/toggle/resetPassword vía Admin API |

**Resultado del módulo: ~90%**

---

### Perfil del Alumno (`/coach/clients/[clientId]`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` + `getClientProfileData` | ✅ | 100% | Suspense, fetch paralelo |
| `ClientProfileDashboard` | ✅ | 100% | Tabs, useTransition, orquestador |
| `ClientProfileHero` | ✅ | 100% | Training age, stat chips, attention score |
| `ProfileTabNav` | ✅ | 100% | Sticky, badges, spring animado, useReducedMotion |
| `ProfileOverviewB3` | ✅ | 100% | Compliance rings, heatmap, KPI grid, próximo entreno |
| `TrainingTabB4Panels` | ✅ | 100% | PR banner, RadarChart, BarChart + media móvil, StrengthCards |
| `NutritionTabB5` | ✅ | 100% | Perfil coach: macros hoy reales (`MacroRingSummary`), `AdherenceStrip` 30d, kcal consumidas en gráficos/tabla, enlaces editar plan / vista alumno (Plan H) |
| `ProgressBodyCompositionB6` | ✅ | 100% | Weight chart + proyección lineal, IMC, gauge, photo slider |
| `ProgramTabB7` | ✅ | 100% | Grid semanal/cíclico, variante A/B, sheet ejercicio, link al builder |
| `BillingTabB8` | ✅ | 100% | Timeline pagos, resumen CLP, agregar/eliminar pagos |
| `ProfileFloatingActions` | ✅ | 100% | FAB móvil (WhatsApp / check-in / builder) |
| `loading.tsx` | ✅ | 100% | Skeleton per-tab layout |
| `profileTrainingAnalytics.ts` | ✅ | 100% | PR, volumen, tonelaje, sparklines |

**Resultado del módulo: ~95%**

---

### Constructor de Planes (`/coach/builder/[clientId]`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `WeeklyPlanBuilder` | ✅ | 100% | Rework completo, navegación días, A/B mode, bottom sheet mobile |
| `usePlanBuilder` | ✅ | 100% | Estado centralizado, DnD, undo/redo, balance muscular |
| `BlockEditSheet` | ✅ | 100% | series, reps, peso, tempo, RIR, notas, progresión. iOS safe-area |
| `DraggableExerciseCatalog` | ✅ | 100% | Sidebar + bottom sheet mobile |
| `MuscleBalancePanel` | ✅ | 100% | Balance en tiempo real |
| `DayColumn` + `ExerciseBlock` | ✅ | 100% | DnD completo |
| `ProgramConfigHeader` | ✅ | 100% | Nombre, fechas, fases |
| `TemplatePickerDialog` | ✅ | 100% | |
| `AssignToClientsDialog` | ✅ | 100% | Asignación masiva |
| `PrintProgramDialog` | 🔶 | 50% | Funcional, layout de impresión sin refinamiento |
| `actions.ts` | ✅ | 100% | save, sync, assign, duplicate con snapshot |

**Resultado del módulo: ~95%**

---

### Biblioteca de Programas (`/coach/workout-programs`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `WorkoutProgramsClient` | ✅ | 100% | Rework completo, orquestador limpio |
| `LibraryHeader` | ✅ | 100% | |
| `LibraryToolbar` | ✅ | 100% | Filtros Popover/Sheet responsive |
| `ProgramRow` | ✅ | 100% | |
| `ProgramPreviewPanel` | ✅ | 100% | Dialog desktop / Sheet móvil |
| `libraryStats.ts` | ✅ | 100% | Capa de dominio pura |
| `page.tsx` | 🔶 | 70% | `LIBRARY_PROGRAM_LIST_SELECT` duplicado respecto a `actions.ts` |
| `actions.ts` | ✅ | 100% | duplicate con snapshot + prepend local |

**Resultado del módulo: ~95%**

---

### Módulo Nutrición del Coach

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| Hub + tabs | `/coach/nutrition-plans` | ✅ | 95% | `NutritionHub` (ancho 2000px), `TemplateLibrary`, `ActivePlansBoard` (**sparkline 7d + kcal hoy** vía `getActivePlansBoardData`), `FoodLibrary`, `AssignModal`; `page.tsx` + `loading.tsx`; datos vía `nutrition-coach.queries` |
| PlanBuilder + rutas | `/coach/nutrition-plans/new`, `…/[id]/edit`, `…/client/[clientId]` | ✅ | 95% | dnd-kit, `FoodSearchDrawer`, persistencia JSON vía `_actions/nutrition-coach.actions.ts` (incl. assign, delete/duplicate template, custom food, `unassign` con sesión) |
| Redirect legacy | `/coach/nutrition-builder/[clientId]` | 🔶 | 40% | Solo redirect a `nutrition-plans/client/...`; forms/modal legacy eliminados |
| Alimentos | `/coach/foods` | ✅ | 95% | `FoodBrowser` + **`FoodListCompact`** (lista densa responsive), `AddFoodSheet`, `getFoodLibrary`; `FoodSearch.tsx` (RPC) compartido con meal-groups |
| Comidas | `/coach/meals` | ❌ | 0% | **Futuro** — sin rework; decisión producto (prioridad baja hasta nuevo aviso) |
| Grupos de Comidas | `/coach/meal-groups` | 🔶 | 30% | **Futuro (UX)** — sin rework; sigue usando `FoodSearch` |
| Recetas | `/coach/recipes`, `[recipeId]` | ❌ | 0% | **Futuro** — sin rework; fuera del núcleo nutrición acordado |
| Código de barras / import | — | ❌ | 0% | **Futuro** — `FoodImportRow` u equivalente no implementado |

**Resultado — núcleo (hub + PlanBuilder + foods + datos perfil B5 ya en otra sección): ~93%** — Alineado con el flujo maestro coach **excl.** extensiones meals/recipes/grupos/barcode. **RLS** (logs, planes, meals, items, foods, `saved_meals`): migraciones en `supabase/migrations/`; **validación E2E alumno+coach con RLS** se hará cuando el **TOTAL ESTIMADO** de este documento supere **~90%** (acordado 2026-04-10).

**Resultado — módulo “completo” si se exigen meals + recipes + grupos al mismo nivel:** ~55% (arrastran filas en 0–30%). Detalle: [`PROGRESO-nutricion-rework.md`](progreso%20cursor/PROGRESO-nutricion-rework.md).

---

### Ejercicios del Coach (`/coach/exercises`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Catálogo de ejercicios | ❌ | 0% | Existe — sin rework |

**Resultado del módulo: 0% — Pendiente**

---

### Templates (`/coach/templates`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Biblioteca de templates | ❌ | 0% | Existe — sin rework |

**Resultado del módulo: 0% — Pendiente**

---

## MÓDULO ALUMNO (CLIENT)

### Login & Cambio de Contraseña

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| `ClientLoginForm` | `/c/[slug]/login` | ❌ | 0% | Funcional, sin rework |
| `change-password/page` | `/c/[slug]/change-password` | ❌ | 0% | Funcional, sin rework |
| `suspended/page` | `/c/[slug]/suspended` | ❌ | 0% | Pantalla básica, sin rework |

---

### Onboarding del Alumno (`/c/[slug]/onboarding`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `OnboardingForm` | ❌ | 0% | Existe — sin rework. Flujo intake, objetivos, foto inicial |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente (prioridad baja)**

---

### Dashboard del Alumno (`/c/[slug]/dashboard`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` + `_data/*` + `_components/*` | ✅ | 100% | Checklist §11 cerrado. Shell md+, streaming Suspense, React.cache, compliance §10, skeletons, E2E smoke. Ver [`PROGRESO-jaunty-fluttering-spark.md`](progreso%20cursor/PROGRESO-jaunty-fluttering-spark.md) |
| `DashboardShell` + `loading.tsx` | ✅ | 100% | Grid 2 cols desktop, sidebar sticky, safe-area. `loading.tsx` replica el grid exacto — sin layout shift |
| `DashboardHeader` + `StreakWidget` + `ClientGreeting` | ✅ | 100% | Greeting contextual, fecha Santiago, racha con flame + confetti ≥ 30 días |
| `WeekCalendar` + `CalendarDay` | ✅ | 100% | Usa `resolveActiveWeekVariantForDisplay` + `workoutPlanMatchesVariant` — A/B correcto |
| `CheckInBanner` | ✅ | 100% | Oculto <3 días, warning 5–7 días, urgente >7 días, pulso `prefers-reduced-motion` |
| `HeroSection` + `WorkoutHeroCard` + `RestDayCard` | ✅ | 100% | Hero contextual, progress bar animada, overlay "completado", `QuickLogSheet` |
| `QuickLogSheet` | ✅ | 100% | `logSetAction` solo necesita `block_id` — no requiere `planId`. Optimistic local state |
| `ComplianceRingCluster` + `ComplianceRing` | ✅ | 100% | 3 anillos animados, anillo gris si sin datos nutrición, `prefers-reduced-motion` |
| `heroComplianceBundle.ts` | ✅ | 100% | `planned_days` calculado iterando 30 días reales (no hardcoded). Scores §10 del plan maestro |
| `NutritionDailySummary` + `MacroBar` + `MealCompletionRow` | ✅ | 100% | Macros **reales** vía `calculateConsumedMacros` + plan con `food_items`/`foods` (`getTodayNutritionBundle`). Coherente con `/nutrition` rework (planes D+) |
| `WeightWidget` + `WeightSparkline` + `TrendArrow` + `WeightQuickLog` | ✅ | 100% | Sparkline 14 días, log rápido de peso sin navegar |
| `WeightProgressChart` | 🔶 | 80% | AreaChart con datos reales. Sin línea de objetivo (`goal_weight` no existe en schema — deuda de BD) |
| `PersonalRecordsBanner` + `PRBadge` | ✅ | 100% | Top 5 PRs, ventana 14 días, confetti si PR < 24h (sessionStorage evita repetir) |
| `ActiveProgramSection` + `ProgramPhaseBar` + `WorkoutPlanCard` | ✅ | 100% | Stagger `fadeSlideLeft`, `--theme-primary`, variante A/B |
| `RecentWorkoutsSection` + `WorkoutLogItem` | ✅ | 100% | Últimas sesiones con stagger |
| `DashboardPullToRefresh` | ✅ | 100% | PWA-first, pull en mobile |
| `_actions/dashboard.actions.ts` | ✅ | 100% | `quickLogWeightAction` con validación 20–400 kg |

**Resultado del módulo: ~98% — Código completo. Deuda menor: `goal_weight` en BD para línea target en chart de peso; §12 QA manual (Lighthouse, iOS/Android real, contraste).**

---

**Nota:** `StudentDashboardPreview` en `/coach/settings/preview` (0%) sigue mostrando una vista desactualizada del dashboard alumno. Actualizar cuando se haga el rework de Mi Marca.

---

### Ejecución de Entrenamiento (`/c/[slug]/workout/[planId]`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` | 🔶 | 40% | Fetch plan + historial funcional, falta contexto de variante/streak |
| `WorkoutTimerProvider` | ✅ | 100% | Context limpio, expone `useWorkoutTimer()` |
| `WorkoutExecutionClient` | 🔶 | 50% | Funcional — UX mobile pendiente de pulir |
| `LogSetForm` | 🔶 | 50% | Funcional — sin optimistic update ni feedback animado |
| `RestTimer` | 🔶 | 50% | Funcional — sin audio/vibración ni personalización por ejercicio |
| `WorkoutSummaryOverlay` | 🔶 | 30% | Existe — contenido básico, falta datos de volumen y logros del día |
| `actions.ts` | 🔶 | 60% | `logSetAction` upsert funcional — falta manejo offline/retry |

**Resultado del módulo: ~50% — Funcional pero sin pulir (prioridad media)**

---

### Check-in del Alumno (`/c/[slug]/check-in`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `CheckInForm` | ❌ | 0% | Existe — sin rework. Flujo peso + fotos + energía desde mobile |
| `actions.ts` | ❌ | 0% | Sin rework |

**Resultado del módulo: 0% — Pendiente (prioridad media)**

---

### Nutrición del Alumno (`/c/[slug]/nutrition`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` + `loading.tsx` | ✅ | 100% | Server: plan activo, log día, adherencia 30d Santiago; layout según plan maestro |
| `NutritionShell` | ✅ | 100% | `useOptimistic`, cambio de día, `fetchLogForDate`, integra rings + comidas + adherencia |
| `DayNavigator` | ✅ | 95% | Navegación por día (tap/flechas); swipe opcional no crítico |
| `MacroRingSummary`, `MealCard`, `MealIngredientRow` | ✅ | 100% | Macros reales por ítems completados |
| `AdherenceStrip`, `NutritionStreakBanner`, `EmptyNutritionState` | ✅ | 100% | |
| `_data/nutrition.queries.ts` | ✅ | 100% | `React.cache`, fechas coherentes con Santiago donde aplica |
| `_actions/nutrition.actions.ts` | ✅ | 100% | Toggle + fetch log por fecha |
| `NutritionTracker` / `nutrition/actions.ts` | — | — | **Eliminados** (reemplazados por arquitectura anterior) |

**Resultado del módulo: ~96% — Alineado con [PLAN-NUTRICION-ALUMNO.md](../claudeplans/PLAN-NUTRICION-ALUMNO.md) en alcance A–D+H (perfil coach); ver PROGRESO-nutricion-rework para matices RLS/UX.**

---

### Catálogo de Ejercicios del Alumno (`/c/[slug]/exercises`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `ClientExerciseCatalog` | ❌ | 0% | Existe — sin rework |

**Resultado del módulo: 0% — Pendiente**

---

## PANEL CEO / SUPERADMIN

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Panel CEO / Superadmin | ❌ | 0% | **No existe aún.** Ruta secreta (ej. `/x/internal` o similar) protegida solo para vos y tu socio. Ver métricas globales: coaches activos, MRR, churn, alumnos totales, actividad de la plataforma |

**Resultado del módulo: 0% — No implementado**

---

## PAGOS Y SUSCRIPCIONES

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Método de pago real (coach) | ❌ | 0% | No implementado — sin Stripe/MercadoPago/etc. |
| Registro + pago obligatorio | ❌ | 0% | Flujo `/register` sin payment gate — no hay cuentas free |
| Webhooks de suscripción | ❌ | 0% | No implementado |
| Gestión de suscripción (coach dashboard) | ❌ | 0% | No implementado |
| Control de acceso por plan | ❌ | 0% | No hay feature flags por tier de suscripción |

**Resultado del módulo: 0% — No implementado**

---

## INFRAESTRUCTURA / COMPARTIDOS

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `middleware.ts` | ✅ | 100% | Auth, branding por slug, client suspension |
| `CoachMainWrapper` | ✅ | 100% | `isBuilder` + ancho **2000px** en rutas `/coach/nutrition-plans/*` (alineado a builder) |
| `CoachSidebar` | ✅ | 100% | Navegación coach completa |
| `ClientNav` | 🔶 | 50% | Funcional — sin revisión post-rework del módulo cliente |
| `GlassCard` | ✅ | 100% | Base de cards del sistema |
| `ProgramPhasesBar` (shared) | ✅ | 100% | Usada en builder, perfil, biblioteca |
| `programWeekVariant.ts` | ✅ | 100% | Lógica A/B centralizada, 3+ módulos |
| `dashboard.service.ts` | ✅ | 100% | Attention Score, DirectoryPulse, 1RM |
| `supabase/server.ts` | ✅ | 100% | Client + AdminClient |
| `supabase/queries/workout-programs-library.ts` | 🔶 | 50% | Existe pero select no unificado |
| UI primitives (shadcn) | ✅ | 100% | button, card, dialog, input, form, sheet, etc. |
| PWA / manifests | 🔶 | 60% | Funcional básico — sin rework de UX offline |

---

## Resumen General

| Módulo | % Completado |
|--------|-------------|
| Directorio de Clientes (coach) | 90% |
| Perfil del Alumno (coach) | 94% |
| Constructor de Planes | 95% |
| Biblioteca de Programas | 95% |
| Infraestructura / Shared | 85% |
| Workout Execution (alumno) | 50% |
| Dashboard Coach Principal | 0% |
| Mi Marca / Brand Settings | 0% |
| Módulo Nutrición Coach (núcleo) | ~93% |
| Ejercicios Coach | 0% |
| Templates | 0% |
| Dashboard Alumno | ~98% |
| Check-in Alumno | 0% |
| Nutrición Alumno | ~96% |
| Catálogo Ejercicios Alumno | 0% |
| Onboarding Alumno | 0% |
| Login / Auth Alumno | 0% |
| Landing / Pricing / Marketing | 0% |
| **Pagos & Suscripciones** | **0%** |
| **Panel CEO / Superadmin** | **0%** |
| **TOTAL ESTIMADO** | **~47%** |

---

## Próximos Reworks (por prioridad)

### 🔴 Alta
1. **Pagos & Suscripciones** — integrar Stripe o MercadoPago, registro obligatorio con pago, webhooks.

### 🟠 Media
2. **Dashboard del alumno** — **código al ~98%** (ver [`PROGRESO-jaunty-fluttering-spark.md`](progreso%20cursor/PROGRESO-jaunty-fluttering-spark.md)); pendiente §12 QA (Lighthouse, iOS/Android real) y actualizar **preview** en Mi Marca.
3. **Workout Execution** — optimistic updates, WorkoutSummaryOverlay con datos reales, RestTimer con audio/vibración.
4. **Check-in del alumno** — flujo mobile: peso + fotos + energía.
5. **Dashboard principal del coach** (`/coach/dashboard`) — rework de UX y queries.
6. **Mi Marca** (`/coach/settings`) — rework del flow de branding y preview alineado al dashboard actual.

### 🟡 Baja
7. **Panel CEO / Superadmin** — ruta secreta para supervisión global de la plataforma.
8. **Ejercicios Coach** — catálogo con rework.
9. **Onboarding alumno** — intake, objetivos, foto inicial.
10. **Landing / Pricing** — rework de marketing y conexión al flujo de registro+pago.
11. **Deuda técnica menor:** borrar `ClientCard.tsx` V1, unificar `LIBRARY_PROGRAM_LIST_SELECT`, `useReducedMotion` en child components del perfil.

### 🔵 Futuro (sin urgencia acordada — nutrición)
- **Código de barras / import rápido de alimentos** (`FoodImportRow` o similar).
- **Extensión nutrición coach:** rework `/coach/meals`, UX `/coach/meal-groups`, `/coach/recipes` si el producto los reabre.

### ⏳ Condicionado (calidad / seguridad)
- **QA E2E nutrición con RLS** (sesión alumno + coach, toggles, planes, `saved_meals`): ejecutar cuando **TOTAL ESTIMADO** de **este documento** sea **> ~90%** (acordado 2026-04-10). Hasta entonces, RLS sigue aplicándose por migraciones pero sin esa batería formal.

### ✅ Cerrado en esta iteración (referencia)
- **Nutrición alumno** `/c/[slug]/nutrition` + integración dashboard — ver [`PROGRESO-nutricion-rework.md`](progreso%20cursor/PROGRESO-nutricion-rework.md).
- **Núcleo nutrición coach** — hub (board enriquecido), PlanBuilder, rutas, foods (lista compacta), actions unificadas, layout ancho, migraciones RLS fase 1–2 en repo — mismo archivo + bitácora 2026-04-09/10.
