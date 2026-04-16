# Estado del Proyecto — GymApp JP (EVA)

> Documento vivo. Actualizar cada vez que se cierre un rework, se agregue deuda técnica, o cambie la prioridad de algo pendiente.

### Biblia del proyecto (junto a [`ESTADO-COMPONENTES.md`](ESTADO-COMPONENTES.md))

- Ambos documentos deben mantenerse **al día con el trabajo del día** cuando haya cambios sustanciales.
- Incluir **fecha y hora** en **America/Santiago** en la línea **Última actualización** inferior (formato: `YYYY-MM-DD HH:mm`).

**Última actualización:** 2026-04-16 America/Santiago — **Sprint 9/10 — RLS, analytics dashboard coach, goal weight, dots DayNavigator, seguridad, build fix UTF-8, color system fix, modal responsive macros, 404 nav fix, emails legales.**

---

## Actualización incremental (Sprint 9/10 — 2026-04-15/16)

> Sesión 2026-04-15 (build + types) + Sesión completa 2026-04-16 (bugs + polish).

### Build fix — Encoding UTF-8 (2026-04-15)
- `src/lib/database.types.ts`: reescrito de **UTF-16 LE → UTF-8** (sin BOM). En entornos Linux (Vercel) el compilador TS no reconocía el archivo UTF-16 como módulo, causando `is not a module` en todos los imports de `@/lib/database.types`. Tras el fix `npx tsc --noEmit` sin errores.
- `database.types.ts`: añadidas columnas `video_start_time: number | null` y `video_end_time: number | null` en `Row`, `Insert` y `Update` de la tabla `exercises` (solo la tabla `exercises`, no los backups). Necesario para los parámetros `start`/`end` de YouTube en el catálogo.

