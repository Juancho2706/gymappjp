# Arquitectura de Componentes — GymApp JP (EVA)

> Diagrama de jerarquía y comunicación entre componentes principales.
> **Última actualización:** 2026-04-14 America/Santiago — 4 bugs cerrados: BUG-002 (`FoodSearchDrawer` quantity→string), BUG-003 (`FoodSearchDrawer` unit Select→button toggle, fix portal Radix+Sheet), BUG-004 (`dashboard.service.ts` `hasActiveWorkoutProgram` guard para `SIN_EJERCICIO_7D`), BUG-005 (`CoachOnboardingChecklist` dismiss + X button + localStorage).

---

## Cambios recientes (delta)

### Sprint 8 — 2026-04-14 (Pagos hardening + Pricing clarity)

- **Grace period cancelación:** `cancel-subscription/route.ts` ya no nullea `current_period_end`. `'canceled'` fuera de `SUBSCRIPTION_BLOCKED_STATUSES`. `coach-subscription-gate.ts` → nueva `hasEffectiveAccess(status, periodEnd)`. `middleware.ts` → pasa `current_period_end` al gate. `subscription-state.ts` → preserva fecha al cancelar. Dashboard → banners amarillo/azul para cancelado-con-acceso y trial.
- **Upgrade/downgrade mid-cycle:** `types.ts` → `CreateCheckoutInput.startDate?`. `mercadopago.ts` → usa `input.startDate` si viene. `create-preference/route.ts` → detecta coach activo con período futuro, pasa `startDate = current_period_end`, mantiene `status='active'`. `subscription/page.tsx` → modal de confirmación con "plan X hasta [fecha], plan Y desde [fecha] por $Z".
- **Pricing:** `pricing/page.tsx` → dos grupos visuales "sin nutrición" (starter_lite, starter) y "con nutrición" (pro, elite, scale) con separadores y badges de categoría. FAQs extendidos. Callout empresarial. Componente `PlanCard` extraído.
- **Landing:** `page.tsx` → callout empresarial `contacto@eva-app.cl` en sección `#precios`.
- **Register UX:** `processing/page.tsx` → badge plan elegido, timeout 5 min, reintentar. `register/page.tsx` → paso 2 con badges nutrición/ciclo por tier, paso 3 tabla resumen.
- **Sidebar:** `CoachSidebar.tsx` → "Planes Nutricionales" → "Nutrición".
- **Historial fecha coach:** Confirmado implementado — `NutritionTabB5.tsx` y `TrainingTabB4Panels.tsx` tienen `DayNavigator`.
- **Tabs perfil:** Confirmado implementado — "Análisis" y "Plan" renombradas.

### Sprint 7 — 2026-04-14 (Bugs + Branding + Datos)

- **BUG-002/003 cerrados:** `FoodSearchDrawer.tsx` — `quantity` state → `string`; unit `<Select>` → button toggle `g | un`.
- **BUG-004 cerrado:** `dashboard.service.ts` — `SIN_EJERCICIO_7D` solo con `hasActiveWorkoutProgram`.
- **BUG-005 cerrado:** `CoachOnboardingChecklist.tsx` — dismiss + localStorage.
- **BUG-001 cerrado (2026-04-13):** `workout/[planId]/page.tsx` — filtro logs por HOY.
- **Tiers/Pagos (2026-04-11→13):** 3 migraciones: `trialing`, `align_tiers_pricing_cycles`, `promote_all_coaches_to_scale`.
- **Branding EVA por defecto:** `brand-assets.ts` (`BRAND_PRIMARY_COLOR`), middleware fallback logo/color, `ClientNav`, layouts, `LogoUploadForm`.
- **Pagos:** `fetchCheckoutSnapshot`, `cancelCheckoutAtProvider`; webhook HMAC opcional.
- **Dashboard coach:** `_components/DashboardContent.tsx` + `_data/dashboard.queries.ts`.
- **Emails transaccionales:** `src/lib/email/transactional-templates.ts`.
- **Favicon/íconos alumno:** metadata `icon` + `shortcut` + `apple`.

---

## 1. Estructura General de Rutas

