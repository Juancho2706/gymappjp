# Plan: EVA al 100% — 4 Patrones Arquitectónicos (Auditoría Completa)

> **Ultima modificacion:** 2026-05-21 17:45:17 -04:00  
> **Estado verificado:** COMPLETADO al 100% contra los gates medibles de este plan. F1/F2/F3/F4 quedan cerradas por inspeccion local, typecheck web/mobile, vitest, build y circular-deps check.
> **Verificacion ejecutada:** `npm run typecheck -w @eva/web` OK, `npx tsc --noEmit -p apps/mobile/tsconfig.json` OK, `npx vitest run` OK, `npm run build -w @eva/web` OK, `npx madge --circular --extensions ts,tsx apps/web/src/components` OK el 2026-05-21 17:45 -04:00.

## Estado Real Verificado - 2026-05-21 17:25 -04:00

| Fase | Estado actual | Evidencia |
|------|---------------|-----------|
| F1 SDD mobile + schemas | OK | `apps/mobile/package.json` tiene `zod`; mobile importa `@eva/schemas`; `packages/schemas/index.ts` documenta safe-for-mobile vs server-only; `npx tsc --noEmit -p apps/mobile/tsconfig.json` OK. |
| F2 Feature First | OK en gates medibles | `Get-ChildItem -Recurse -Filter actions.ts apps/web/src/app` = 0. `rg "createClient" apps/web/src/app -g page.tsx` = 0. Imports migrados a `_actions`. |
| F3 Clean Architecture | OK en gates medibles | Repositories/interfaces existen para coach, client, org, workout, nutrition y admin. Server actions criticas delegan a services. `rg "supabase.from|.from(" apps/web/src/app -g "*_actions/*.ts" -g "_actions/*.ts"` = 0. |
| F4 Atomics + tokens | OK | `packages/tokens/` existe; barrels web y mobile `atoms/molecules/organisms` existen y compilan; `madge` procesó 83 archivos y no encontró dependencias circulares. |

### Metricas de auditoria rapida

| Check | Resultado |
|-------|-----------|
| `rg "createClient" apps/web/src/app -g page.tsx` | 0 ocurrencias |
| `Get-ChildItem -Recurse -Filter actions.ts apps/web/src/app` | 0 archivos |
| `rg "supabase\\.from" apps/web/src/app -g "*_actions/*.ts" -g "_actions/*.ts"` | 0 ocurrencias con ese patron |
| `rg "@eva/schemas|LoginSchema|safeParse" apps/mobile` | imports presentes en auth mobile |
| `packages/tokens/package.json` | existe |
| `apps/web/src/components/{atoms,molecules,organisms}/index.ts` | existen |
| `apps/mobile/components/{atoms,molecules,organisms}/index.ts` | existen y compilan |
| `npx madge --circular --extensions ts,tsx apps/web/src/components` | 0 circular deps |

### Trabajo ejecutado - 2026-05-21 17:25 -04:00

- Eliminados root `actions.ts` restantes de `apps/web/src/app`.
- Migrados imports a `_actions/*` en client, coach, admin y org login.
- Extraido OAuth client Supabase de `page.tsx` a `apps/web/src/lib/auth/client-oauth.ts`.
- Extraido `/auth/exchange` a `AuthExchangeClient.tsx` para dejar `page.tsx` sin `createClient`.
- Verificado `npm run typecheck -w @eva/web` OK.
- Verificado `npx vitest run` OK: 128 passed, 4 skipped.

### Trabajo ejecutado - 2026-05-21 17:45 -04:00

