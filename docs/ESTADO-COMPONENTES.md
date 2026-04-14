# Estado de Componentes — Rework Progress

> Seguimiento del nivel de optimización de cada componente principal.
> El objetivo es que cada módulo sea fluido para el coach/alumno, eficiente con la BD y bien integrado con el resto del sistema.

### Biblia del proyecto (norma de mantenimiento)

- Este archivo y [`ESTADO-PROYECTO.md`](ESTADO-PROYECTO.md) son la **referencia fundamental** del estado del código: deben reflejar **lo hecho el mismo día** cuando haya trabajo sustancial (rework, features, migraciones, decisiones de alcance).
- Cada actualización debe llevar **fecha y hora** en **America/Santiago** en la línea **Última actualización** de ambos documentos (formato recomendado: `YYYY-MM-DD HH:mm America/Santiago`).
- Bitácoras Cursor (sesiones): [`progreso cursor/PROGRESO-workout-checkin-rework-2026-04-10.md`](../progreso%20cursor/PROGRESO-workout-checkin-rework-2026-04-10.md).

**Última actualización:** 2026-04-13 America/Santiago — **Análisis + bug fix + roadmap:** BUG-001 workout weekly reset corregido (`page.tsx`+`actions.ts` con filtro fecha); hotfixes 2026-04-11→13: billing cycle validation, check-in alerts 30d, ClientCardV2 accessibility, 3 migraciones tiers/pagos; gaps nuevos identificados: historial por fecha coach (0%), tabs solapadas Entrenamiento+Programa (0%), KPI card Overview grande, unidades nutrición inconsistentes; plan 250 alimentos + unidades g/un pendiente implementación.

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
| Landing Page | `/` | 🔶 | 60% | 972 líneas: hero con animaciones Framer Motion, stats, features grid, pricing por tiers CLP (14.990–89.990), testimonios, CTAs, i18n (es/en), `StickyBrandingCard` lee `last_coach_slug` de localStorage, menú mobile Sheet. Pendiente: integración pago real, testimonios reales, optimización LCP, SEO técnico |
| Pricing / Planes | `/pricing` | 🔶 | 25% | Página estática con 3 tiers USD (Starter $49, Pro $99, Elite $199) — **inconsistente con landing que usa CLP**. Sin integración de pago. Header con links a `/login`. Necesita alineación de moneda y conexión al flujo de registro+pago |
| Registro coach | `/register` | 🔶 | 35% | Funcional: `createRawAdminClient()` crea auth user + row en `coaches`, slugifica brand name, verifica unicidad de slug. Zod (nombre, marca, email, password min 8). Sin payment gate, sin cuentas free, sin verificación email real |
| Login coach | `/login` | 🔶 | 40% | Funcional: `useActionState` + `signInWithPassword`, verifica existencia de coach row. UI básica con logo + ThemeToggle. Sin rework visual, sin "remember me", sin rate limiting |
| Forgot / Reset password | `/forgot-password`, `/reset-password` | 🔶 | 40% | Funcional: `resetPasswordForEmail` con `redirectTo` correcto, soporta `coach_slug` para redirigir al login del alumno. `reset-password` usa `updateUser`. Auth callback de error usa `/login` (coach) |

---

## MÓDULO COACH

### Dashboard Principal del Coach (`/coach/dashboard`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` (server) | 🔶 | 70% | Streaming con `Suspense` + `DashboardContent`; consulta principal movida a `_data/dashboard.queries.ts` (patrón estable). |
| `_data/dashboard.queries.ts` | ✅ | 85% | `Promise.all` paralelo + top 5 riesgo por `attentionScore`, actividades, KPIs y datasets de charts en una sola capa de datos. |
| `CoachDashboardClient` | 🔶 | 65% | Quick actions visibles (crear alumno/programas/nutrición), alertas críticas enriquecidas (riesgo + programas por vencer), charts y activity feed. |
| `actions.ts` | 🔶 | 60% | `getAdherenceStats`/`getNutritionStats` sigue operativo; menor prioridad tras consolidar `_data`. |
| `loading.tsx` | ✅ | 100% | Skeleton con stat cards + chart placeholder |

**Resultado del módulo: ~68% — Entró en fase comercial usable para Sprint 6. Pendiente: comparativas avanzadas, calendarios y análisis extendido.**

---