```
src/app/
├── layout.tsx                         # Root: fonts, ThemeProvider, i18n, PWA, metadata
├── page.tsx                           # Landing page (972 líneas, i18n, CLP pricing)
├── error.tsx / global-error.tsx       # Error boundaries
├── globals.css                        # Tailwind v4 @theme + design tokens
│
├── (auth)/                            # Grupo auth coach
│   ├── layout.tsx                     # Layout centrado, logo, ThemeToggle
│   ├── login/                         # Login coach → /coach/dashboard
│   ├── register/                      # Registro coach (Admin API, slug)
│   ├── forgot-password/               # Email reset
│   └── reset-password/                # Cambio de contraseña
│
├── auth/callback/                     # Supabase auth callback (code exchange)
│
├── api/
│   ├── manifest/default/              # PWA manifest genérico EVA
│   ├── manifest/[coach_slug]/         # PWA manifest por coach (DB-backed)
│   ├── coach/onboarding-events/       # Tracking onboarding coach (Sprint 5)
│   ├── internal/email-drip/run/       # Cron drip email (Sprint 5)
│   ├── ops/beta-health/               # Health endpoint operativo beta
│   └── recipes/search/                # API búsqueda recetas
│
├── pricing/                           # Página pricing estática (USD — pendiente alinear)
├── legal/                             # Términos y condiciones
├── privacidad/                        # Política de privacidad
│
├── coach/                             # Rutas del coach (protegidas por middleware)
│   ├── layout.tsx                     # getCoach(), sidebar, brand CSS vars
│   ├── dashboard/                     # Dashboard principal (~45%)
│   ├── clients/                       # Directorio (~90%)
│   │   └── [clientId]/                # Perfil individual (~95%)
│   ├── builder/[clientId]/            # Constructor de planes (~95%)
│   ├── workout-programs/              # Biblioteca de programas (~95%)
│   │   └── builder/                   # Builder para templates (sin clientId)
│   ├── nutrition-plans/               # Hub nutrición (~93%)
│   │   ├── new/                       # Crear template
│   │   ├── [templateId]/edit/         # Editar template
│   │   └── client/[clientId]/         # Plan por alumno
│   ├── foods/                         # Biblioteca alimentos (~95%)
│   ├── exercises/                     # Catálogo ejercicios (~40%)
│   ├── templates/                     # Redirect → workout-programs
│   ├── settings/                      # Mi Marca (~35%)
│   │   └── preview/                   # Preview alumno
│   ├── nutrition-builder/[clientId]/  # Redirect legacy → nutrition-plans/client/...
│   ├── meals/                         # Comidas (futuro)
│   ├── meal-groups/                   # Grupos de comidas (futuro)
│   └── recipes/                       # Recetas (futuro)
│       └── [recipeId]/
│
└── c/[coach_slug]/                    # Rutas white-label del alumno
    ├── layout.tsx                     # Branding via headers, --theme-primary, ClientNav
    ├── page.tsx                       # Auth gate: logged-in → dashboard, else → login
    ├── actions.ts                     # toggleClientBrandColors
    ├── manifest.webmanifest/          # Dynamic PWA manifest por coach
    ├── login/                         # Login alumno (branded)
    ├── onboarding/                    # Multi-step intake (~58%)
    ├── dashboard/                     # Dashboard completo (~98%)
    │   ├── _data/                     # React.cache queries
    │   ├── _components/               # 30+ componentes por dominio
    │   └── _actions/                  # Server actions
    ├── workout/[planId]/              # Ejecución entrenamiento (~82%)
    ├── check-in/                      # Check-in 3 pasos (~80%)
    ├── nutrition/                     # Plan nutrición alumno (~96%)
    │   ├── _data/
    │   ├── _components/
    │   └── _actions/
    ├── exercises/                     # Catálogo ejercicios (~68%)
    ├── change-password/               # Cambio contraseña forzado
    └── suspended/                     # Pantalla de suspensión
```

---

## 2. Flujo de Autenticación y Middleware