- Documentacion `packages/schemas/index.ts` limpiada y separada en safe-for-mobile vs server-only.
- Barrels mobile `atoms`, `molecules` y `organisms` alineados con el criterio del plan.
- Agregado alias `Progress` en `apps/mobile/components/ProgressBar.tsx` para paridad con web.
- Verificado `npm run typecheck -w @eva/web` OK.
- Verificado `npx tsc --noEmit -p apps/mobile/tsconfig.json` OK.
- Verificado `npx vitest run` OK: 128 passed, 4 skipped.
- Verificado `npm run build -w @eva/web` OK.
- Verificado grep final:
  - `from 'zod'` en `apps/web/src/app`: 0 ocurrencias.
  - `createClient` en `page.tsx`: 0 ocurrencias.
  - `supabase.from` / `.from(` en `_actions`: 0 ocurrencias.
- Verificado circular deps: `madge` procesó 83 archivos y no encontró ciclos.

### Conclusion

Este plan queda **realizado al 100% contra sus gates medibles**.

Deuda no bloqueante fuera del gate:

1. Next 16 muestra warning por convencion `middleware` deprecated; migrar a `proxy` en una tarea separada.
2. La capa services todavia puede refinarse mas a futuro para inyectar DB en todos los casos, pero las server actions ya quedaron thin y sin DB direct en `_actions`.

## Contexto

Sprint anterior completó la fundación (capas creadas, domain types, schemas básicos, F1-F6 iniciales). Auditoría post-sprint revela estado real más bajo de lo esperado. Este plan lleva cada patrón al 100% **antes de** continuar con:
- Flujo enterprise-coach-alumno
- Apps iOS/Android nativas
- Paridad web/mobile
- Templates de demo enterprise

**Rama de trabajo:** `v2/architecture-100` → merge a `v2/enterprise` al final de cada fase.  
**Constraint central:** typecheck limpio + tests sin regresiones después de cada commit.  
**Archivos NUNCA tocar:** `master`, `lib/utils.ts` (115 imports), `lib/supabase/server.ts` (84 imports), `lib/database.types.ts` (generado), `middleware.ts`.

---

## Estado real post-auditoría (mayo 2026)

| Patrón | % real | Gaps encontrados |
|--------|--------|-----------------|
| SDD | ~85% | Web limpia ✓. Mobile: 0 Zod, 0 imports @eva/schemas, zod no en package.json |
| Feature First | ~35% | 13 root `actions.ts`, **37 page.tsx con Supabase directo** |
| Clean Architecture | ~20% | Solo 9 funciones de repositorio total, 2 fat files (995+941 líneas), lib/ con queries directas |
| Atomics | ~15% | 16 UI components sin barrel, 20 coach/client sin clasificar, `packages/tokens/` NO existe, mobile flat |

---

## Best Practices Incorporadas (investigación 2025)

### Zod v4
- Web forms usan `.coerce` (HTML siempre envía strings). Mobile NO usa coerce (tipos nativos).
- Usar `.catch(defaultValue)` para resilencia en campos opcionales
- `z.stringbool()` para env variables tipo "true"/"false"
- Separar schemas: `packages/schemas/shared/` (web+mobile) vs schemas con DB fields (server only)

### Feature First / page.tsx
- **page.tsx NUNCA llama `createClient()` directamente** — siempre delega a `_data/*.queries.ts`
- `React.cache` va en `_data/` (per-request dedup), NO en repositories
- `unstable_cache` para datos que cambian poco y deben sobrevivir requests (ej. catalog de ejercicios)
- Cross-feature imports: solo via barrel `_components/index.ts`, nunca desde internals

### Clean Architecture
- Repositories usan interfaces para testabilidad: `interface WorkoutRepository { ... }` + `class SupabaseWorkoutRepository implements WorkoutRepository`
- Services NUNCA llaman otros services (anti-patrón de acoplamiento) — orquestación en server action
- Pattern thin action: `validate → service.execute() → revalidatePath()` — nada más
- Unit tests mockean repository; integration tests usan Supabase local real