### Mi Marca / Brand Settings (`/coach/settings`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` (server) | 🔶 | 50% | Carga coach row, renderiza `LogoUploadForm` + `BrandSettingsForm`. Layout limpio `max-w-3xl` |
| `BrandSettingsForm` | 🔶 | 70% | Formulario funcional con color, branding y nuevo `welcome_message` (MVP comercial). |
| `LogoUploadForm` | 🔶 | 35% | Upload de logo a Supabase Storage funcional. Sin preview en tiempo real, sin crop |
| `loading.tsx` | ✅ | 100% | Skeleton básico |
| `settings/preview/page.tsx` | 🔶 | 20% | Existe pero `StudentDashboardPreview` muestra vista desactualizada del dashboard alumno |
| `actions.ts` | 🔶 | 65% | Update brand settings + logo URL + persistencia de `welcome_message`. |

**Resultado del módulo: ~62% — MVP de branding listo para venta (incluye mensaje de bienvenida). Pendiente: preview moderno y opciones avanzadas de identidad.**

---

### Directorio de Clientes (`/coach/clients`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `CoachClientsShell` | ✅ | 100% | Orquestador limpio, maneja riskFilter |
| `CoachWarRoom` | ✅ | 100% | Stat cards animadas, banners de alerta; `attentionFlags` null-safe |
| `DirectoryActionBar` | ✅ | 100% | Búsqueda, filtros, sort, toggle grid/tabla; menús Base UI con `DropdownMenuGroup`; `modal={false}` en móvil |
| `ClientsDirectoryClient` | ✅ | 100% | Vista grid + tabla; **tabla por defecto**; filtros activos; búsqueda null-safe (`full_name` / `email`) |
| `ClientsDirectoryTable` | ✅ | 100% | Virtualizable; columnas ordenables; **un solo** `overflow-x` para cabecera + filas (sin desbordar página) |
| `ClientsDirectoryEmpty` | ✅ | 100% | Empty state con Lottie |
| `ClientCardV2` | ✅ | 100% | Compliance ring, attention badge, sparklines, semáforo, quick actions; menú ⋯ (`MoreHorizontal`) + dropdown `modal={false}` |
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
| `page.tsx` | ✅ | 95% | Usa `LIBRARY_PROGRAM_LIST_SELECT` importado de `workout-programs-library.ts` (mismo fragmento que builder) |
| `actions.ts` | ✅ | 100% | duplicate con snapshot + prepend local |
| `builder/page.tsx` | ✅ | 100% | Reusa `WeeklyPlanBuilder` para templates (sin `clientId`) |

**Resultado del módulo: ~95%**

---

### Módulo Nutrición del Coach

#### Núcleo (en scope — flujo principal alumno + coach)

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| Hub + tabs | `/coach/nutrition-plans` | ✅ | 95% | `NutritionHub` (ancho 2000px), `TemplateLibrary`, `ActivePlansBoard` (**sparkline 7d + kcal hoy** vía `getActivePlansBoardData`), `FoodLibrary`, `AssignModal`; `page.tsx` + `loading.tsx`; datos vía `nutrition-coach.queries` |
| PlanBuilder + rutas | `/coach/nutrition-plans/new`, `…/[id]/edit`, `…/client/[clientId]` | ✅ | 95% | dnd-kit, `FoodSearchDrawer`, persistencia JSON vía `_actions/nutrition-coach.actions.ts` (incl. assign, delete/duplicate template, custom food, `unassign` con sesión); orden móvil sidebar→canvas; validación plan vacío; toasts / `AlertDialog` / `useReducedMotion` (auditoría 2026-04-09) |
| Redirect legacy | `/coach/nutrition-builder/[clientId]` | 🔶 | 40% | Solo redirect a `nutrition-plans/client/...`; forms/modal legacy eliminados |
| Alimentos | `/coach/foods` | ✅ | 95% | `FoodBrowser` + **`FoodListCompact`** (lista densa responsive), `AddFoodSheet`, `getFoodLibrary`; `FoodSearch.tsx` (RPC) compartido con meal-groups |

Perfil coach tab Nutrición (B5) y nutrición alumno (`/c/[slug]/nutrition`): datos reales documentados en sus secciones; no duplicados en esta tabla de núcleo coach.

**Resultado núcleo: ~93%** — RLS y migraciones ya versionadas en repo para fases recientes; mantener smoke E2E alumno+coach de forma periódica.

#### Extensiones futuras (fuera de scope — decisión producto 2026-04-09)