```
Request
└── middleware.ts (src/middleware.ts)
    │
    ├── /coach/* → verifica sesión + registro en tabla coaches
    │              → si no auth → /login
    │              → si no coach row → /login
    │
    ├── /c/[slug]/* → carga coach por slug desde BD
    │   ├── Sets headers: x-coach-id, x-coach-brand-name,
    │   │                 x-coach-primary-color, x-coach-logo-url,
    │   │                 x-client-use-brand-colors
    │   ├── /c/[slug]/login → si ya logueado como client → dashboard
    │   ├── /c/[slug]/* (non-login) →
    │   │   ├── verifica auth + client row para ese coach
    │   │   ├── client.is_active === false → /c/[slug]/suspended
    │   │   ├── force_password_change → /c/[slug]/change-password
    │   │   └── !onboarding_completed → /c/[slug]/onboarding
    │   └── Redirige a /c/[slug]/login si no autenticado
    │
    ├── / (root) con user →
    │   ├── coach → /coach/dashboard
    │   └── client → /c/{coach.slug}/dashboard
    │
    └── Auth pages (/login, /register, /forgot-password) →
        └── si es coach → /coach/dashboard
```

**Clientes Supabase:**
- `createClient()` — cliente server-side con cookies (rutas normales)
- `createAdminClient()` — service_role key (operaciones admin: crear/borrar usuarios auth)
- `createRawAdminClient()` — untyped service_role para edge cases RLS

---

## 3. Coach — Dashboard (`/coach/dashboard`)

```
page.tsx (Server Component)
├── Suspense → DashboardSkeleton
└── DashboardContent (Server, _components/)
    ├── getCoachDashboardData(userId) (_data/dashboard.queries.ts)
    │   ├── Promise.all: counts + actividad + programas + growth + pulse
    │   ├── mapDirectoryPulseToAdherenceStats / NutritionStats
    │   ├── topRiskClients (attentionScore desc, top 5)
    │   └── datasets area/bar + KPIs agregados
    └── CoachDashboardClient (Client)
        ├── Quick actions: registrar alumno / programas / nutrición
        ├── Alertas críticas: riesgo + programas por vencer
        ├── Stat cards + modales adherence/nutrition
        ├── Activity feed reciente
        └── Charts crecimiento + check-ins
```

---

## 4. Coach — Directorio de Clientes (`/coach/clients`)

```
page.tsx (Server Component)
├── Queries: clients + workout_programs, getCachedDirectoryPulse()
└── CoachClientsShell (Client)
    ├── useState: riskFilter
    ├── CoachWarRoom
    │   └── Props: pulseData, riskFilter, onFilterChange
    │   └── Stat cards + alerta banners por attention score
    └── ClientsDirectoryClient
        ├── Props: clients[], riskFilter
        ├── DirectoryActionBar (búsqueda, filtros, sort, grid/tabla)
        ├── ClientsDirectoryTable (virtualizable, ordenable)
        ├── ClientCardV2 (grid view)
        └── Modals/Actions:
            ├── CreateClientModal → createClientAction()
            ├── Reset password → resetClientPasswordAction()
            ├── Toggle status → toggleClientStatusAction()
            └── Delete → deleteClientAction()
```

**Server Actions (`actions.ts`):**

| Acción | Operación |
|--------|-----------|
| `createClientAction` | Admin API: crea auth user + registro en `clients` |
| `deleteClientAction` | Elimina cascada auth → public.clients |
| `resetClientPasswordAction` | Admin API: genera password temporal |
| `toggleClientStatusAction` | UPDATE `clients.is_active` |

**Servicio de riesgo (`dashboard.service.ts`):**
```
getCachedDirectoryPulse(coachId)
└── calculateAttentionScore(clientData)
    ├── Check-in hace 7+ días → flag
    ├── Adherencia < 50% o < 70% → flag
    ├── Riesgo nutricional < 60% → flag
    ├── Programa por vencer → flag
    └── Caída de fuerza → flag
```

---

## 5. Coach — Perfil del Cliente (`/coach/clients/[clientId]`)

```
page.tsx (Server Component, Suspense boundary)
└── ProfileContent (Server, llama getClientProfileData())
    └── ClientProfileDashboard (Client)
        ├── useState: activeTab
        ├── useTransition: pendingStates
        ├── ClientProfileHero
        ├── ProfileTabNav (sticky, badges, spring indicator)
        └── Tab Panels:
            ├── [overview]   → ProfileOverviewB3
            ├── [training]   → TrainingTabB4Panels
            ├── [nutrition]  → NutritionTabB5
            ├── [progress]   → ProgressBodyCompositionB6
            ├── [program]    → ProgramTabB7 → link /coach/builder/[clientId]
            └── [billing]    → BillingTabB8
```