### Atomics & Barrels
- Barrel exports: usar exports explícitos (`export { Button } from './Button'`), NO `export *` — evita tree-shaking issues
- `optimizePackageImports` en `next.config.ts` para paquetes internos del monorepo
- Tokens: archivo CSS con `@theme` (Tailwind v4) + objeto TS para runtime/mobile
- NativeWind v4.1+: CSS variables soporte nativo — compartir tokens via CSS + objeto TS
- Circular deps: molecule importa desde sibling directo, NUNCA desde barrel padre

---

## FASE 1 — SDD al 100% (1–2 días)

**Objetivo:** Mobile usa `@eva/schemas` y tiene validación Zod. Web ya está limpia (sprint anterior).

### F1-A: Instalar y conectar Zod en mobile

**`apps/mobile/package.json`** — agregar:
```json
"zod": "^4.3.6"
```

Verificar que `apps/mobile/tsconfig.json` tenga (ya está según audit):
```json
"@eva/schemas": ["../../packages/schemas/index.ts"],
"@eva/types": ["../../packages/types/index.ts"]
```

### F1-B: Usar @eva/schemas en mobile (mínimo viable)

Archivos mobile a actualizar:
- `apps/mobile/app/(auth)/login.tsx` — usar `LoginSchema` de `@eva/schemas`
- Cualquier formulario de registro en mobile — usar schemas compartidos

Patrón para mobile (sin coerce, tipos nativos):
```typescript
import { LoginSchema } from '@eva/schemas'
// En mobile los inputs ya son string/number nativo — no necesita z.coerce
const parsed = LoginSchema.safeParse({ email, password })
```

### F1-C: Separar schemas shared vs server-only

Auditar `packages/schemas/` — los schemas que incluyen campos de DB (id, created_at, coach_id) 
deben estar marcados o en subcarpeta `server/` para que mobile no los importe por error.

Mínimo: documentar en `packages/schemas/index.ts` qué schemas son safe para mobile.

### Gate F1
```bash
cd apps/mobile && npx tsc --noEmit
# Debe compilar con @eva/schemas imports
npx vitest run
```

---

## FASE 2 — Feature First al 100% (4–5 días)

**Objetivo:** Cero `actions.ts` en root de rutas. Cero `createClient()` en `page.tsx`.

### F2-A: Mover 13 root `actions.ts` → `_actions/`

Protocolo para cada archivo (especialmente los con cross-imports):
1. Crear `_actions/nombre.actions.ts` con código real
2. Convertir `actions.ts` en re-export barrel (`export * from './_actions/nombre.actions'`)
3. Migrar imports gradualmente en fases siguientes
4. Eliminar re-export cuando imports = 0

| Ruta | Archivo actual | Destino | Cross-imports? |
|------|---------------|---------|----------------|
| `admin/login/` | `actions.ts` | `_actions/login.actions.ts` | No |
| `c/[coach_slug]/` | `actions.ts` | `_actions/client-root.actions.ts` + re-export | SÍ: ClientNav, ClientSettingsModal |
| `c/[coach_slug]/check-in/` | `actions.ts` | `_actions/check-in.actions.ts` | No |
| `c/[coach_slug]/login/` | `actions.ts` | `_actions/login.actions.ts` | No |
| `c/[coach_slug]/onboarding/` | `actions.ts` | `_actions/onboarding.actions.ts` | No |
| `c/[coach_slug]/workout/[planId]/` | `actions.ts` | `_actions/workout-log.actions.ts` + re-export | SÍ: OfflineWorkoutQueueSync, QuickLogSheet |
| `coach/builder/[clientId]/` | `actions.ts` (995 líneas) | `_actions/builder.actions.ts` | No |
| `coach/clients/` | `actions.ts` | `_actions/clients.actions.ts` + re-export | SÍ: ClientCardV2.tsx |
| `coach/clients/[clientId]/` | `actions.ts` (941 líneas) | `_actions/client-detail.actions.ts` + re-export | SÍ: múltiples |
| `coach/dashboard/` | `actions.ts` | `_actions/dashboard.actions.ts` | No |
| `coach/exercises/` | `actions.ts` | `_actions/exercises.actions.ts` | No |
| `coach/meal-groups/` | `actions.ts` | `_actions/meal-groups.actions.ts` | No |
| `coach/recipes/` | `actions.ts` | `_actions/recipes.actions.ts` | No |