### Bug fixes críticos (2026-04-16)
- **404 NUTRICION:** `CoachDashboardClient.tsx` — link `href="/coach/nutrition"` (ruta inexistente) → `href="/coach/nutrition-plans"` (ruta correcta).
- **Sistema de colores verde/azul:** `src/lib/brand-assets.ts` — nueva constante `SYSTEM_PRIMARY_COLOR = '#007AFF'`. `coach/layout.tsx` — cuando `use_brand_colors_coach === false`, ahora inyecta `SYSTEM_PRIMARY_COLOR` (#007AFF azul) en lugar de `BRAND_PRIMARY_COLOR` (#10B981 verde). Fallback de `hexToRgb` corregido a `'0, 122, 255'`. `middleware.ts` — ídem para la vista del alumno cuando el cliente desactiva colores del coach.
- **NutritionModal responsive:** `CoachDashboardClient.tsx` — Dialog `max-w-4xl` fijo → `w-[95vw] max-w-[95vw] sm:max-w-2xl md:max-w-4xl`. Grid macros `grid-cols-1 md:grid-cols-4` → `grid-cols-2 md:grid-cols-4`. Header per-client con `flex-wrap` y `min-w-0`. MacroItem simplificado a layout siempre vertical (sin `sm:flex-row` que causaba corte en tablets).
- **Emails legales:** `src/app/legal/page.tsx` y `src/app/privacidad/page.tsx` — `opcoach49@gmail.com` → `contacto@eva-app.cl`.

### Seguridad y API (Sesión 2 del ROAD-TO-100)
- **F1 ✅** `/api/internal/email-drip/run` — eliminado query param inseguro; ahora acepta exclusivamente `Authorization: Bearer DRIP_CRON_TOKEN`.
- **F2 ✅** `/api/recipes/search` — rate limiting Upstash 30 req/min (`ratelimit:recipes`), mismo patrón que auth y payments.

### Dashboard Coach Analytics (Sesión 2)
- `CoachDashboardClient.tsx` + `dashboard.queries.ts`:
  - **11.1 ✅** Stat card "MRR Estimado" con delta % vs mes anterior, calculado desde `subscription_events`.
  - **11.2 ✅** `AreaChart` "Sesiones 30 días" — sesiones únicas por día deduplicadas por `client+day`.
  - **11.3 ✅** `BarChart` "Crecimiento de Alumnos" — nuevos clientes por mes, últimos 6 meses.
  - **11.4 ✅** Activity feed — tipos check-in/workout/nuevo alumno, color coding, thumbnail foto check-in.
- `DashboardCharts.tsx` (componente nuevo en `src/components/coach/dashboard/`): encapsula los 2 charts recargables.

### Core Loop Features (Sesión 2)
- **06.4 ✅** Dots de actividad en `DayNavigator` — server actions `getClientWorkoutActivityDates` y `getClientNutritionActivityDates` en `actions.ts`; cargadas on-mount en `TrainingTabB4Panels` y `NutritionTabB5`.
- **09 ✅** Goal weight: migración `20260415120000_goal_weight_kg.sql` (columna `goal_weight_kg numeric` en `clients`); server action `updateClientGoalWeight`; input inline en Panel de Progreso; `<ReferenceLine>` amarilla dashed en `WeightProgressChart`.

### UX Polish (Sesión 2)
- **07.4 ✅** `ClientProfileDashboard.tsx` — KPI card sidebar: padding reducido (`p-4`), blur decorativo eliminado, "Racha Interact." duplicada removida.
- **12.2 ✅** `LogoUploadForm.tsx` — preview en tiempo real con `URL.createObjectURL` + limpieza en unmount.
- **B3 ✅** `/coach/subscription` — dark mode completo (cards, tabla, modal cancelación).
- **B4 ✅** `src/app/not-found.tsx` — página 404 personalizada con branding EVA (icono, mensaje, botón home).
- **B5 ✅** `aria-label` añadido en botones de ícono: sidebar coach, nav alumno, workout execution, exercise block.
- **Fix ✅** `subscription-status/route.ts` — ahora retorna `subscription_mp_id` y `superseded_mp_preapproval_id`.

### Performance (Sesión 2)
- `getFoodLibrary` y `getCoachFoodsCatalog` — reemplazado `SELECT *` por columnas específicas: `id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id`.

### Pagos — Webhook activación upgrade (Sesión 1)
- **P2.4 ✅** `src/app/api/payments/webhook/route.ts` — cuando un nuevo preapproval recibe evento `authorized`: cancela el preapproval anterior en MP (`cancelCheckoutAtProvider`), actualiza en BD `subscription_tier`, `billing_cycle`, `max_clients`, `subscription_mp_id`.
- **P2.6 ✅** Coach en status `canceled` que reactiva: `reactivate/` crea preapproval con `start_date = now + 60s` (no hereda fecha anterior).
- **04.1 ✅** `register/actions.ts` — slug generation con race-condition guard, redirect correcto con query params.
- **04.2 ✅** Processing page — si polling detecta `pending_payment` tras 5 min, muestra "Hubo un problema" + link a `/coach/reactivate`.
- **04.3 ✅** Middleware + `/coach/reactivate/` — status `bloqueado` redirige a reactivate con mensaje claro.
- **05.2 ✅** `/coach/subscription/page.tsx` — historial de pagos formateado en `es-CL`, monto y estado de cada `subscription_event`.

### RLS (Sesión 1)
- **Migración `20260414183000_superseded_preapproval_and_rls.sql`** — RLS habilitado en 24 tablas críticas con políticas de ownership coach → datos propios. **Pendiente: `supabase db push` por el usuario.**

### Cuentas de prueba (2026-04-16)
- Creadas 2 cuentas coach en Supabase con plan `pro` activo 1 mes:
  - `Joaquinamr7@gmail.com` → slug `joaquinamr7`, password `evaprueba123`
  - `robertocarrasco154@gmail.com` → slug `robertocarrasco154`, password `evaprueba123`

---

## Actualización incremental (Sprint 8 — Pagos hardening + Pricing clarity + UX)

> Trabajo del 2026-04-14 segunda sesión.

### Suscripción — Grace period en cancelación (TASK-P1)
- `src/app/api/payments/cancel-subscription/route.ts`: ya **no nullea** `current_period_end` al cancelar. El coach conserva la fecha.
- `src/lib/constants.ts`: `'canceled'` eliminado de `SUBSCRIPTION_BLOCKED_STATUSES`. El gate maneja el acceso por fecha.
- `src/lib/coach-subscription-gate.ts`: nueva función `hasEffectiveAccess(status, currentPeriodEnd)`. Si status es `'canceled'` y `current_period_end > now`, el acceso está permitido.
- `src/middleware.ts`: ahora fetcha y pasa `current_period_end` al gate.
- `src/lib/payments/subscription-state.ts`: `resolveCurrentPeriodEnd` preserva la fecha cuando status viene de cancelación.
- `src/app/coach/dashboard/CoachDashboardClient.tsx`: banner amarillo "Tu suscripción fue cancelada. Acceso hasta [fecha]." + banner azul countdown de trial.
- `src/app/coach/dashboard/_data/dashboard.queries.ts`: incluye `subscription_status`, `current_period_end`, `trial_ends_at` en la query.
- `src/app/coach/subscription/page.tsx`: dialog de cancelación muestra "conservarás acceso hasta el [fecha]".

### Upgrade/Downgrade — Transición limpia al fin del ciclo (TASK-P2)
- `src/lib/payments/types.ts`: `CreateCheckoutInput` acepta `startDate?: string`.
- `src/lib/payments/providers/mercadopago.ts`: usa `input.startDate` en `auto_recurring.start_date` cuando viene.
- `src/app/api/payments/create-preference/route.ts`: detecta upgrade mid-cycle (status `active` + `current_period_end` futuro), pasa `startDate = current_period_end` al provider, mantiene `subscription_status = 'active'` (el coach no pierde acceso).
- `src/app/coach/subscription/page.tsx`: modal de confirmación mostrando "Tu plan [X] continúa hasta [fecha]. El nuevo plan [Y] arranca esa fecha por $Z".

### Pricing más claro (TASK-P3)
- `src/app/pricing/page.tsx`: dos grupos visuales "Planes de entrenamiento (sin nutrición)" y "Planes completos con nutrición", separadores con badges de categoría, FAQs extendidos con respuestas sobre cambio de plan y cancelación con acceso, callout empresarial (`contacto@eva-app.cl`). Componente `PlanCard` extraído.
- `src/app/page.tsx`: callout empresarial en sección `#precios`.

### Register → Checkout UX (TASK-P4)
- `src/app/coach/subscription/processing/page.tsx`: muestra plan elegido (badge tier/ciclo), loading state claro con spinner, timeout 5 min con mensaje, botón "Reintentar" en fallos de checkout, botón "Verificar acceso" en timeout de polling.
- `src/app/(auth)/register/page.tsx`: paso 2 muestra badge de nutrición (verde/ámbar) y ciclo de facturación en cada opción de tier; paso 3 muestra tabla resumen (plan, facturación, nutrición sí/no, total).

### Otros (TASK-26.1 / TASK-06-07 verificados)
- `src/components/coach/CoachSidebar.tsx`: "Planes Nutricionales" → "Nutrición".
- **TASK-06** confirmado implementado: `DayNavigator` en `NutritionTabB5.tsx` y `TrainingTabB4Panels.tsx` (commit anterior `feat: implement nutrition and workout history by date for clients`).
- **TASK-07** confirmado implementado: tabs "Análisis" y "Plan" ya renombradas (commit anterior).

---

## Actualización incremental (Sprint 7 — análisis + bugs + road 100%)

> Nota: esta sección registra cambios recientes sin rehacer todavía la auditoría total 225+ archivos.

- **Bug fix crítico (2026-04-13 — BUG-001):**
  - `workout/[planId]/page.tsx`: query logs ahora filtra por fecha de hoy (timezone Santiago). Logs de semanas anteriores ya no se muestran como "completados esta semana".
  - `workout/[planId]/actions.ts`: upsert de logs ahora busca solo el log de HOY. Semanas anteriores se preservan como historial.
- **Bugs cerrados (2026-04-14):**
  - **BUG-002:** `FoodSearchDrawer` — `quantity` state cambiado a `string`; `onChange` guarda raw string, parse solo en preview y en `handleAdd`. Permite borrar y reescribir la cantidad sin que se pegue en 0.
  - **BUG-003:** `FoodSearchDrawer` — selector de unidad `<Select>` reemplazado por button toggle (g | un). Fix para el conflicto de portal Radix UI Select dentro de Sheet.
  - **BUG-004:** `dashboard.service.ts` — `SIN_EJERCICIO_7D` ahora solo se activa si `hasActiveWorkoutProgram: true`. Alumnos nuevos sin plan no generan alerta crítica.
  - **BUG-005:** `CoachOnboardingChecklist` — botón X para cerrar el card de onboarding. Estado `dismissed` persistido en localStorage (`eva:coach-onboarding:v1`). Render `null` cuando dismissed.
- **Tiers y pagos post-hardening (2026-04-11→13):**
  - 3 nuevas migraciones: `trialing` en `subscription_status`, `align_tiers_pricing_cycles`, `promote_all_coaches_to_scale`.
  - Billing cycle validation mejorado (`bbf98b4`).
  - Pagos → ~91%.
- **Hotfixes de sprint (2026-04-11→13):**
  - Check-in alerts threshold: 30 días (antes 7) — `8a992d3`.
  - `ClientCardV2` estilos accessibility finales — `3d33d7d`.
  - Workout plan handling refactor en dashboard — `ccf5fb6`.
- **Completado en sprint (movido de P1):**
  - Simplificación unidades nutrición: `g` + `un` implementado.
  - Seed 250+ alimentos globales + chilenos completado.
- **Próximo trabajo planificado (P1):**
  - Historial por fecha en perfil del alumno (tabs Nutrición + Análisis).
  - Optimización tabs: Entrenamiento→Análisis, Programa→Plan, KPI card Overview reducida.
  - Alinear `/pricing` de USD a CLP.

## Actualización incremental (Sprint 6 + hotfixes)

> Nota: esta sección registra cambios recientes sin rehacer todavía la auditoría total 225+ archivos.

- **Pagos / suscripción coach (2026-04-11):**
  - BD: `trialing` permitido en `coaches.subscription_status` (migración nueva).
  - Provider MP: `fetchCheckoutSnapshot`, `cancelCheckoutAtProvider` (cancel real en MP).
  - Webhook: token obligatorio en producción; HMAC `x-signature` opcional.
  - Tests Vitest + E2E mock de flujo processing (vars opcionales).
- **Dashboard coach (ENG-035/038/041):**
  - Refactor a patrón `_data/_components` en `src/app/coach/dashboard/`.
  - Alertas top 5 alumnos en riesgo (`attentionScore`) + quick actions visibles.
- **Mi Marca / Branding MVP (ENG-045/047/050 mínimo):**
  - Nuevo campo `coaches.welcome_message` + migración.
  - Form de branding actualizado y mensaje aplicado en login/dashboard del alumno.
- **Emails transaccionales (ENG-071/072/074):**
  - Templates en `src/lib/email/transactional-templates.ts`.
  - Hook de envío en alta de alumno y asignación de programa.
  - Evidencia y smoke en `docs/archive/RET-003-TRANSACTIONAL-EMAILS-SMOKE.md`.
- **Operación beta interna (post-sprint):**
  - Migración para subir coaches actuales a tier `scale` por 3 años.
  - Tiers ajustados para diferenciarse por límite de alumnos (no por features bloqueadas).
  - Metadata de íconos/favicons en rutas alumno corregida (`icon`, `shortcut`, `apple`).

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router, RSC, Server Actions) | 16.1.6 |
| React | React + React Compiler | 19.2.3 |
| Estilos | Tailwind CSS v4 (PostCSS, sin tailwind.config) | ^4 |
| UI Components | shadcn/ui + @base-ui/react + Radix primitives | — |
| Estado | useState/useReducer/useTransition/Context (sin Redux/Zustand) | — |
| Animación | Framer Motion + tw-animate-css | — |
| Formularios | react-hook-form + Zod v4 | ^4.3.6 |
| Backend | Supabase (Auth, DB, Storage, RLS) | — |
| Charts | Recharts + react-circular-progressbar + react-activity-calendar | — |
| DnD | @dnd-kit/core + sortable | — |
| Virtualización | @tanstack/react-virtual | — |
| Lottie | @lottiefiles/react-lottie-player | — |
| Confetti | canvas-confetti | — |
| Compresión img | browser-image-compression | — |
| i18n | Custom LanguageContext + JSON (es/en) | — |
| PWA | Manual sw.js + dynamic manifests (no next-pwa) | — |
| Testing | Vitest + Testing Library + Playwright | — |
| PDF | puppeteer (`devDependencies` — PrintProgramDialog) | — |

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
- `src/app/coach/workout-programs/components/` (4 componentes)
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
- `src/app/coach/clients/[clientId]/` — todos los tabs B3–B8 + utils
- `src/app/coach/clients/[clientId]/profileTrainingAnalytics.ts`