**`getClientProfileData(clientId)` — fetch paralelo:**
```
Promise.all([
  clients (+ client_intake)
  workout_programs activos (+ plans → blocks → exercises)
  nutrition_plans activos
  check_ins (ordenados por fecha)
  workout_plans (todos, para historial) (+ blocks → workout_logs)
  client_payments
  daily_nutrition_logs (+ nutrition_meal_logs)
  RPC: get_client_current_streak()
])
```

---

## 6. Coach — Constructor de Planes (`/coach/builder/[clientId]`)

```
page.tsx (Server Component)
├── Verifica que el cliente pertenece al coach
├── Fetch: exercises (globales + del coach)
├── Fetch opcional: programa template si ?programId en query
└── WeeklyPlanBuilder (Client)
    ├── Hook: usePlanBuilder() — toda la lógica de estado
    │   ├── Estructura de días (Lun-Dom)
    │   ├── Drag & drop (@dnd-kit)
    │   ├── Undo/Redo stack
    │   └── Cálculo de balance muscular
    ├── ProgramConfigHeader
    ├── ProgramPhasesBar
    ├── DraggableExerciseCatalog (sidebar / bottom sheet mobile)
    ├── DndContext → Days grid → DayColumn → ExerciseBlock → BlockEditSheet
    ├── MuscleBalancePanel (sidebar der.)
    ├── TemplatePickerDialog → syncProgramFromTemplateAction()
    ├── AssignToClientsDialog → assignProgramToClientsAction()
    ├── PrintProgramDialog (export PDF via puppeteer)
    └── Guardar → saveWorkoutProgramAction(payload)
```

---

## 7. Coach — Nutrición Hub (`/coach/nutrition-plans`)

```
page.tsx (Server Component)
├── Fetch: templates, active plans board data, clients, food library
├── Suspense → loading.tsx
└── NutritionHub (Client, layout ancho 2000px)
    ├── Tabs:
    │   ├── TemplateLibrary (CRUD templates, AssignModal)
    │   ├── ActivePlansBoard (sparkline 7d + kcal hoy por alumno)
    │   └── FoodLibrary (FoodListCompact, AddFoodSheet)
    └── SuccessWaveOverlay

Rutas anidadas:
├── /new → PlanBuilder (nueva template)
├── /[templateId]/edit → PlanBuilder (editar template)
└── /client/[clientId] → PlanBuilder (plan personalizado)

PlanBuilder:
├── PlanBuilderSidebar (info plan, macros)
├── MealCanvas → MealBlock → FoodItemRow
├── FoodSearchDrawer (RPC search_foods)
├── MacroCalculator
└── Guardar → nutrition-coach.actions.ts

Actions (nutrition-coach.actions.ts):
├── saveNutritionTemplate / saveClientPlan
├── assignNutritionPlan / unassignNutritionPlan
├── deleteTemplate / duplicateTemplate
├── addCustomFood
└── food-library.actions.ts (CRUD foods)
```

---

## 8. Cliente — Dashboard (`/c/[coach_slug]/dashboard`)

```
page.tsx (Server Component — 9 Suspense boundaries)
├── _data/dashboard.queries.ts (React.cache, timezone Santiago)
├── _data/heroComplianceBundle.ts (hero + compliance scores)
├── _actions/dashboard.actions.ts (quickLogWeightAction)
└── Render:
    ├── DashboardPullToRefresh
    └── DashboardShell (grid 2 cols desktop)
        ├── Main Column:
        │   ├── DashboardHeader + ClientGreeting + StreakWidget
        │   ├── WeekCalendar + CalendarDay (variante A/B)
        │   ├── CheckInBanner (urgente/warning/normal)
        │   ├── HeroAndComplianceGroup
        │   │   ├── HeroSection → WorkoutHeroCard / RestDayCard
        │   │   ├── QuickLogSheet (log set sin navegar)
        │   │   └── ComplianceScoresCard + ComplianceRing (×3)
        │   ├── ActiveProgramSection + WorkoutPlanCard
        │   └── RecentWorkoutsSection + WorkoutLogItem
        └── Sidebar (sticky):
            ├── NutritionDailySummary + MacroBar + MealCompletionRow
            ├── WeightWidget + WeightSparkline + WeightQuickLog
            ├── PersonalRecordsBanner + PRBadge
            └── WeightFullChartSection (WeightProgressChart)
```

---

## 9. Cliente — Ejecución de Entrenamiento (`/c/[coach_slug]/workout/[planId]`)