| Componente | Ruta | Estado | Notas |
|------------|------|--------|-------|
| Comidas | `/coach/meals` | ❌ Futuro | Prioridad baja hasta nueva decisión de producto |
| Grupos de Comidas | `/coach/meal-groups` | 🔶 Futuro | Sin rework UX; sigue usando `FoodSearch` |
| Recetas | `/coach/recipes`, `[recipeId]` | ❌ Futuro | Fuera del núcleo acordado |
| Código de barras / import | — | ❌ Futuro | `FoodImportRow` u equivalente no implementado |

---

### Ejercicios del Coach (`/coach/exercises`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` (server) | 🔶 | 50% | Carga ejercicios globales + custom del coach, agrupa por `muscle_group`, pasa a `ExerciseCatalogClient`. Funcional |
| `ExerciseCatalogClient` | 🔶 | 40% | Catálogo con búsqueda, filtro por grupo muscular, modal de ejercicio con GIF/video. Funcional pero UI sin rework |
| `actions.ts` | 🔶 | 35% | CRUD para ejercicios custom del coach. Sin upload de GIF, sin bulk edit |
| `loading.tsx` | ✅ | 100% | Skeleton dedicado |

**Resultado del módulo: ~40% — Funcional con catálogo + CRUD. No es 0% — tiene búsqueda, filtros y modal. Pendiente: rework UX, upload GIF, bulk edit, organización por tags**

---

### Templates (`/coach/templates`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` | — | N/A | **Solo `redirect('/coach/workout-programs')`** — no es un módulo independiente. La biblioteca de programas maneja templates vía `source_template_id` (self-reference en `workout_programs`). Builder de templates accesible desde `/coach/workout-programs/builder` |

**Resultado del módulo: N/A — Redirect. No cuenta para el TOTAL.**

---

## MÓDULO ALUMNO (CLIENT)

### Login & Cambio de Contraseña

| Componente | Ruta | Estado | % | Notas |
|------------|------|--------|---|-------|
| `ClientLoginForm` | `/c/[slug]/login` | 🔶 | 50% | Funcional con branding del coach (`--theme-primary`), `useActionState`; sin animaciones ni rework visual |
| `change-password/page` | `/c/[slug]/change-password` | 🔶 | 50% | Funcional (`force_password_change` flag), safe-area aplicado; sin rework visual |
| `suspended/page` | `/c/[slug]/suspended` | 🔶 | 50% | Pantalla básica funcional con safe-area; sin rework visual |

---

### Onboarding del Alumno (`/c/[slug]/onboarding`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` | 🔶 | 60% | Server component funcional, redirige a dashboard si `onboarding_completed` |
| `OnboardingForm` | 🔶 | 55% | ~357 líneas. Multi-step (AnimatePresence entre pasos), `useActionState`, localStorage draft (persiste progreso entre sesiones), campos: peso, altura, goals, experience_level, disponibilidad, lesiones, condiciones médicas. Pendiente: foto inicial, UI visual por paso más clara, validación campo a campo, progress bar, skip optional |
| `actions.ts` | 🔶 | 60% | `submitIntakeForm` guarda en `client_intake`; sin validación exhaustiva server-side |

**Resultado del módulo: ~58% — Funcional pero UX básica. Tiene multi-step con localStorage draft (prioridad baja para rework)**

---

### Dashboard del Alumno (`/c/[slug]/dashboard`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` + `_data/*` + `_components/*` | ✅ | 100% | Checklist §11 cerrado. Shell md+, streaming Suspense, React.cache, compliance §10, skeletons, E2E smoke. Resumen en [ESTADO-PROYECTO.md](ESTADO-PROYECTO.md) (*Dashboard del Alumno — Rework Total*). |
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

**Nota:** `StudentDashboardPreview` en `/coach/settings/preview` (20%) sigue mostrando una vista desactualizada del dashboard alumno. Actualizar cuando se haga el rework de Mi Marca.

---