---

### Dashboard del Alumno — Rework Total (`jaunty-fluttering-spark`)
**Fecha:** 2026-04-09

**Qué se hizo:**
- Reescritura total de `page.tsx` — server component con Suspense por sección (9 boundaries independientes)
- Arquitectura nueva: `_data/` (React.cache), `_components/` (por dominio), `_actions/`
- `dashboard.queries.ts` — todas las queries cacheadas con timezone Santiago
- `heroComplianceBundle.ts` — bundle cacheado que calcula hero + 3 scores de compliance
- `DashboardShell` — grid responsive 1 col mobile / 2 cols desktop con sidebar sticky
- 30+ componentes: Header, Calendar, Hero, Compliance, Nutrition, Weight, PRs, Program, History, PullToRefresh
- E2E smoke test (Playwright, Chromium) OK
- `npm run build` OK

**Deuda residual (baja):**
- §12 QA manual: Lighthouse PWA, iOS/Android real, auditoría contraste
- `goal_weight` no existe en schema — sin línea target en `WeightProgressChart`

**Archivos clave:**
- `src/app/c/[coach_slug]/dashboard/` (page, _data, _components, _actions, loading)
- `src/lib/animation-presets.ts`, `src/lib/date-utils.ts`

---

### Rework Nutrición — Alumno + Coach (planes A–H + cierre hacia maestro)
**Fecha inicio núcleo:** 2026-04-09 · **Ampliaciones:** 2026-04-10