```
page.tsx (Server Component)
├── Fetch: plan → blocks → exercises (con secciones warmup/main/cooldown)
├── Verifica: plan pertenece al cliente + programa activo
├── resolveActiveWeekVariantForDisplay (A/B)
├── Fetch: workout_logs del plan (completados)
├── Fetch: exerciseMaxes (históricos para PRs, excluye plan actual)
└── WorkoutTimerProvider (Client Context)
    ├── Expone: useWorkoutTimer() → startRest(timeStr)
    ├── RestTimer (modal flotante)
    │   ├── Audio (playTimerSound, selector tipo/volumen)
    │   ├── WorkoutTimerSettingsPanel
    │   └── rest-timer-preferences.ts (localStorage)
    └── WorkoutExecutionClient (Client, ~600+ líneas)
        ├── Header: back, título, badge Semana A/B, ThemeToggle
        ├── Progress bar (sets completados / total)
        ├── Secciones: warmup | main | cooldown
        │   └── Por bloque:
        │       ├── Modal video/GIF
        │       ├── Info objetivo (peso, reps, RPE)
        │       ├── Historial previo (fechas relativas)
        │       ├── LogSetForm (×sets)
        │       │   ├── Inputs: weight_kg, reps_done
        │       │   ├── Slider RPE (post-log, opcional)
        │       │   ├── motion en fila + botón
        │       │   └── onSubmit → logSetAction(formData)
        │       └── Botón rest → startRest() (via context)
        └── WorkoutSummaryOverlay (al completar)
            ├── Desglose por ejercicio
            ├── PRs del día (1RM Epley)
            ├── Volumen por grupo muscular
            ├── Confetti + useReducedMotion
            └── Link al dashboard
```

---

## 10. Cliente — Check-in (`/c/[coach_slug]/check-in`)

```
page.tsx (Server Component)
├── Auth + coach branding
├── Query: lastCheckIn (peso, energía, fecha)
├── Header sticky + pt-safe
└── CheckInForm (Client, wizard 3 pasos)
    ├── Paso 1: Peso + Nivel de energía (slider)
    │   └── Banner último check-in (formatRelativeDate)
    ├── Paso 2: Foto frontal (compresión browser-image-compression)
    ├── Paso 3: Foto espalda (compresión, preview)
    ├── AnimatePresence direction-aware entre pasos
    ├── Indicadores de paso
    └── Submit → submitCheckinAction()
        ├── Zod validation (front_photo + back_photo)
        ├── Upload a bucket 'checkins' (2 archivos: -front-, -back-)
        ├── INSERT check_ins (weight, energy_level, front/back_photo_url)
        └── revalidatePath del perfil coach
```

---

## 11. Cliente — Nutrición (`/c/[coach_slug]/nutrition`)

```
page.tsx (Server Component)
├── _data/nutrition.queries.ts
│   ├── getActiveNutritionPlan (plan + meals + food_items + foods)
│   ├── getTodayLog (daily_nutrition_logs + nutrition_meal_logs)
│   └── getAdherenceData (30 días, timezone Santiago)
├── Si no hay plan → EmptyNutritionState
└── NutritionShell (Client)
    ├── useOptimistic (toggle comidas)
    ├── DayNavigator (navegación por fecha)
    ├── MacroRingSummary (3 anillos: proteína, carbs, grasas)
    ├── MealCard (×comidas del plan)
    │   ├── MealIngredientRow (por food_item)
    │   └── Toggle completar → toggleMealAction()
    ├── AdherenceStrip (30 días)
    └── NutritionStreakBanner
```

---

## 12. Patrones de Comunicación

### Server → Client
```
Server Component (fetch data via Supabase)
    └──props──→ Client Component
```
Los server components obtienen datos y los pasan como props. No hay fetch del lado cliente salvo `fetchLogForDate` en nutrición (navegación de día).

### Client → Server
```
Client Component
    └──call──→ Server Action (actions.ts)
                └── Supabase query / mutation
                └── revalidatePath() → re-render server
```

### Estado del cliente
```
useState / useReducer      → estado local de UI
useTransition              → pending states para acciones
useActionState             → formularios con server actions
useOptimistic              → optimistic updates (nutrición)
Custom hooks               → usePlanBuilder, useWorkoutTimer
React Context              → WorkoutTimerProvider
```
No se usa Redux, Zustand ni otro state manager externo.

