# 03 — Arquitectura Técnica de EVA Fitness Platform

> **Actualizado:** 2026-04-17 America/Santiago
> **Fuentes:** ARQUITECTURA-COMPONENTES.md, ESTADO-COMPONENTES.md, PERFORMANCE-NAV-BASELINE.md

---

## Stack y Dependencias

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js App Router, RSC, Server Actions | 16.1.6 |
| React | React + React Compiler | 19.2.3 |
| Estilos | Tailwind CSS v4 (PostCSS, sin tailwind.config) | ^4 |
| UI | shadcn/ui + @base-ui/react + Radix UI primitives | — |
| Estado | useState / useReducer / useTransition / Context (sin Redux/Zustand) | — |
| Animación | Framer Motion + tw-animate-css | — |
| Formularios | react-hook-form + Zod v4 | ^4.3.6 |
| Backend | Supabase (Auth, PostgreSQL, Storage, RLS) | — |
| Charts | Recharts + react-circular-progressbar + react-activity-calendar | — |
| DnD | @dnd-kit/core + @dnd-kit/sortable | — |
| Virtualización | @tanstack/react-virtual | — |
| Animación Lottie | @lottiefiles/react-lottie-player | — |
| Confetti | canvas-confetti | — |
| Compresión img | browser-image-compression | — |
| i18n | Custom LanguageContext + JSON (es/en) | parcial |
| PWA | Manual sw.js + manifests dinámicos | no next-pwa |
| Testing | Vitest + @testing-library/react + Playwright | — |
| PDF | puppeteer (devDependencies — PrintProgramDialog) | — |

---

## Estructura de Rutas (41 rutas)

```
src/app/
├── layout.tsx                         # Root: fonts, ThemeProvider, i18n, PWA
├── page.tsx                           # Landing page
├── error.tsx / global-error.tsx       # Error boundaries
├── globals.css                        # Tailwind v4 @theme + design tokens
│
├── (auth)/                            # Grupo auth coach
│   ├── layout.tsx                     # Centrado, logo, ThemeToggle
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
│   ├── coach/onboarding-events/       # Tracking onboarding coach
│   ├── internal/email-drip/run/       # Cron drip email (Bearer auth)
│   ├── ops/beta-health/               # Health endpoint operativo
│   └── recipes/search/                # API búsqueda recetas (rate limit 30 req/min)
│
├── payments/
│   ├── create-preference/             # Crear preapproval MP
│   ├── webhook/                       # Webhook MP (HMAC SHA256)
│   ├── subscription-status/           # Polling estado suscripción
│   └── cancel-subscription/           # Cancelar con grace period
│
├── pricing/                           # Pricing estática CLP
├── legal/                             # Términos y condiciones
├── privacidad/                        # Política de privacidad
│
├── coach/                             # Rutas del coach (protegidas por middleware)
│   ├── layout.tsx                     # getCoach(), sidebar, brand CSS vars
│   ├── dashboard/                     # Dashboard principal
│   ├── clients/                       # Directorio alumnos
│   │   └── [clientId]/                # Perfil individual (6 tabs)
│   ├── builder/[clientId]/            # Constructor de planes
│   ├── workout-programs/              # Biblioteca de programas
│   │   └── builder/                   # Builder para templates
│   ├── nutrition-plans/               # Hub nutrición
│   │   ├── new/
│   │   ├── [templateId]/edit/
│   │   └── client/[clientId]/
│   ├── foods/                         # Biblioteca alimentos
│   ├── exercises/                     # Catálogo ejercicios
│   ├── settings/                      # Mi Marca
│   │   └── preview/                   # Preview alumno
│   ├── subscription/                  # Gestión suscripción
│   │   └── processing/                # Polling checkout
│   └── reactivate/                    # Reactivación para coaches bloqueados
│
└── c/[coach_slug]/                    # Rutas white-label del alumno
    ├── layout.tsx                     # Branding via headers, --theme-primary, ClientNav
    ├── page.tsx                       # Auth gate: logueado → dashboard
    ├── login/                         # Login alumno (branded)
    ├── onboarding/                    # Multi-step intake
    ├── dashboard/                     # Dashboard completo (9 Suspense boundaries)
    │   ├── _data/
    │   ├── _components/
    │   └── _actions/
    ├── workout/[planId]/              # Ejecución entrenamiento
    ├── check-in/                      # Check-in 3 pasos
    ├── nutrition/                     # Plan nutrición alumno
    │   ├── _data/
    │   ├── _components/
    │   └── _actions/
    ├── exercises/                     # Catálogo ejercicios
    ├── change-password/               # Cambio contraseña forzado
    └── suspended/                     # Pantalla de suspensión
```

---

## Flujo de Autenticación y Middleware