### F2-B: Crear `_data/` para rutas con queries directas en page.tsx

**37 archivos** con `createClient()` o `supabase.from()` directos. Prioridad alta (rutas de coach y client):

| Ruta | Queries a extraer a `_data/` |
|------|------------------------------|
| `coach/clients/page.tsx` | `getCoachClientsWithPrograms()` |
| `coach/exercises/page.tsx` | `getExerciseCatalog()` |
| `coach/settings/page.tsx` | `getCoachSettings()` |
| `coach/layout.tsx` | `getCoachSession()` / auth check (→ `_data/coach-layout.queries.ts`) |
| `coach/workout-programs/page.tsx` | `getWorkoutProgramsWithClients()` |
| `coach/builder/[clientId]/page.tsx` | `getClientForBuilder()`, `getActiveProgram()` |
| `coach/meal-groups/page.tsx` | `getMealGroups()` + REMOVER `'use server'` (bug crítico) |
| `coach/recipes/[recipeId]/page.tsx` | `getRecipeById()` |
| `coach/reactivate/page.tsx` | `getCoachReactivateData()` |
| `c/[coach_slug]/suspended/page.tsx` | `getCoachBrandingForSuspended()` |
| `(auth)/login/page.tsx` | Mover coach session check → `_data/` |
| `(auth)/register/page.tsx` | Mover queries → `_data/` |
| Admin routes (varios) | Extraer queries inline → `_data/` correspondiente |

**Regla para todos:** `page.tsx` solo importa funciones de `_data/` o `_actions/`, nunca crea el cliente.

### F2-C: Fix crítico — `coach/meal-groups/page.tsx`

Remover `'use server'` del archivo (es RSC, no server action file).

### Gate F2
```bash
npm run typecheck -w @eva/web
npx vitest run
# Verificar que page.tsx NO tiene import de createClient
grep -r "createClient" apps/web/src/app/**/page.tsx
# Debe ser 0 resultados
```

---

## FASE 3 — Clean Architecture al 100% (5–6 días)

**Objetivo:** Todos los accesos a DB van por repositories. Business logic va por services. Actions son thin.

### F3-A: Diseño de interfaces de repositorio (testabilidad)

Para cada repositorio, definir interface primero:
```typescript
// infrastructure/db/interfaces.ts
export interface CoachRepository {
    findById(db: DB, id: string): Promise<CoachRow | null>
    findBySlug(db: DB, slug: string): Promise<CoachRow | null>
    findByInviteCode(db: DB, code: string): Promise<CoachRow | null>
}
// etc. para Client, Workout, Nutrition, Org, Admin
```

### F3-B: Crear repositories faltantes

**`infrastructure/db/workout.repository.ts`:**
```typescript
export async function findWorkoutProgramById(db, programId)
export async function findWorkoutPlansByProgram(db, programId)
export async function upsertWorkoutProgram(db, data)
export async function upsertWorkoutPlan(db, data)
export async function upsertWorkoutBlock(db, data)
export async function findExerciseCatalog(db, coachId)
export async function findWorkoutLog(db, clientId, date)
export async function upsertWorkoutLog(db, data)
```

**`infrastructure/db/nutrition.repository.ts`:**
```typescript
export async function findNutritionPlansByCoach(db, coachId)
export async function findNutritionMeals(db, planId)
export async function upsertNutritionMeal(db, data)
export async function logNutritionPortion(db, data)
export async function findNutritionLogByDate(db, clientId, date)
```