**Qué se hizo (resumen):**
- **Alumno** (`/c/[slug]/nutrition`): arquitectura `_data` / `_actions` / `_components`; `NutritionShell` con día navegable, macros reales, adherencia 30 días, streak; eliminado `NutritionTracker` monolítico.
- **Coach — hub**: `NutritionHub` (layout ancho 2000px), plantillas, alumnos SYNCED/CUSTOM, board enriquecido con sparklines 7d + kcal hoy, biblioteca alimentos con lista compacta.
- **Coach — PlanBuilder** y rutas `new` / `edit` / `client/[clientId]`; queries + actions unificadas.
- **Perfil coach** tab Nutrición (B5): datos reales — macros, adherencia, kcal, enlaces editor.
- **BD / Supabase:** migraciones versionadas en `supabase/migrations/`; historial y snapshots adicionales en `supabase/migrations_backup/`. Workflow: README + `docs/archive/SUPABASE-MIGRATION-WORKFLOW.md`.

**Archivos clave:**
- `src/app/c/[coach_slug]/nutrition/`, `src/app/coach/nutrition-plans/`, `src/app/coach/foods/`
- `src/components/coach/FoodListCompact.tsx`, `src/lib/nutrition-utils.ts`

---

### Rework Workout Execution + Check-in
**Fecha:** 2026-04-10