```
Request
└── middleware.ts
    │
    ├── /coach/* → verifica sesión + registro en tabla coaches
    │              → si no auth → /login
    │              → si suscripción bloqueada → /coach/reactivate
    │              → inyecta CSS vars del sistema (#007AFF)
    │
    ├── /c/[slug]/* → carga coach por slug desde BD
    │   ├── Sets headers: x-coach-id, x-coach-brand-name,
    │   │                 x-coach-primary-color, x-coach-logo-url,
    │   │                 x-client-use-brand-colors
    │   ├── /c/[slug]/login → si ya logueado → dashboard
    │   └── /c/[slug]/* → verifica auth + client row
    │       ├── client.is_active === false → /suspended
    │       ├── force_password_change → /change-password
    │       └── !onboarding_completed → /onboarding
    │
    └── / (root) con user →
        ├── coach → /coach/dashboard
        └── client → /c/{coach.slug}/dashboard
```

**Clientes Supabase:**
- `createClient()` — server-side con cookies (rutas normales)
- `createAdminClient()` — service_role key (operaciones admin: crear/borrar usuarios auth)
- `createRawAdminClient()` — untyped service_role para edge cases RLS

**Color system:**
- `SYSTEM_PRIMARY_COLOR = '#007AFF'` — azul EVA (cuando coach no activa branding)
- `BRAND_PRIMARY_COLOR = '#10B981'` — verde EVA (marca propia para landing)
- `use_brand_colors_coach` en BD del coach controla qué color se inyecta

---

## Modelo de Datos Completo (24 tablas)

### Diagrama de relaciones

```
coaches ──┬──→ clients ──┬──→ check_ins
          │              ├──→ client_intake (1:1)
          │              ├──→ client_payments ←── coaches
          │              ├──→ workout_programs
          │              │       └──→ workout_plans
          │              │              └──→ workout_blocks
          │              │                     ├──→ exercises
          │              │                     └──→ workout_logs
          │              ├──→ nutrition_plans
          │              │       ├──→ nutrition_meals
          │              │       │       └──→ food_items
          │              │       │              └──→ foods
          │              │       └──→ daily_nutrition_logs
          │              │              └──→ nutrition_meal_logs
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

### Columnas clave por tabla

**Autenticación y usuarios:**

| Tabla | Columnas clave |
|-------|---------------|
| `coaches` | id, slug, brand_name, full_name, primary_color, logo_url, use_brand_colors_coach, subscription_tier, subscription_status, subscription_mp_id, superseded_mp_preapproval_id, current_period_end, trial_ends_at, trial_used_email, max_clients, billing_cycle, welcome_message, payment_provider |
| `clients` | id (FK auth.users), coach_id, email, full_name, phone, is_active, onboarding_completed, force_password_change, use_coach_brand_colors, goal_weight_kg |
| `client_intake` | id, client_id (1:1), weight_kg, height_cm, experience_level, goals, availability, injuries, medical_conditions |

**Entrenamiento:**

| Tabla | Columnas clave |
|-------|---------------|
| `workout_programs` | id, coach_id, client_id, name, is_active, weeks_to_repeat, program_structure_type (weekly/cycle), ab_mode, cycle_length, duration_type, duration_days, start_date, end_date, source_template_id |
| `workout_plans` | id, coach_id, client_id, program_id, title, day_of_week, group_name, assigned_date, week_variant (A/B) |
| `workout_blocks` | id, plan_id, exercise_id, section (warmup/main/cooldown), order_index, sets, reps, target_weight_kg, rir, rest_time, tempo, notes, superset_group, progression_type, progression_value |
| `exercises` | id, coach_id (null=global), name, muscle_group, body_part, equipment, gif_url, video_url, video_start_time, video_end_time, instructions[], secondary_muscles[] |
| `workout_logs` | id, client_id, block_id, set_number, reps_done, weight_kg, rpe, plan_name_at_log, logged_at |

**Nutrición:**

| Tabla | Columnas clave |
|-------|---------------|
| `nutrition_plans` | id, client_id, coach_id, name, is_active, is_custom, template_id, daily_calories, protein_g, carbs_g, fats_g |
| `nutrition_plan_templates` | id, coach_id, name, goal_type, daily_calories, protein/carbs/fats_g, tags[], is_favorite |
| `nutrition_meals` | id, plan_id, name, order_index |
| `food_items` | id, meal_id, food_id, quantity, unit |
| `foods` | id, coach_id (null=global), name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand |
| `daily_nutrition_logs` | id, client_id, plan_id, log_date, target_calories/protein/carbs/fats_at_log |
| `nutrition_meal_logs` | id, daily_log_id, meal_id, is_completed |
| `saved_meals` / `saved_meal_items` | Comidas guardadas del coach |
| `recipes` / `recipe_ingredients` | Recetas con ingredientes |

**Seguimiento y pagos:**

| Tabla | Columnas clave |
|-------|---------------|
| `check_ins` | id, client_id, date, weight, energy_level, front_photo_url, back_photo_url, notes |
| `client_payments` | id, client_id, coach_id, amount, payment_date, period_months, service_description, status, receipt_image_url |
| `subscription_events` | id, coach_id, event_type, amount, status, mp_preapproval_id, created_at |

**Funciones RPC:**
- `search_foods(search_term text)` → retorna rows con shape de `foods`

---

## Patrones de Arquitectura

### Patrón de módulo (establecido)
```
module/
├── page.tsx              # Server component (RSC) — fetch + render
├── loading.tsx           # Streaming skeleton (Suspense boundary)
├── actions.ts            # Server actions simples
├── _data/                # React.cache queries (si complejo)
│   └── module.queries.ts
├── _actions/             # Server actions (si complejo)
│   └── module.actions.ts
└── _components/          # Client components por dominio
    ├── domain1/
    └── domain2/