### Ejecución de Entrenamiento (`/c/[slug]/workout/[planId]`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` | ✅ | 90% | Fetch plan + historial + verificación ownership + `resolveActiveWeekVariantForDisplay` + query `exerciseMaxes` con exclusión de bloques del plan actual. Funcional y completo; falta: streak context |
| `WorkoutTimerProvider` | ✅ | 100% | Context limpio, expone `useWorkoutTimer()` |
| `WorkoutExecutionClient` | 🔶 | 80% | ~600+ líneas. Funcional con secciones warmup/main/cooldown, modal GIF/video, superset handling, ThemeToggle, i18n, barra de progreso, badge Semana A/B, headers de sección, bloques completados con check, scroll al siguiente bloque, fechas relativas en historial. Pendiente: optimistic UI completo para sets, mejor UX mobile (scroll por bloque), vibración nativa |
| `LogSetForm` | 🔶 | 75% | `motion` en fila y botón, slider RPE opcional post-log. Pendiente: optimistic update local más fino, feedback animado más pulido |
| `RestTimer` | 🔶 | 80% | Audio (`playTimerSound`, `TimerSound`), selector tipo de sonido, volumen, edición del tiempo, settings panel, notificaciones web, alarm ringing. Falta: personalización por ejercicio desde prescripción, vibración nativa |
| `WorkoutSummaryOverlay` | ✅ | 90% | ~313 líneas. Desglose por ejercicio, PRs del día con 1RM Epley, volumen por grupo muscular, confetti, `useReducedMotion`, animaciones stagger. Falta: comparativa histórica, logros/badges |
| `loading.tsx` | ✅ | 100% | Skeleton |
| `actions.ts` | 🔶 | 75% | `logSetAction` upsert funcional + `revalidatePath` del perfil coach. Falta: manejo offline/retry, batch logging |

**Resultado del módulo: ~84% — BUG-001 cerrado 2026-04-13: filtro de fecha en query de logs y en upsert de `logSetAction`. PRs en summary, A/B en page, confetti, progress bar. Pendiente: optimistic updates completos, offline/retry, vibración.**

---

### Check-in del Alumno (`/c/[slug]/check-in`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` | ✅ | 90% | Server component con título/metadata mensual, query directa `lastCheckIn`, header sticky + `pt-safe`. Carga coach branding |
| `CheckInForm` | 🔶 | 78% | ~460 líneas. Wizard 3 pasos con indicadores, compresión dual (front + back photo), animaciones direction-aware (AnimatePresence), `formatRelativeDate` en banner del último check-in, `useActionState`. Pendiente: campos de medidas corporales, notas libres, más fotos (perfil lateral), `useReducedMotion` completo |
| `actions.ts` | 🔶 | 75% | `submitCheckinAction`: schema con `back_photo`, upload a bucket `checkins` con path `-back-`, insert `back_photo_url`; `revalidatePath` coach con path concreto. Pendiente: validación server-side más robusta, manejo de errores de Storage con rollback |
| `loading.tsx` | ✅ | 100% | Skeleton dedicado (nuevo en rework 2026-04-10) |

**Resultado del módulo: ~82% — Rework 2026-04-10 + threshold 30 días para alertas (commit 8a992d3). Wizard 3 pasos, dual photos. Pendiente: medidas corporales, notas libres, fotos extra.**

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

**Resultado del módulo: ~96% — Alineado con plan nutrición alumno en alcance A–D+H.**

---

### Catálogo de Ejercicios del Alumno (`/c/[slug]/exercises`)

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `page.tsx` | 🔶 | 70% | Server: carga ejercicios agrupados por músculo, pasa `primaryColor` al cliente |
| `loading.tsx` | ✅ | 100% | Skeleton dedicado |
| `ClientExerciseCatalog` | 🔶 | 65% | ~319 líneas. Búsqueda por texto, filtro por grupo muscular (chips horizontales), modal con GIF/video, `--theme-primary` para ring de focus. Pendiente: animaciones de lista, favoritos, filtro por equipo, acceso al historial del ejercicio |

**Resultado del módulo: ~68% — Funcional. Tiene búsqueda + filtro + modal GIF. Pendiente: rework visual y features extra (baja prioridad)**

---

## PANEL CEO / SUPERADMIN

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Panel CEO / Superadmin | ❌ | 0% | **No existe aún.** Ruta secreta (ej. `/x/internal` o similar) protegida solo para founders. Ver métricas globales: coaches activos, MRR, churn, alumnos totales, actividad de la plataforma |

**Resultado del módulo: 0% — No implementado**

---

