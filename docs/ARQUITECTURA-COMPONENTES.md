# Arquitectura de Componentes — GymApp JP

> Diagrama de jerarquía y comunicación entre componentes principales.
> **Generado:** 2026-04-09

---

## 1. Estructura General de Rutas

```
src/app/
├── (auth)/                          # Grupo auth: login, register, reset
├── coach/                           # Rutas del coach (protegidas por middleware)
│   ├── dashboard/                   # Dashboard principal del coach
│   ├── clients/                     # Directorio de clientes
│   │   └── [clientId]/              # Perfil individual del cliente
│   ├── builder/[clientId]/          # Constructor de planes de entrenamiento
│   └── workout-programs/            # Biblioteca de programas
└── c/[coach_slug]/                  # Rutas white-label del cliente
    ├── dashboard/                   # Dashboard del cliente
    └── workout/[planId]/            # Ejecución de entrenamiento
```

---

## 2. Flujo de Autenticación y Middleware

```
Request
└── middleware.ts
    ├── /coach/* → verifica sesión + registro en tabla coaches
    ├── /c/[slug]/* → carga branding del coach desde slug
    │                  verifica client.is_active
    └── Redirige a /login si no autenticado
```

**Clientes Supabase:**
- `createClient()` — cliente server-side con cookies (rutas normales)
- `createAdminClient()` — service_role key (operaciones admin: crear/borrar usuarios auth)

---

## 3. Coach — Directorio de Clientes (`/coach/clients`)

```
page.tsx (Server Component)
├── Queries: clients + workout_programs, getCachedDirectoryPulse()
└── CoachClientsShell (Client)
    ├── useState: riskFilter
    ├── CoachWarRoom
    │   └── Props: pulseData, riskFilter, onFilterChange
    │   └── Muestra métricas de riesgo / compliance
    └── ClientsDirectoryClient
        ├── Props: clients[], riskFilter
        ├── ClientsDirectoryTable (tabla filtrable)
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

## 4. Coach — Perfil del Cliente (`/coach/clients/[clientId]`)

```
page.tsx (Server Component, Suspense boundary)
└── ProfileContent (Server, llama getClientProfileData())
    └── ClientProfileDashboard (Client)
        ├── useState: activeTab (overview|training|nutrition|progress|program|billing)
        ├── useTransition: pendingStates
        ├── ClientProfileHero
        │   └── Props: name, weight, compliance, streak
        ├── ProfileTabNav
        │   └── Props: activeTab, onTabChange
        └── Tab Panels:
            ├── [overview]   → ProfileOverviewB3
            ├── [training]   → TrainingTabB4Panels
            ├── [nutrition]  → NutritionTabB5
            ├── [progress]   → ProgressBodyCompositionB6
            ├── [program]    → ProgramTabB7
            │                  └── Botón "Editar" → navega a /coach/builder/[clientId]
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

## 5. Coach — Constructor de Planes (`/coach/builder/[clientId]`)

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
    │   └── Props: name, dates, phases → onConfigChange
    ├── ProgramPhasesBar
    │   └── Props: phases[]
    ├── DraggableExerciseCatalog (sidebar izq.)
    │   └── Props: exercises[], recientes
    ├── DndContext
    │   └── Days grid (7 columnas)
    │       └── DayColumn (×7)
    │           └── ExerciseBlock (por ejercicio)
    │               └── BlockEditSheet (sheet/modal de detalles)
    │                   └── Props: block, onSave, onDelete
    ├── MuscleBalancePanel (sidebar der.)
    ├── TemplatePickerDialog → syncProgramFromTemplateAction()
    ├── AssignToClientsDialog → assignProgramToClientsAction()
    ├── PrintProgramDialog (export PDF)
    └── Botón Guardar → saveWorkoutProgramAction(payload)
```

**`saveWorkoutProgramAction(payload)` — inserts anidados:**
```
workout_programs (upsert)
└── workout_plans (1 por día configurado)
    └── workout_blocks (ejercicios en cada plan)
```

---

## 6. Cliente — Dashboard (`/c/[coach_slug]/dashboard`)

```
page.tsx (Server Component)
├── Fetch: programa activo + planes
├── Fetch: próximo entrenamiento programado
├── Fetch: plan de nutrición
├── Fetch: check-ins + peso (últimos 30 días)
└── Render:
    ├── Tarjeta "Próximo entrenamiento" → link a /c/[slug]/workout/[planId]
    ├── Info plan nutricional
    ├── WeightProgressChart (Client)
    │   └── Props: weightData[]
    └── Quick actions: check-in, nutrición