### Validación
```
Client: react-hook-form + zod schemas
Server: re-validación en server actions + Zod v4
```

### Patrón de arquitectura por módulo (establecido)
```
module/
├── page.tsx              # Server component (RSC)
├── loading.tsx           # Streaming skeleton
├── actions.ts            # Server actions
├── _data/                # React.cache queries (si complejo)
│   └── module.queries.ts
├── _actions/             # Server actions (si complejo)
│   └── module.actions.ts
└── _components/          # Client components por dominio
    ├── domain1/
    └── domain2/
```

---

## 13. Modelo de Datos Completo (24 tablas)

### Diagrama de relaciones

```
coaches ──┬──→ clients ──┬──→ check_ins
          │              ├──→ client_intake (1:1)
          │              ├──→ client_payments ←── coaches
          │              ├──→ workout_programs (self-ref: source_template_id)
          │              │       └──→ workout_plans
          │              │              └──→ workout_blocks
          │              │                     ├──→ exercises ←── coaches
          │              │                     └──→ workout_logs ←── clients
          │              ├──→ nutrition_plans ←── coaches
          │              │       ├──→ nutrition_meals
          │              │       │       └──→ food_items
          │              │       │              └──→ foods ←── coaches
          │              │       └──→ daily_nutrition_logs
          │              │              └──→ nutrition_meal_logs
          │              │                     └──→ nutrition_meals
          │              └──→ workout_plans ←── coaches
          │
          ├──→ exercises (coach_id null = global)
          ├──→ foods (coach_id null = global)
          ├──→ recipes
          │       └──→ recipe_ingredients ──→ foods
          ├──→ nutrition_plan_templates
          │       └──→ template_meals
          │              └──→ template_meal_groups ──→ saved_meals
          └──→ saved_meals
                 └──→ saved_meal_items ──→ foods
```

### Tablas — detalle de columnas

**Autenticación y usuarios:**

| Tabla | Columnas clave |
|-------|---------------|
| `coaches` | id, slug, brand_name, full_name, primary_color, logo_url, use_brand_colors_coach, subscription_tier, subscription_status, subscription_mp_id, trial_ends_at, trial_used_email |
| `clients` | id (FK auth.users), coach_id, email, full_name, phone, is_active, onboarding_completed, force_password_change, subscription_start_date, use_coach_brand_colors |
| `client_intake` | id, client_id (1:1), weight_kg, height_cm, experience_level, goals, availability, injuries, medical_conditions |

**Entrenamiento:**

| Tabla | Columnas clave |
|-------|---------------|
| `workout_programs` | id, coach_id, client_id, name, is_active, weeks_to_repeat, program_structure_type (weekly/cycle), program_phases (JSON), ab_mode, cycle_length, duration_type, duration_days, start_date, end_date, start_date_flexible, program_notes, source_template_id (self-ref) |
| `workout_plans` | id, coach_id, client_id, program_id, title, day_of_week, group_name, assigned_date, week_variant (A/B) |
| `workout_blocks` | id, plan_id, exercise_id, section (warmup/main/cooldown), order_index, sets, reps, target_weight_kg, rir, rest_time, tempo, notes, superset_group, is_override, progression_type, progression_value |
| `exercises` | id, coach_id (null=global), name, muscle_group, body_part, equipment, gif_url, video_url, video_start_time, video_end_time, instructions[], secondary_muscles[] |
| `workout_logs` | id, client_id, block_id, set_number, reps_done, weight_kg, rpe, plan_name_at_log, logged_at |

**Nutrición:**

| Tabla | Columnas clave |
|-------|---------------|
| `nutrition_plans` | id, client_id, coach_id, name, is_active, is_custom, template_id, template_version_id, daily_calories, protein_g, carbs_g, fats_g, instructions |
| `nutrition_plan_templates` | id, coach_id, name, description, goal_type, daily_calories, protein/carbs/fats_g, instructions, tags[], is_favorite |
| `nutrition_meals` | id, plan_id, name, description, order_index |
| `food_items` | id, meal_id, food_id, quantity, unit |
| `foods` | id, coach_id (null=global), name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category |
| `daily_nutrition_logs` | id, client_id, plan_id, log_date, plan_name_at_log, target_calories/protein/carbs/fats_at_log |
| `nutrition_meal_logs` | id, daily_log_id, meal_id, is_completed |
| `template_meals` | id, template_id, name, order_index |
| `template_meal_groups` | id, template_meal_id, saved_meal_id, order_index |
| `saved_meals` | id, coach_id, name |
| `saved_meal_items` | id, saved_meal_id, food_id, quantity, unit |
| `recipes` | id, coach_id, name, description, instructions, image_url, prep_time_minutes, macros, source_api/id |
| `recipe_ingredients` | id, recipe_id, food_id, name, quantity, unit |