## PAGOS Y SUSCRIPCIONES

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| Método de pago real (coach) | 🔶 | 88% | MP REST (`fetch`); `cancelCheckoutAtProvider` + `fetchCheckoutSnapshot` en provider; sin SDK npm `mercadopago`. |
| Registro + pago obligatorio | 🔶 | 75% | Registro → `pending_payment` → processing/reactivate; UX/funnels comerciales pendientes. |
| Webhooks de suscripción | 🔶 | 88% | Token **obligatorio** en producción; verificación HMAC `x-signature` opcional si `MERCADOPAGO_WEBHOOK_SIGNING_SECRET`. |
| Gestión de suscripción (coach dashboard) | 🔶 | 72% | `/coach/subscription`, processing, reactivate; `subscription_events`. |
| Control de acceso por plan | 🔶 | 75% | Límites por `max_clients`; `TIER_CAPABILITIES` alineado a política “mismas features, distinto cupo”. |

**Resultado del módulo: ~91% — 3 migraciones nuevas: `trialing`, `align_tiers_pricing_cycles`, `promote_all_coaches_to_scale`. Billing cycle validation mejorado. Listo para smoke sandbox MP en producción.**

---

## INFRAESTRUCTURA / COMPARTIDOS

| Componente | Estado | % | Notas |
|------------|--------|---|-------|
| `middleware.ts` | ✅ | 100% | Auth, branding por slug, client suspension, force password change, onboarding redirect |
| `CoachMainWrapper` | ✅ | 100% | `isBuilder` + ancho **2000px** en rutas `/coach/nutrition-plans/*` (alineado a builder) |
| `CoachSidebar` | ✅ | 100% | Navegación coach completa |
| `ClientNav` | 🔶 | 50% | Funcional — sin revisión post-rework del módulo cliente |
| `GlassCard` | ✅ | 100% | Base de cards del sistema |
| `ProgramPhasesBar` (shared) | ✅ | 100% | Usada en builder, perfil, biblioteca |
| `programWeekVariant.ts` | ✅ | 100% | Lógica A/B centralizada, 3+ módulos |
| `dashboard.service.ts` | ✅ | 100% | Attention Score, DirectoryPulse, 1RM |
| `supabase/server.ts` | ✅ | 100% | Client + AdminClient |
| `supabase/admin-raw.ts` | 🔶 | 50% | Untyped `any` service-role client para edge cases RLS |
| `supabase/queries/workout-programs-library.ts` | 🔶 | 50% | Existe pero select no unificado |
| UI primitives (shadcn) | ✅ | 100% | button, card, dialog, input, form, sheet, select, dropdown, alert-dialog, etc. |
| PWA / manifests | 🔶 | 55% | `sw.js` manual (`eva-pwa-cache-v1`), manifests dinámicos por coach, `PwaRegister`, `InstallPrompt`. Sin offline real, sin push notifications |
| i18n | 🔶 | 40% | `LanguageContext` + `en.json`/`es.json`. Implementado en landing pero no consistente en toda la app |
| Testing | 🔶 | 25% | Vitest: auth/register/clients actions, constants, Button, RLS (opcional), **webhook-authorization**, **coach-subscription-gate**, **subscription-state**. Playwright: `auth`, `workout-flow`, `checkin-flow`, `sprint3-register-pricing`, **payment-flow-mock** (opcional `E2E_PAYMENT_COACH_*`). |

---

## Resumen General

> Porcentajes revisados contra el código real (auditoría completa 2026-04-13). BUG-001 cerrado; tiers/pagos actualizados; nuevos gaps documentados.

| Módulo | % Completado |
|--------|-------------|
| Directorio de Clientes (coach) | 92% |
| Perfil del Alumno (coach) | 95% |
| Constructor de Planes | 95% |
| Biblioteca de Programas | 95% |
| Infraestructura / Shared | 80% |
| Módulo Nutrición Coach (núcleo) | ~93% |
| Dashboard Alumno | ~98% |
| Nutrición Alumno | ~97% |
| Workout Execution (alumno) | **84%** (BUG-001 cerrado 2026-04-13) |
| Check-in Alumno | **82%** (threshold 30d aplicado) |
| Catálogo Ejercicios Alumno | 68% |
| Onboarding Alumno | 58% |
| Login / Auth Alumno | 50% |
| Dashboard Coach Principal | **~70%** |
| Ejercicios Coach | **40%** |
| Mi Marca / Brand Settings | **~62%** |
| Landing / Marketing | **60%** |
| Pricing | **25%** |
| Registro Coach | **78%** |
| Login Coach | **40%** |
| Forgot/Reset Password | **40%** |
| **Pagos & Suscripciones** | **~91%** |
| **BD Alimentos** | **54 foods** (→ 250+ pendiente P1) |
| **Historial fecha coach** | **0%** (nuevo gap P1) |
| **Tabs optimización perfil** | **0%** (nuevo gap P2) |
| **Panel CEO / Superadmin** | **0%** |
| Templates | N/A (redirect) |
| Testing | ~28% |
| **TOTAL ESTIMADO** | **~75%** |