```

### Comunicación Server → Client → Server
```
Server Component (fetch data via Supabase)
    └──props──→ Client Component
                    └──call──→ Server Action (actions.ts)
                                └── Supabase mutation
                                └── revalidatePath() → re-render
```

### Estado del cliente
```
useState / useReducer      → estado local UI
useTransition              → pending states para acciones
useActionState             → formularios con server actions
useOptimistic              → optimistic updates (nutrición)
Custom hooks               → usePlanBuilder, useWorkoutTimer
React Context              → WorkoutTimerProvider
```
No se usa Redux, Zustand ni ningún state manager externo.

### Validación
```
Client: react-hook-form + Zod schemas
Server: re-validación obligatoria en server actions + Zod v4
```

---

## Estado de Componentes por Módulo

### Módulos completados (≥90%)

| Módulo | % | Componentes clave |
|--------|---|------------------|
| Dashboard Alumno | 98% | page.tsx, DashboardShell, HeroSection, ComplianceRings, NutritionDailySummary, WeightWidget, PRBanner |
| Nutrición Alumno | 96% | NutritionShell, DayNavigator, MacroRingSummary, MealCard, AdherenceStrip |
| Constructor de Planes | 95% | WeeklyPlanBuilder, usePlanBuilder, BlockEditSheet, DraggableExerciseCatalog, MuscleBalancePanel |
| Biblioteca Programas | 95% | WorkoutProgramsClient, ProgramPreviewPanel, LibraryToolbar, libraryStats.ts |
| Perfil Alumno (Coach) | 95% | ClientProfileDashboard, ProfileTabNav, B3–B8 tabs, ClientProfileHero |
| Nutrición Coach | 93% | NutritionHub, PlanBuilder, FoodSearchDrawer (con ml), FoodListCompact |
| Directorio Clientes | 92% | ClientsDirectoryClient, CoachWarRoom, ClientCardV2, DirectoryActionBar |
| Pagos | 96% | webhook/route.ts, cancel-subscription, create-preference, coach-subscription-gate.ts |

### Módulos en progreso (50–89%)

| Módulo | % | Deuda principal |
|--------|---|----------------|
| Dashboard Coach | 88% | Optimistic updates pendientes |
| Registro Coach | 88% | Verificación email pendiente |
| Historial fecha coach | 85% | Dots actividad ✅ implementados |
| Workout Execution | 84% | Optimistic UI, offline/retry |
| Check-in Alumno | 82% | Medidas corporales, notas |
| Mi Marca / Settings | 68% | Preview moderno del dashboard alumno |
| Catálogo Ejercicios Alumno | 68% | Favoritos, historial |
| Onboarding Alumno | 58% | Fotos iniciales, más validación |
| Login/Auth Alumno | 50% | Sin rework visual |

### Módulos críticos con trabajo pendiente

| Módulo | % | Nota |
|--------|---|------|
| Login Coach | 40% | Sin rework visual. Sin rate limiting. |
| Ejercicios Coach | 40% | CRUD funcional. Sin upload GIF. |
| Forgot/Reset Password | 40% | Flujo correcto verificado. |
| Testing | 28% | Vitest básico + Playwright. Sin cobertura real. |
| Panel CEO | 0% | No implementado. |

---

## Flujos End-to-End Principales

### Coach crea y asigna un programa
```
1. Coach → /coach/builder/[clientId]
2. Arrastra ejercicios → usePlanBuilder actualiza estado local
3. Configura bloques en BlockEditSheet
4. "Guardar" → saveWorkoutProgramAction()
   → UPSERT workout_programs → plans → blocks