```

---

## 7. Cliente — Ejecución de Entrenamiento (`/c/[coach_slug]/workout/[planId]`)

```
page.tsx (Server Component)
├── Fetch: workout_plans → blocks → exercises
├── Verifica: plan pertenece al cliente + programa activo
├── Fetch: workout_logs del plan (para mostrar completado)
├── Fetch: workout_logs históricos mismos ejercicios (para referencia)
└── WorkoutTimerProvider (Client Context)
    ├── Expone: useWorkoutTimer() hook → startRest(timeStr)
    ├── Renderiza: RestTimer (modal flotante cuando activo)
    └── WorkoutExecutionClient (Client)
        ├── Header: back button, título del plan
        ├── Secciones: warmup | main | cooldown
        │   └── Por cada bloque/ejercicio:
        │       ├── Modal video/GIF del ejercicio
        │       ├── Info objetivo (peso, reps, RPE)
        │       ├── Filas de sets:
        │       │   ├── LogSetForm
        │       │   │   ├── Inputs: weight_kg, reps_done, rpe
        │       │   │   └── onSubmit → logSetAction(formData)
        │       │   ├── Display historial previo
        │       │   └── Botón rest → startRest() (via context)
        │       └── Notas del bloque
        └── WorkoutSummaryOverlay (al completar todos los sets)
```

**`logSetAction(formData)` — upsert de log:**
```
workout_logs (upsert por block_id + set_number)
└── revalidatePath('/c', 'layout')
```

---

## 8. Patrones de Comunicación

### Server → Client
```
Server Component (fetch data)
    └──props──→ Client Component
```
Los server components obtienen datos y los pasan como props a client components. No hay fetch del lado cliente salvo casos específicos.

### Client → Server
```
Client Component
    └──call──→ Server Action (actions.ts)
                └── Supabase query / mutation
                └── revalidatePath() → re-render server
```

### Estado del cliente
```
useState / useReducer   → estado local de UI
useTransition           → pending states para acciones
Custom hooks            → lógica reutilizable (usePlanBuilder, useWorkoutTimer)
React Context           → estado compartido en subárbol (WorkoutTimerProvider)
```
> No se usa Redux, Zustand ni otro state manager externo.

### Validación
```
Client: validación de forma con react-hook-form + zod schemas
Server: re-validación en server actions antes de escribir en DB
```

---

## 9. Modelo de Datos (Tablas Clave)

```
coaches ─────────────────────────────────────────
  id, slug, brand_name, primary_color, logo_url
  subscription_status

clients ──────────────────────────────────────────
  id (FK → auth.users), coach_id (FK → coaches)
  full_name, email, is_active, force_password_change

workout_programs ─────────────────────────────────
  id, coach_id, client_id
  name, is_active, start_date
  program_phases (JSON), ab_mode, cycle_length

workout_plans ────────────────────────────────────
  id, program_id, client_id
  title, assigned_date, day_of_week
  week_variant ('A' | 'B')

workout_blocks ───────────────────────────────────
  id, workout_plan_id, exercise_id
  order_index, sets, reps, target_weight_kg
  section ('warmup' | 'main' | 'cooldown')
  superset_group, progression_type

exercises ────────────────────────────────────────
  id, coach_id (null = global)
  name, muscle_group, gif_url, video_url

workout_logs ─────────────────────────────────────
  id, block_id, client_id
  set_number, weight_kg, reps_done, rpe, logged_at

check_ins ────────────────────────────────────────
  id, client_id
  weight, energy_level, front_photo_url, date

nutrition_plans / daily_nutrition_logs ───────────
  Vinculados a client_id

client_payments ──────────────────────────────────
  id, client_id, coach_id, amount, payment_date
```

**Relaciones clave:**
```
coaches (1) ──→ (N) clients
clients (1) ──→ (N) workout_programs
workout_programs (1) ──→ (N) workout_plans
workout_plans (1) ──→ (N) workout_blocks
workout_blocks (N) ──→ (1) exercises
workout_blocks (1) ──→ (N) workout_logs
clients (1) ──→ (N) check_ins
```

---

## 10. Flujos End-to-End Principales

### Coach crea y asigna un programa
```
1. Coach abre /coach/builder/[clientId]
2. Arrastra ejercicios → usePlanBuilder actualiza estado local
3. Configura bloques en BlockEditSheet
4. Clic "Guardar" → saveWorkoutProgramAction()
   → INSERT workout_programs → plans → blocks
5. Opcional: AssignToClientsDialog → assignProgramToClientsAction()
```

### Cliente ejecuta entrenamiento
```
1. Cliente ve /c/[slug]/dashboard → tarjeta "Próximo entrenamiento"
2. Clic → navega a /c/[slug]/workout/[planId]
3. Server page carga plan + historial previo
4. Cliente completa sets → LogSetForm → logSetAction()
   → UPSERT workout_logs → revalidatePath()
5. Al completar todos → WorkoutSummaryOverlay
```

### Coach revisa progreso del cliente
```
1. Coach abre /coach/clients/[clientId] → tab "Training"
2. getClientProfileData() carga logs + check-ins en paralelo
3. Coach ve adherencia, historial de pesos, fotos de progreso
4. Si quiere editar programa → tab "Program" → "Editar" → /coach/builder/[clientId]
```