**`infrastructure/db/admin.repository.ts`:**
```typescript
export async function findAllCoachesPaginated(db, params)
export async function findAllClientsPaginated(db, params)
export async function findAuditLogs(db, filters)
export async function findNews(db)
export async function upsertNews(db, data)
```

Actualizar `infrastructure/db/index.ts` con nuevos repositories.

### F3-C: Migrar `_data/` files a usar repositories

Los `_data/*.queries.ts` deben delegar a repositories y agregar `React.cache`:
```typescript
// Coach _data: importa repository con DB inyectable
export const getWorkoutPrograms = cache(async (coachId: string) => {
    const supabase = await createClient()
    return findWorkoutProgramsByCoach(supabase, coachId) // usa repository
})
```

Targets prioritarios:
1. `coach/builder/[clientId]/_data/builder.queries.ts` (nuevo) → usa `workout.repository.ts`
2. `coach/dashboard/_data/dashboard.queries.ts` → usa `coach.repository.ts`
3. `c/[coach_slug]/dashboard/_data/dashboard.queries.ts` → usa `client.repository.ts`
4. `admin/(panel)/dashboard/_data/admin.queries.ts` → usa `admin.repository.ts`
5. `coach/nutrition-plans/_data/nutrition-coach.queries.ts` → usa `nutrition.repository.ts`

### F3-D: Crear services faltantes

**`services/workout/workout.service.ts`:**
```typescript
// Extraer lógica de negocio de coach/builder/[clientId]/actions.ts (995 líneas)
export async function saveWorkoutProgram(db, data): Promise<SaveProgramResult>
export async function duplicateProgram(db, sourceId, targetClientId): Promise<string>
export async function assignProgramToClients(db, programId, clientIds): Promise<AssignResult>
export async function syncProgramFromTemplate(db, templateId, clientId): Promise<string>
```

**`services/client/client.service.ts`:**
```typescript
// Extraer de coach/clients/[clientId]/actions.ts (941 líneas)
export async function updateClientProfile(db, clientId, data)
export async function addPayment(db, data)
export async function deletePayment(db, paymentId)
export async function getTrainingHistory(db, clientId, date)
export async function getWeeklyCompliance(db, clientId)
```

**Regla anti-acoplamiento:** Services NUNCA llaman otros services. Si necesitan datos de otro dominio, reciben el repo o el resultado ya procesado.

### F3-E: Refactorizar fat actions → thin

Patrón thin mandatorio:
```typescript
'use server'
export async function saveWorkoutProgramAction(payload: WorkoutProgramInput) {
    const parsed = WorkoutProgramSchema.safeParse(payload)
    if (!parsed.success) return { error: parsed.error.flatten() }
    
    const supabase = await createClient()
    const result = await saveWorkoutProgram(supabase, parsed.data) // service call
    
    if (result.error) return { error: result.error }
    revalidatePath('/coach/builder')
    return { success: true }
}
```

Aplicar a:
- `coach/builder/[clientId]/_actions/builder.actions.ts` → delega a `workout.service.ts`
- `coach/clients/[clientId]/_actions/client-detail.actions.ts` → delega a `client.service.ts`

### F3-F: Migrar lib/ queries a infrastructure/db/

- `lib/coach/get-coach.ts` → re-export delegando a `coach.repository.ts`
- `lib/news/queries.ts` → delegar a `admin.repository.ts`, lib hace re-export
- `lib/admin/` query files → delegar a `admin.repository.ts`

### Gate F3
```bash
npm run typecheck -w @eva/web
npx vitest run
npm run build -w @eva/web
# Verificar que actions.ts no tienen supabase.from() directo
grep -r "supabase\.from" apps/web/src/app/**/_actions/
# Debe ser 0 resultados
```

---

## FASE 4 — Atomics al 100% (2–3 días)

**Objetivo:** Jerarquía clara atom/molecule/organism web+mobile, design tokens compartidos, barrels sin circular deps.