**Qué se hizo (workout):**
- `page.tsx` — `resolveActiveWeekVariantForDisplay`, query `exerciseMaxes` con exclusión de bloques del plan actual
- `WorkoutSummaryOverlay.tsx` reescrito: desglose por ejercicio, PRs con 1RM Epley, volumen por grupo muscular, confetti, `useReducedMotion`, animaciones stagger
- `WorkoutExecutionClient.tsx` — barra de progreso, badge Semana A/B, headers de sección, bloques completados con check, scroll al siguiente bloque, fechas relativas en historial
- `LogSetForm.tsx` — `motion` en fila y botón, slider RPE opcional post-log
- `actions.ts` — `revalidatePath` del perfil coach tras log exitoso

**Qué se hizo (check-in):**
- Migración `back_photo_url` en `check_ins` (aplicada vía MCP)
- `page.tsx` — título/metadata mensual, query directa `lastCheckIn`, header sticky + `pt-safe`
- `CheckInForm.tsx` — wizard 3 pasos con indicadores, compresión dual (front + back), animaciones direction-aware, `formatRelativeDate` en banner
- `actions.ts` — schema `back_photo`, upload a bucket `checkins` con path `-back-`, insert `back_photo_url`
- `loading.tsx` nuevo

**Verificación:** `npm run build` OK (Next.js 16.1.6 / Turbopack)