**Seguimiento y pagos:**

| Tabla | Columnas clave |
|-------|---------------|
| `check_ins` | id, client_id, date, weight, energy_level, front_photo_url, back_photo_url, notes |
| `client_payments` | id, client_id, coach_id, amount, payment_date, period_months, service_description, status, receipt_image_url |

**Funciones RPC:**
- `search_foods(search_term text)` → retorna rows con shape de `foods`

---

## 14. PWA Architecture

```
Root layout → manifest: '/api/manifest/default'
Coach client layout → manifest: '/c/[slug]/manifest.webmanifest'

Manifests:
├── /api/manifest/default/route.ts    → JSON estático EVA
├── /api/manifest/[coach_slug]/route.ts → DB: nombre, colores, iconos del coach
└── /c/[slug]/manifest.webmanifest/route.ts → similar, typed, caching headers

Service Worker (public/sw.js):
├── Cache: `eva-pwa-cache-v1`
├── Precache: /, offline fallback
├── Fetch: skip Supabase, /_next/, /api/, /coach, /c/
└── Sin offline real, sin push notifications

Client components:
├── PwaRegister.tsx → registra sw.js, ajusta viewport en standalone
├── InstallPrompt.tsx → beforeinstallprompt + instrucciones iOS
└── PwaNavButton.tsx → install prompt handling en nav
```

---

## 15. Flujos End-to-End Principales

### Coach crea y asigna un programa
```
1. Coach abre /coach/builder/[clientId]
2. Arrastra ejercicios → usePlanBuilder actualiza estado local
3. Configura bloques en BlockEditSheet
4. Clic "Guardar" → saveWorkoutProgramAction()
   → UPSERT workout_programs → plans → blocks
5. Opcional: AssignToClientsDialog → assignProgramToClientsAction()
```

### Coach crea plan de nutrición
```
1. Coach abre /coach/nutrition-plans → NutritionHub
2. Crea template: /new → PlanBuilder
3. Arrastra alimentos → MealBlock → FoodItemRow
4. Guardar → saveNutritionTemplate()
5. Asignar a alumno: AssignModal → assignNutritionPlan()
   → INSERT nutrition_plans (is_custom=false, template_id)
   → INSERT nutrition_meals + food_items (copia del template)
```

### Cliente ejecuta entrenamiento
```
1. Cliente ve /c/[slug]/dashboard → WorkoutHeroCard
2. Clic → navega a /c/[slug]/workout/[planId]
3. Server: plan + historial + exerciseMaxes + variante A/B
4. Cliente completa sets → LogSetForm → logSetAction()
   → UPSERT workout_logs → revalidatePath (cliente + perfil coach)
5. Al completar → WorkoutSummaryOverlay (PRs, volumen, confetti)
```

### Cliente hace check-in
```
1. Dashboard muestra CheckInBanner (urgente si >7 días)
2. Navega a /c/[slug]/check-in
3. Wizard: paso 1 (peso+energía) → paso 2 (foto frontal) → paso 3 (foto espalda)
4. Submit → submitCheckinAction()
   → Upload 2 fotos a Storage bucket 'checkins'
   → INSERT check_ins (weight, energy, front/back_photo_url)
   → revalidatePath perfil coach
```

### Coach revisa progreso del cliente
```
1. Coach abre /coach/clients/[clientId] → tab elegido
2. getClientProfileData() carga todo en paralelo
3. Coach ve adherencia, historial pesos, fotos progreso, PRs
4. Si quiere editar programa → tab "Program" → "Editar" → /coach/builder/[clientId]
```

### Coach registra nuevo alumno
```
1. Coach abre directorio → CreateClientModal
2. createClientAction():
   → Admin API: auth.admin.createUser (email_confirm: true)
   → INSERT clients (coach_id, force_password_change: true)
3. Alumno recibe email → /c/[slug]/login
4. force_password_change → /c/[slug]/change-password
5. !onboarding_completed → /c/[slug]/onboarding
6. Completa → /c/[slug]/dashboard
```