---

## Próximos Reworks (por prioridad)

### 🔴 Alta — P1 (Revenue-critical + core UX)
1. **Alineación Pricing/Landing** — unificar moneda (CLP) y oferta comercial final.
2. **Seed 250+ alimentos** — OpenFoodFacts/USDA offline, migración SQL idempotente. Unidades `g`+`un`.
3. **Simplificación unidades nutrición** — `g`+`un` en `FoodSearchDrawer`, `nutrition-utils`, `AddFoodSheet` + migración normalización.
4. **Historial por fecha en perfil del alumno** — `DayNavigator` en tabs Nutrición + Análisis. Nuevas queries `getClientNutritionForDate` + `getClientWorkoutForDate` en `actions.ts` del perfil.
5. **Smoke sandbox MercadoPago** — validar en producción con checklist BIZ-004.

### 🟠 Media — P2 (Core Loop)
6. **Workout Execution** (~84%) — optimistic updates completos, offline/retry, vibración nativa, batch logging.
7. **Check-in del alumno** (~82%) — campos de medidas corporales, notas libres, fotos extra (perfil lateral).
8. **Dashboard principal del coach** (~70%) — comparativas avanzadas, KPIs globales, tendencias (ENG-037+).
9. **Mi Marca** (~62%) — preview moderno (usa dashboard alumno real), crop de logo, más opciones de identidad.
10. **Tabs perfil alumno** — rename Entrenamiento→Análisis, Programa→Plan; quitar mini-logs de ProgramTabB7; reducir KPI card sidebar Overview.
11. **goal_weight** — columna en `clients`, línea target en `WeightProgressChart`.

### 🟡 Baja — P3 (Polish)
12. **Ejercicios Coach** (~40%) — upload GIF, bulk edit, organización por tags.
13. **Onboarding alumno** (~58%) — progress bar visual, foto inicial, validación por paso.
14. **Catálogo Ejercicios Alumno** (~68%) — favoritos, historial del ejercicio.
15. **Landing / Marketing** (~60%) — testimonios reales, SEO técnico.
16. **Login/Register Coach** (~40/78%) — rework visual, rate limiting, gate de pago.
17. **Panel CEO / Superadmin** — ruta secreta para supervisión global de la plataforma.

### 🔵 Futuro (sin urgencia acordada)
- **Extensión nutrición coach:** rework `/coach/meals`, `/coach/meal-groups`, `/coach/recipes`.
- **App móvil nativa** (Capacitor/React Native) si la PWA no alcanza.

### ⏳ Condicionado (calidad / seguridad)
- **QA E2E nutrición con RLS** (sesión alumno + coach, toggles, planes, `saved_meals`): ejecutar cuando **TOTAL ESTIMADO** sea **> ~90%**.
- **§12 QA manual dashboard alumno:** Lighthouse PWA, iOS/Android real, auditoría contraste.
- **Testing:** escalar de ~25% a cobertura razonable (crítico antes de monetización); añadir E2E pago con sandbox MP real opcional.

### ✅ Cerrado en esta iteración (referencia)
- **Nutrición alumno** `/c/[slug]/nutrition` + integración dashboard — completado 2026-04-09.
- **Núcleo nutrición coach** — hub, PlanBuilder, rutas, foods, migraciones RLS — completado 2026-04-09/10.
- **Workout execution rework** — A/B variant, progress bar, PRs summary, confetti, LogSetForm motion — completado 2026-04-10.
- **Check-in rework** — wizard 3 pasos, dual photos, loading.tsx, sticky header — completado 2026-04-10.
- **Revisión de porcentajes contra código real (2026-04-10):** auditoría completa de 225+ archivos, 24 tablas, 38 rutas. Múltiples módulos corregidos de 0% a sus valores reales.
- **Quick wins MAPA §7 (2026-04-11):** ver [`MAPA-MAESTRO.md`](MAPA-MAESTRO.md) sección 7 (tabla Hecho/Pendiente).