**Archivos clave:**
- `src/app/c/[coach_slug]/workout/[planId]/` (page, client, summary, logset, actions)
- `src/app/c/[coach_slug]/check-in/` (page, form, actions, loading)

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
- **Directorio alumnos:** vista **tabla** por defecto; tabla con scroll horizontal único; menús Base UI con `DropdownMenuGroup`; `modal={false}` en dropdowns.
- **PWA:** `PwaRegister` ajusta viewport en `standalone` (sin zoom); layout coach con `min-h-[100dvh]` en móvil.
- **Tarjetas:** menú "más opciones" con icono visible (`MoreHorizontal`).

---

## Deuda técnica pendiente

### Alta prioridad (bloquea monetización o producción)

#### ~~BUG-001: Workout weekly reset~~ *(cerrado 2026-04-13)*
El workout page cargaba TODOS los logs históricos de los `block_id` del plan, sin filtro de fecha. Al empezar una semana nueva, el alumno veía los sets de la semana anterior como "ya completados". Corregido en `page.tsx` (filtro `.gte/.lt` por fecha hoy) y `actions.ts` (upsert solo busca log de hoy).

---

#### Workflow de migraciones SQL (seguimiento)
La carpeta `supabase/migrations/` ya existe y se está usando en sprints recientes (incluye migraciones Sprint 5/6).  
**Trabajo pendiente:** mantener disciplina de versionado y asegurar que toda migración aplicada en producción quede commiteada en el mismo sprint.

---

#### Higiene de variables de entorno
`.env.example` en la raíz del repo (alineado con README y `process.env` usado en código).  
**Trabajo pendiente:** revisar trimestralmente variables huérfanas y alinear ejemplos con Vercel/GitHub Secrets activos.

---

#### ~~Auth callback error redirect~~ *(cerrado)*
`src/app/auth/callback/route.ts` redirige en error a `/login?error=auth_callback_failed` (ruta correcta para coach).

---

### Media prioridad

#### ~~Tabs del perfil del alumno: solapamiento Entrenamiento + Programa~~ *(cerrado Sprint 8)*
Tabs renombradas: "Entrenamiento" → "Análisis", "Programa" → "Plan". Mini-logs pendientes de quitar de `ProgramTabB7` (P2 menor).

---

#### KPI card "Métricas Clave" en Overview demasiado grande
La card sidebar en `ClientProfileDashboard.tsx` (~líneas 396-462) muestra solo 3 métricas (Peso Actual, Var. Semanal, Racha Interact.) con `p-6` y efectos decorativos. "Racha" aparece también en el grid de 6 KPIs de `ProfileOverviewB3.tsx`.
**Trabajo:** Reducir padding, eliminar blur decorativo, quitar "Racha Interact." (duplicado), dejar solo Peso Actual + Var. Semanal. P2.