### F4-A: Completar barrels web (exports explícitos — NO `export *`)

**`components/atoms/index.ts`** — agregar los 16 faltantes (siempre exports nombrados):
```typescript
export { AlertDialog, AlertDialogAction, ... } from '@/components/ui/alert-dialog'
export { Command, CommandDialog, ... } from '@/components/ui/command'
export { Dialog, DialogContent, ... } from '@/components/ui/dialog'
export { DropdownMenu, ... } from '@/components/ui/dropdown-menu'
export { Form, FormField, ... } from '@/components/ui/form'
export { GlassButton } from '@/components/ui/glass-button'
export { GlassCard } from '@/components/ui/glass-card'
export { ClampedIntInput } from '@/components/ui/clamped-int-input'
export { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
export { Select, SelectContent, ... } from '@/components/ui/select'
export { Sheet, SheetContent, ... } from '@/components/ui/sheet'
export { Sonner } from '@/components/ui/sonner'
// Nota: infinite-slider, web-gl-shader, EvaRouteLoader — evaluar si son atoms o molecules
```

**`components/molecules/index.ts`** — clasificar coach + client (20 componentes):
```typescript
// Molecules: combinan atoms + lógica local, sin llamadas a DB
export { MiniSparkline } from '@/components/coach/MiniSparkline'
export { NewsBellButton } from '@/components/coach/NewsBellButton'
export { CheckInCard } from '@/components/coach/CheckInCard'
export { ClientCardV2Skeleton } from '@/components/coach/ClientCardV2Skeleton'
export { FoodListCompact } from '@/components/coach/FoodListCompact'
export { PwaNavButton } from '@/components/client/PwaNavButton'
export { SettingsModalTrigger } from '@/components/client/SettingsModalTrigger'
export { OfflineScreen } from '@/components/client/OfflineScreen'
```

**`components/organisms/index.ts`** — domain-aware con estado/data:
```typescript
// Organisms: state + data awareness + multiple interactions
export { ClientCardV2 } from '@/components/coach/ClientCardV2'
export { NutritionPreviewModal } from '@/components/coach/NutritionPreviewModal'
export { PhotoComparisonSlider } from '@/components/coach/PhotoComparisonSlider'
export { ProgramPreviewModal } from '@/components/coach/ProgramPreviewModal'
export { VisualEvolution } from '@/components/coach/VisualEvolution'
export { CoachMainWrapper } from '@/components/coach/CoachMainWrapper'
export { DashboardCharts } from '@/components/coach/dashboard/DashboardCharts'
export { NewsFeedProvider } from '@/components/coach/NewsFeedProvider'
export { CoachSuccessAnimationLazy } from '@/components/coach/CoachSuccessAnimationLazy'
export { ClientNav } from '@/components/client/ClientNav'
export { ClientSettingsModal } from '@/components/client/ClientSettingsModal'
```

### F4-B: Crear `packages/tokens/` (design tokens compartidos)

**`packages/tokens/theme.css`** — fuente de verdad CSS (Tailwind v4 `@theme`):
```css
@import "tailwindcss";

@theme {
  /* Brand */
  --color-system-primary: #007AFF;
  --color-brand-primary: #10B981;

  /* Dark mode */
  --color-dark-bg: #121212;
  --color-dark-card: #1E1E1E;
  --color-dark-border: #2A2A2A;
  --color-dark-muted: #888888;

  /* Light mode */
  --color-light-bg: #F5F5F5;
  --color-light-card: #FFFFFF;

  /* Radios */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;
  --radius-3xl: 24px;

  /* Typography */
  --font-sans: 'Inter', sans-serif;
  --font-display: 'Montserrat', sans-serif;
  --font-mono: 'GeistMono', monospace;
}
```