5. AssignToClientsDialog → assignProgramToClientsAction()
```

### Cliente ejecuta entrenamiento
```
1. Dashboard → WorkoutHeroCard → /c/[slug]/workout/[planId]
2. Server: plan + historial + exerciseMaxes + variante A/B
3. LogSetForm → logSetAction()
   → UPSERT workout_logs → revalidatePath (cliente + perfil coach)
4. Al completar → WorkoutSummaryOverlay (PRs, volumen, confetti)
```

### Flujo de suscripción coach
```
1. Register → /coach/subscription/processing
2. Polling detecta preapproval autorizado
3. Webhook MP → verifica HMAC → actualiza coaches row
4. Acceso desbloqueado → /coach/dashboard
5. Si cancela → grace period hasta current_period_end
6. Si reactiva → nuevo preapproval con start_date = now + 60s
```

### Coach revisa progreso del alumno
```
1. /coach/clients/[clientId] → getClientProfileData() en paralelo
2. Promise.all: clients, programs, plans, check_ins, workout_logs, payments, nutrition, streak
3. 6 tabs: Overview (adherencia/KPIs) / Análisis (PRs/tonelaje) / Nutrición (macros) / Progreso (peso/fotos) / Plan (grid semanal) / Facturación
```

---

## PWA Architecture

```
Root layout → manifest: '/api/manifest/default'
Coach client layout → manifest: '/c/[slug]/manifest.webmanifest'

Service Worker (public/sw.js):
├── Cache: 'eva-pwa-cache-v1'
├── Precache: /, offline fallback
├── Skip: Supabase, /_next/, /api/, /coach, /c/
└── Sin offline real, sin push notifications actualmente

Client components:
├── PwaRegister.tsx → registra sw.js, ajusta viewport en standalone
├── InstallPrompt.tsx → beforeinstallprompt + instrucciones iOS
└── PwaNavButton.tsx → install prompt handling en nav
```

---

## Performance Baselines y Patrones

### Lo que está bien (no cambiar)
- `React.cache()` para queries deduplicadas en RSC — 8+ funciones cacheadas
- `Promise.all()` para queries paralelas — dashboard coach: 10 queries paralelas
- `React.cache` (no `unstable_cache`) para directory pulse — compatible con Supabase SSR en producción
- `next/dynamic` con skeletons en WeeklyPlanBuilder y PlanBuilder
- Fonts con `display: 'swap'` (Inter + Montserrat)
- React Compiler habilitado en `next.config.ts`
- `<Image>` de Next.js usado en todos lados (0 `<img>` sin optimizar)
- SELECT específico (no `SELECT *`) en getFoodLibrary y getCoachFoodsCatalog

### Cómo habilitar logs de performance
Agregar en `.env.local`:
```
ENABLE_PERF_LOG_NAV=true
ENABLE_PERF_LOG_COACH_EMAIL=true
```
Estos flags activan medición de tiempo de servidor en `getPersonalRecords` y `getCoachDashboardData`.

### Cuellos de botella conocidos (escala futura)
- **>500.000 filas en workout_logs**: queries de analytics hacen full scans. Solución: índices compuestos en `workout_logs(coach_id, logged_at)`, `check_ins(client_id, created_at)`, `daily_nutrition_logs(client_id, log_date)`.
- **>5.000 coaches simultáneos**: conexiones PostgreSQL. Solución: activar PgBouncer (transaction pooling) en Supabase Pro.
- **Fotos de check-in a gran escala**: Supabase Storage sin CDN global optimizada. Solución: Cloudflare Images o AWS CloudFront.

### Bundle analyzer (pendiente)
```bash
ANALYZE=true npm run build
```
Dependencias a revisar: `framer-motion` (scope real), `browser-image-compression` (uso activo), `googleapis` (lazy load si para una sola feature).

---

## Decisiones Técnicas Clave

| Decisión | Motivo |
|----------|--------|
| RSC + Server Actions | Reduce JS del cliente, fetch en servidor, menos waterfall |
| React 19 + React Compiler | Memoización automática, optimistic UI nativo |
| `React.cache` (no SWR/React Query) | Deduplicación por request en RSC, sin cliente state |
| Supabase (no custom auth) | Auth + DB + Storage + RLS en uno. RLS como capa de seguridad |
| Tailwind CSS v4 | Sin tailwind.config, `@theme` en CSS, tokens nativos |
| shadcn/ui + Radix | Accesibilidad primitiva, sin lock-in de componentes |
| @dnd-kit (no react-beautiful-dnd) | Mantenido activamente, accesible, soporte touch |
| PWA manual (no next-pwa) | Control total, manifests dinámicos por coach |
| MercadoPago pre-approvals | Único gateway que soporta suscripciones + Redcompra en Chile |
| `useOptimistic` (no SWR/RQ) | React 19 nativo, sin dependencias extra |
| Sin Redux/Zustand | Context + useState suficiente para la complejidad actual |