---

#### ~~Vista de historial por fecha — coach no puede ver día específico~~ *(cerrado Sprint 8)*
`DayNavigator` ya implementado en `NutritionTabB5.tsx` y `TrainingTabB4Panels.tsx`. Queries `getClientNutritionForDate` + `getClientWorkoutForDate` en `actions.ts`. Pendiente: dots de actividad en el calendario.

---

#### ~~Inconsistencia de moneda Pricing vs Landing~~ *(cerrado Sprint 7)*
`/pricing` y landing usan CLP. Tiers alineados (5 planes, CLP, `TIER_CONFIG`).

---

#### ~~`sw.js` cache name~~ *(cerrado)*
`public/sw.js` usa `eva-pwa-cache-v1`.

---

#### Cobertura de tests mínima
Solo existe 1 unit test (`Button.test.tsx`) y 1 Playwright spec (`auth.spec.ts` — verifica títulos de landing y login). Vitest + Playwright están configurados pero sin cobertura real.
**Trabajo:** Escalar tests antes de monetización. Priorizar: server actions críticas (pagos, auth, logSet), flujos E2E (registro→login→workout→check-in), RLS validación.

---

#### ~~`puppeteer` en dependencies~~ *(cerrado)*
`puppeteer` está en `devDependencies`. **Opcional futuro:** alternativa ligera para PDF si se quiere evitar Chromium en entornos de build.

---

#### ~~`consumedCals` en tab Nutrición del perfil~~ *(cerrado 2026-04-09)*
Cerrado — kcal consumidas implementadas via `food_items` de comidas completadas.

---

#### ~~Unificar `LIBRARY_PROGRAM_LIST_SELECT`~~ *(cerrado)*
`page.tsx` de biblioteca e `actions.ts` del builder importan el mismo fragmento desde `src/lib/supabase/queries/workout-programs-library.ts`.

---

#### ~~`goal_weight` en tabla `clients` — línea target en chart de peso~~ *(cerrado 2026-04-16)*
Migración `20260415120000_goal_weight_kg.sql` aplicada. `WeightProgressChart` tiene `<ReferenceLine>` amarilla dashed. Input inline en Panel de Progreso del perfil.

---

#### ~~`ClientCard.tsx` V1~~ *(cerrado)*
Eliminado del repo; el directorio usa `ClientCardV2`.

---

### Baja prioridad / UX futura

#### `ProgramPhasesBar` en filas de biblioteca
Las filas solo tienen badge "Fases". Las cards antiguas mostraban la barra visual.

#### Ordenación y agrupación en biblioteca
El orden actual viene del servidor (`created_at DESC`). Opciones: nombre, última actividad, cliente. Agrupar plantillas vs en curso.

#### `useReducedMotion` en todos los child components del perfil
No aplicado en todos los componentes hijo del perfil (hovers de imágenes, animaciones internas de B3–B8).

#### ~~`font-outfit` en rutas alumno~~ *(cerrado)*
Títulos en login / change-password / exercises / suspended del alumno usan la clase `font-display` (Montserrat vía `--font-display` en tema).

#### ~~`admin-raw.ts` untyped client~~ *(cerrado 2026-04-16)*
`src/lib/supabase/admin-raw.ts` ya usa `SupabaseClient<Database>` correctamente — auditado en Sesión 2, sin cambios necesarios.

---

## Módulos pendientes de rework (próximos planes)

> Estado revisado contra código real 2026-04-13 (auditoría completa + sesión análisis).