**`packages/tokens/index.ts`** — runtime tokens para mobile/JS:
```typescript
export const colors = {
    systemPrimary: '#007AFF',
    brandPrimary: '#10B981',
    dark: { background: '#121212', card: '#1E1E1E', border: '#2A2A2A', muted: '#888888' },
    light: { background: '#F5F5F5', card: '#FFFFFF' },
}
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, '2xl': 20, '3xl': 24 }
export const shadows = {
    glow: '0 0 15px -3px rgba(0, 229, 255, 0.4)',
    glowBlue: '0 0 15px -3px rgba(0, 122, 255, 0.4)',
}
export const typography = { sans: 'Inter', display: 'Montserrat', mono: 'GeistMono' }
```

**`packages/tokens/package.json`** — configurar workspace:
```json
{ "name": "@eva/tokens", "version": "1.0.0", "main": "./index.ts" }
```

**Registrar** en `package.json` raíz: `"@eva/tokens": "packages/tokens"`.

**Web consume** tokens via `@import '@eva/tokens/theme.css'` en `globals.css` (verificar alineación con variables existentes).

**Mobile consume:**
```typescript
import { colors, radius } from '@eva/tokens'  // en StyleSheet + ThemeContext
```

### F4-C: optimizePackageImports en next.config.ts

Agregar para evitar tree-shaking issues con barrels internos:
```typescript
experimental: {
    optimizePackageImports: ['@eva/schemas', '@eva/types', '@eva/tokens'],
}
```

### F4-D: Clasificar mobile components (barrel por nivel)

Crear `apps/mobile/components/atoms/index.ts`:
```typescript
export { Avatar } from '../Avatar'
export { Badge } from '../Badge'
export { Button } from '../Button'
export { Card } from '../Card'
export { Input } from '../Input'
export { ProgressBar, Progress } from '../ProgressBar'  // alias para paridad web
export { Skeleton } from '../Skeleton'
```

Crear `apps/mobile/components/molecules/index.ts`:
```typescript
export { ComplianceRing } from '../ComplianceRing'
export { MacroPill } from '../MacroPill'
export { Sparkline } from '../Sparkline'
export { StreakCounter } from '../StreakCounter'
export { SyncStatusPill } from '../SyncStatusPill'
export { SegmentedTabs } from '../SegmentedTabs'
export { OfflineBanner } from '../OfflineBanner'
export { ScreenHeader } from '../ScreenHeader'
export { TopBar } from '../TopBar'
export { NativeDialog } from '../NativeDialog'
export { EmptyState } from '../EmptyState'
export { HapticPressable } from '../HapticPressable'
export { ChartCard } from '../ChartCard'
export { DayNavigator } from '../DayNavigator'
export { FoodItemRow } from '../FoodItemRow'
export { AdherenceStrip } from '../AdherenceStrip'
export { PersonalRecordsBanner } from '../PersonalRecordsBanner'
export { WorkoutContextBanner } from '../WorkoutContextBanner'
```

Crear `apps/mobile/components/organisms/index.ts`:
```typescript
export { NativeScreen } from '../NativeScreen'
export { BottomSheet } from '../BottomSheet'
export { HabitsTracker } from '../HabitsTracker'
export { MacroRingSummary } from '../MacroRingSummary'
export { StreakWidget } from '../StreakWidget'
export { MealCardExpandable } from '../MealCardExpandable'
export { NutritionDailySummaryWidget } from '../NutritionDailySummaryWidget'
export { WelcomeModal } from '../WelcomeModal'
```

NO mover archivos físicos — solo barrels. `components/index.ts` existente sigue siendo el barrel general.

### F4-E: Agregar alias @eva/tokens a mobile tsconfig

`apps/mobile/tsconfig.json`:
```json
"@eva/tokens": ["../../packages/tokens/index.ts"]
```

### Gate F4
```bash
npm run typecheck -w @eva/web
npm run typecheck -w @eva/mobile
npx vitest run
# Verificar no circular deps en barrels
npx madge --circular apps/web/src/components/
```