---

## 16. Historial por Fecha — Coach ve día específico del alumno (PENDIENTE P1)

### Gap actual

El coach no puede ver qué comió o qué entrenó un alumno en un día específico del pasado. Solo tiene gráficos de tendencia y métricas agregadas.

### Infraestructura existente (solo falta UI del coach)

- `daily_nutrition_logs.log_date` → fecha del registro de nutrición
- `nutrition_meal_logs.is_completed` → si una comida se completó ese día
- `workout_logs.logged_at` → timestamp de cada set logueado
- `DayNavigator.tsx` — ya existe en `src/app/c/[coach_slug]/nutrition/_components/` — reutilizable

### Arquitectura propuesta

```
/coach/clients/[clientId]

NutritionTabB5 (tab Nutrición del perfil)
├── [Sección actual: macro rings agregados, charts, adherencia] ← sin cambios
└── [Nueva sección: "Ver día específico"]
    ├── DayNavigator (reutilizado de /c/.../nutrition/_components/)
    └── selectedDate state → llamada a getClientNutritionForDate(clientId, date)
        ├── Retorna: daily_nutrition_logs + nutrition_meal_logs + food_items + foods
        ├── MacroRingSummary (read-only)
        └── Lista de comidas del día con alimentos (sin toggle — solo lectura)

TrainingTabB4Panels (tab Análisis del perfil)
├── [Sección actual: PRs, tonelaje, radar] ← sin cambios
└── [Nueva sección: "Ver sesión por fecha"]
    ├── DayNavigator
    └── selectedDate state → llamada a getClientWorkoutForDate(clientId, date)
        ├── Retorna: workout_logs + workout_blocks + exercises + workout_plans
        └── Por ejercicio: nombre, grupo muscular, sets/reps/peso/RPE
```

### Nuevas Server Actions en `src/app/coach/clients/[clientId]/actions.ts`

```typescript
// Ver nutrición de un día específico
export async function getClientNutritionForDate(clientId: string, date: string)
  → FROM daily_nutrition_logs WHERE client_id = clientId AND log_date = date
  → JOIN nutrition_meal_logs → nutrition_meals → food_items → foods

// Ver entrenamiento de un día específico
export async function getClientWorkoutForDate(clientId: string, date: string)
  → FROM workout_logs WHERE client_id = clientId AND logged_at BETWEEN dateStart AND dateEnd
  → JOIN workout_blocks → exercises + workout_plans
```

### RLS
El coach ya puede leer datos de sus propios alumnos. No se requieren cambios en RLS ni middleware.

---

## 17. Optimización de Tabs del Perfil del Alumno (PENDIENTE P2)

### Situación actual

El perfil del alumno tiene 6 tabs: Overview | Progreso | Entrenamiento | Programa | Nutrición | Facturación

**Solapamiento identificado:**
- "Entrenamiento" (`TrainingTabB4Panels`) = analytics (PRs, tonelaje, radar, historial sesiones)
- "Programa" (`ProgramTabB7`) = blueprint (grid semanal, prescripciones, link builder)
- Ambas muestran logs históricos de ejercicios (desde ángulos distintos)
- "Programa" tiene un Sheet por ejercicio que muestra "sesiones recientes" → duplica Entrenamiento

**KPI card "Métricas Clave" en Overview:**
- Sidebar de Overview tiene 3 métricas (Peso Actual, Var. Semanal, Racha Interact.) con estilos grandes
- "Racha" aparece duplicada también en el grid de 6 KPIs de `ProfileOverviewB3.tsx`

### Propuesta

```
Rename tabs (sin cambiar IDs internos — son strings):
  "Entrenamiento" → "Análisis"   (ícono: BarChart / TrendingUp)
  "Programa"     → "Plan"        (ícono: LayoutGrid — actual)

En ProgramTabB7: quitar sección "Sesiones recientes" del Sheet de ejercicio
  → esas sesiones pertenecen a la tab Análisis

En ClientProfileDashboard.tsx (~líneas 396-462):
  → Reducir KPI card sidebar: p-6 → p-4, quitar blur decorativo
  → Quitar "Racha Interact." (ya está en el grid de 6 KPIs)
  → Dejar solo: Peso Actual + Var. Semanal
```