| Módulo | Estado actual | % | Pendiente | Prioridad |
|--------|--------------|---|-----------|-----------|
| ~~**Nutrición (alumno + núcleo coach)**~~ | Completado | ~97% | — | **COMPLETADO** |
| ~~**Dashboard del alumno**~~ | Completado | ~98% | §12 QA manual | **COMPLETADO** |
| ~~**Workout execution rework**~~ | ~~Bug~~ corregido 2026-04-13 | ~84% | Optimistic updates, offline/retry | **BUG CERRADO** |
| ~~**Check-in rework**~~ | Rework abril 10 | ~82% | Medidas corporales, notas | **COMPLETADO (parcial)** |
| ~~**Historial fecha coach**~~ | Implementado 2026-04-14 | ~85% | Indicadores de días con actividad (dots) | **COMPLETADO** |
| ~~**Tabs perfil alumno**~~ | Renombradas (Análisis/Plan) | ~90% | Quitar mini-logs ProgramTabB7, KPI card fix | **COMPLETADO (parcial)** |
| **Pagos & Suscripciones** | Hardening Sprint 8 | ~96% | Smoke sandbox MP en prod, upgrade webhook confirmar | **CRÍTICA (revenue)** |
| **BD Alimentos** | 250+ alimentos seed | ~95% | — | **COMPLETADO** |
| ~~**Unidades nutrición**~~ | g+un implementado | ~95% | — | **COMPLETADO** |
| **Landing/Pricing** | Sprint 8 visual | ~75% | SEO técnico, testimonios reales, OG tags | Media |
| **Dashboard coach** | Sprint 6 + banners Sprint 8 | ~78% | Comparativas avanzadas (MRR, adherencia 30d) | Media |
| **Mi Marca / Settings** | MVP branding | ~62% | Preview moderno, branding extendido | Media |
| **Registro coach** | Sprint 8 UX mejorada | ~88% | Smoke test pago, verificación email | Alta |
| **Ejercicios coach** | Funcional básico | ~40% | Upload GIF, bulk edit | Baja |
| **Onboarding** | Multi-step con draft | ~58% | Progress bar, foto, validación | Baja |
| **Catálogo ejercicios alumno** | Funcional | ~68% | Favoritos, historial | Baja |
| **Login/Auth coach** | Funcional | ~40% | Rework visual, rate limiting | Baja |
| **Panel CEO / Superadmin** | Inexistente | 0% | Métricas globales | Baja |
| **Testing** | En progreso | ~28% | Cobertura razonable + E2E pago | Media-Alta |

---

## Notas de arquitectura

- **Colores por coach:** `--theme-primary` CSS var en `CoachLayout` y `ClientLayout`. Respetar en todos los charts y elementos de énfasis.
- **Dark mode primario:** Verificar variantes dark en todos los componentes nuevos. `ThemeProvider` default dark.
- **`GlassCard`:** Base de todas las cards del perfil y directorio. No crear cards custom sin revisar si aplica.
- **Safe area iOS:** Usar `env(safe-area-inset-top/bottom)` en fixed/sticky en mobile. En **coach móvil**, el **header superior** (`CoachSidebar`) lleva `pt-safe`; el contenedor del layout **no** debe duplicar `pt-safe`.
- **Variante A/B:** Lógica centralizada en `src/lib/workout/programWeekVariant.ts`. Semana impar del programa → A, par → B. Usada en builder, perfil, dashboard cliente, workout execution.
- **Arquitectura `_data/_actions/_components`:** Patrón establecido en dashboard alumno y nutrición. Seguir en nuevos módulos.
- **React.cache:** Usar para queries deduplicadas en RSC. Patrón establecido en dashboard queries.
- **24 tablas Supabase:** `coaches`, `clients`, `client_intake`, `client_payments`, `check_ins`, `exercises`, `workout_programs`, `workout_plans`, `workout_blocks`, `workout_logs`, `nutrition_plans`, `nutrition_plan_templates`, `nutrition_meals`, `food_items`, `foods`, `daily_nutrition_logs`, `nutrition_meal_logs`, `recipes`, `recipe_ingredients`, `saved_meals`, `saved_meal_items`, `template_meals`, `template_meal_groups`. 1 función RPC: `search_foods`.
- **PWA manual:** `public/sw.js` + manifests dinámicos por coach (`/api/manifest/[coach_slug]` + `/c/[slug]/manifest.webmanifest`). No usa next-pwa.
- **i18n parcial:** `LanguageContext` con `es.json`/`en.json`. Implementado en landing, no consistente en toda la app.