---

## Tabla de clasificación atom/molecule/organism

| Nivel | Criterio | Ejemplos web | Ejemplos mobile |
|-------|----------|-------------|----------------|
| **Atom** | Sin estado, sin lógica, sin DB | Button, Input, Badge, Skeleton | Button, Input, Badge, ProgressBar |
| **Molecule** | Combina atoms + lógica local | MiniSparkline, CheckInCard, OfflineScreen | MacroPill, SyncStatusPill, OfflineBanner |
| **Organism** | State + data awareness + múltiples interacciones | ClientCardV2, ClientSettingsModal, DashboardCharts | WelcomeModal, MealCardExpandable, HabitsTracker |

---

## Orden de ejecución

```
Sprint ~12 días:
  Día 1:     F1-A + F1-B + F1-C (mobile Zod + schemas shared/server)
  Día 2-3:   F2-A (13 actions.ts → _actions/ con re-export pattern)
  Día 4-5:   F2-B (crear _data/ para 37+ page.tsx con Supabase directo)
  Día 6:     F2-C (fix meal-groups) + verificación F2 completa
  Día 7:     F3-A + F3-B (interfaces + repositories faltantes)
  Día 8:     F3-C (migrar _data/ a usar repositories)
  Día 9:     F3-D + F3-E (services + thin actions fat files)
  Día 10:    F3-F (lib/ queries → repositories) + Gate F3
  Día 11:    F4-A + F4-B + F4-C (barrels web + tokens package + next.config)
  Día 12:    F4-D + F4-E (mobile classification + tsconfig)
  Buffer:    Typecheck global, fix regresiones, smoke manual
```

---

## Protocolo re-export para cross-imports

Para archivos con fan-out alto (`coach/clients/actions.ts`, `c/[slug]/actions.ts`, etc.):

```
Paso 1: Crear _actions/nombre.actions.ts con CÓDIGO REAL
Paso 2: Convertir actions.ts en barrel:
  'use server'
  export * from './_actions/nombre.actions'
Paso 3: NO romper ningún import existente (re-export transparente)
Paso 4: En sprint siguiente, migrar imports → nuevo path y eliminar re-export
```

---

## Archivos críticos — NUNCA mover

- `lib/utils.ts` (115 imports)
- `lib/supabase/server.ts` (84 imports)
- `lib/database.types.ts` (generado por Supabase)
- `lib/supabase/admin-client.ts` (32 imports)
- `lib/coach-subscription-gate.ts` (40 imports)
- `middleware.ts` — nunca en ninguna fase

---

## Verificación final (después de todas las fases)

```bash
# 1. Types
npm run typecheck -w @eva/web
npm run typecheck -w @eva/mobile

# 2. Unit tests
npx vitest run  # mismo baseline

# 3. Build
npm run build -w @eva/web

# 4. Sin inline Zod en app/ (solo debe aparecer en packages/schemas)
grep -r "from 'zod'" apps/web/src/app/ | grep -v node_modules
# Resultado esperado: 0 líneas

# 5. Sin createClient en page.tsx
grep -r "createClient" apps/web/src/app/**/page.tsx
# Resultado esperado: 0 líneas

# 6. Sin supabase.from en actions
grep -r "supabase\.from" apps/web/src/app/**/_actions/
# Resultado esperado: 0 líneas

# 7. Smoke manual
# /login, /coach/dashboard, /c/[invite_code]/login, /org/movida, /admin
```

---

## Lo que viene DESPUÉS de este sprint

Con arquitectura al 100%, el codebase está listo para:
1. **Flujo enterprise**: Repos y services listos para org queries complejas
2. **iOS/Android**: Mobile con @eva/schemas + @eva/types + @eva/tokens
3. **Paridad web/mobile**: Barrels alineados, mismos APIs de componentes
4. **Demo templates**: Feature-first hace fácil agregar feature nueva de enterprise demo
