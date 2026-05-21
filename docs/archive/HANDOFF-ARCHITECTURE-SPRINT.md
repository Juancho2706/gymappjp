# Handoff: Architecture Sprint — 4 Patrones al 100%

> **Para la IA que continúe:** Este documento describe exactamente qué se hizo en esta sesión y qué falta para completar el plan. El plan maestro está en `C:\Users\juanm\.claude\plans\ok-primero-que-nada-declarative-bunny.md`.

---

## Contexto del Proyecto

**Rama actual:** `v2/enterprise`  
**App:** B2B2C white-label SaaS. Coaches, clients, orgs enterprise.  
**Stack:** Next.js 15 + React 19 + Supabase + Expo (mobile) + Zod v4  
**Workspace:** `apps/web`, `apps/mobile`, `packages/schemas`, `packages/types`  
**Archivos NUNCA mover:** `lib/utils.ts`, `lib/supabase/server.ts`, `lib/database.types.ts`, `middleware.ts`

---

## Lo que se completó en esta sesión

### FASE 1 — SDD ✅ (100%)

- `apps/mobile/package.json` → `"zod": "^4.3.6"` agregado
- `apps/mobile/app/(auth)/login.tsx` → usa `LoginSchema` de `@eva/schemas`
- `apps/mobile/app/(auth)/register.tsx` → usa `RegisterCoachFreeSchema` de `@eva/schemas`
- `apps/mobile/app/(auth)/forgot-password.tsx` → usa `ForgotPasswordSchema` de `@eva/schemas`
- `packages/schemas/coach.ts` → agregados: `CloneExerciseSchema`, `RegisterCoachFreeSchema`
- `packages/schemas/client.ts` → agregados: `CreateClientSchema`, `UpdateClientDataSchema`
- `packages/schemas/workout.ts` → agregado: `WorkoutLogSetSchema`
- `packages/schemas/index.ts` → comentarios documentando schemas safe-for-mobile vs server-only

### FASE 2 — Feature First (F2-A ✅, F2-B 🔄 50%, F2-C ✅)

**F2-A completado (13 actions.ts → _actions/):**

| Ruta | _actions/ creado | Original convertido a barrel |
|------|-----------------|------------------------------|
| `admin/login/` | `_actions/login.actions.ts` | ✅ |
| `c/[coach_slug]/` | `_actions/client-root.actions.ts` | ✅ |
| `c/[coach_slug]/check-in/` | `_actions/check-in.actions.ts` | ✅ |
| `c/[coach_slug]/login/` | `_actions/login.actions.ts` | ✅ |
| `c/[coach_slug]/onboarding/` | `_actions/onboarding.actions.ts` | ✅ |
| `c/[coach_slug]/workout/[planId]/` | `_actions/workout-log.actions.ts` | ✅ |
| `coach/builder/[clientId]/` | `_actions/builder.actions.ts` (995L copiado) | ✅ |
| `coach/clients/` | `_actions/clients.actions.ts` | ✅ |
| `coach/clients/[clientId]/` | `_actions/client-detail.actions.ts` (941L copiado) | ✅ |
| `coach/dashboard/` | `_actions/dashboard.actions.ts` | ✅ |
| `coach/exercises/` | `_actions/exercises.actions.ts` | ✅ |
| `coach/meal-groups/` | `_actions/meal-groups.actions.ts` | ✅ |
| `coach/recipes/` | `_actions/recipes.actions.ts` | ✅ |

**Nota IMPORTANTE para fat files:** `builder.actions.ts` y `client-detail.actions.ts` son copias directas. En F3-D+E deben ser reemplazados por versiones thin que deleguen a services. Tienen un import path fixeado:
- `builder.actions.ts` line 9: `../../../workout-programs/libraryStats` (era `../../`)
- `client-detail.actions.ts` lines 18-19: `../profileDataHelpers`, `../profileOverviewUtils` (eran `./`)

**F2-B en progreso (4/37+ page.tsx migradas):**

Rutas YA migradas a `_data/`:
- `coach/clients/page.tsx` → usa `getCoachClientsWithPrograms()` de `./_data/clients.queries`
- `coach/exercises/page.tsx` → usa `getExerciseCatalog()` de `./_data/exercises.queries`
- `coach/meal-groups/page.tsx` → usa `getMealGroups()` de `./_data/meal-groups.queries`
- `coach/workout-programs/page.tsx` → usa `getWorkoutProgramsWithClients()` de `./_data/workout-programs.queries`

**Rutas que FALTAN migrar en F2-B (tienen `createClient()` directo en page.tsx):**
- `apps/web/src/app/coach/settings/page.tsx`
- `apps/web/src/app/coach/layout.tsx`
- `apps/web/src/app/coach/builder/[clientId]/page.tsx`
- `apps/web/src/app/coach/recipes/[recipeId]/page.tsx` (si existe)
- `apps/web/src/app/coach/reactivate/page.tsx` (si existe)
- `apps/web/src/app/c/[coach_slug]/suspended/page.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/register/page.tsx`
- Todas las rutas `admin/(panel)/` que tienen queries inline
- Confirmar con: `grep -r "createClient" apps/web/src/app/**/page.tsx`

**F2-C completado:** Removido `'use server'` de `coach/meal-groups/page.tsx` (era RSC, no server action file)

---

## Lo que FALTA completar

### FASE 2 — Feature First (continuar F2-B)

Completar la migración de queries directas en page.tsx → `_data/`. Para cada ruta:
1. Leer el `page.tsx`
2. Extraer queries a `_data/routename.queries.ts` usando `React.cache`
3. Actualizar `page.tsx` para importar de `_data/`

**Patrón estándar:**
```typescript
// _data/routename.queries.ts
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getMyData = cache(async (coachId: string) => {
    const supabase = await createClient()
    const { data } = await supabase.from('table').select('...').eq('coach_id', coachId)
    return data ?? []
})
```

**Regla crítica:** page.tsx NUNCA llama `createClient()`. Solo importa de `_data/`.

### FASE 3 — Clean Architecture (TODO todo)

**F3-A: Crear `infrastructure/db/interfaces.ts`**
```typescript
// Definir interfaces para testabilidad con DI
export interface CoachRepository { findById, findBySlug, findByInviteCode }
export interface ClientRepository { findById, findsByCoach }
export interface WorkoutRepository { findProgramById, findPlansByProgram, upsertProgram, ... }
export interface NutritionRepository { findPlansByCoach, findMeals, logPortion, ... }
export interface AdminRepository { findCoachesPaginated, findClientsPaginated, findAuditLogs, ... }
```

**F3-B: Crear repositories faltantes:**
- `apps/web/src/infrastructure/db/workout.repository.ts`
- `apps/web/src/infrastructure/db/nutrition.repository.ts`
- `apps/web/src/infrastructure/db/admin.repository.ts`
- Actualizar `apps/web/src/infrastructure/db/index.ts`

Ya existen: `coach.repository.ts`, `client.repository.ts`, `org.repository.ts`

**F3-C: Migrar _data/ existentes a usar repositories:**
- `coach/dashboard/_data/dashboard.queries.ts` → `coach.repository.ts`
- `c/[coach_slug]/dashboard/_data/dashboard.queries.ts` → `client.repository.ts`
- `admin/(panel)/dashboard/_data/admin.queries.ts` → `admin.repository.ts`

**F3-D+E: Services y thin actions para fat files:**

Crear `apps/web/src/services/workout/workout.service.ts`:
```typescript
export async function saveWorkoutProgram(db, data): Promise<SaveProgramResult>
export async function duplicateProgram(db, sourceId, targetClientId): Promise<string>
export async function assignProgramToClients(db, programId, clientIds): Promise<AssignResult>
export async function syncProgramFromTemplate(db, templateId, clientId): Promise<string>
```

Crear `apps/web/src/services/client/client.service.ts`:
```typescript
export async function updateClientProfile(db, clientId, data)
export async function addPayment(db, data)
export async function deletePayment(db, paymentId)
export async function getWeeklyCompliance(db, clientId)
```

Después reescribir `coach/builder/[clientId]/_actions/builder.actions.ts` como thin:
```typescript
export async function saveWorkoutProgramAction(payload) {
    const parsed = WorkoutProgramSchema.safeParse(payload)
    if (!parsed.success) return { error: ... }
    const supabase = await createClient()
    const result = await saveWorkoutProgram(supabase, parsed.data)
    if (result.error) return { error: result.error }
    revalidatePath('/coach/builder')
    return { success: true }
}
```

**F3-F: Migrar lib/ queries → infrastructure:**
- `lib/coach/get-coach.ts` → re-export desde `coach.repository.ts`
- `lib/news/queries.ts` → delegar a `admin.repository.ts`

### FASE 4 — Atomics (TODO todo)

**F4-A: Completar barrel exports web**

`apps/web/src/components/atoms/index.ts` — FALTAN estos 16 exports:
```typescript
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
export { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command'
export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog'
export { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
export { GlassButton } from '@/components/ui/glass-button'
export { GlassCard } from '@/components/ui/glass-card'
export { ClampedIntInput } from '@/components/ui/clamped-int-input'
export { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
export { Sonner } from '@/components/ui/sonner'
```

Archivo actual: `apps/web/src/components/atoms/index.ts` (tiene 12 exports, necesita 28 total)

`apps/web/src/components/molecules/index.ts` — FALTAN:
```typescript
export { MiniSparkline } from '@/components/coach/MiniSparkline'
export { NewsBellButton } from '@/components/coach/NewsBellButton'
export { CheckInCard } from '@/components/coach/CheckInCard'
export { ClientCardV2Skeleton } from '@/components/coach/ClientCardV2Skeleton'
export { FoodListCompact } from '@/components/coach/FoodListCompact'
export { PwaNavButton } from '@/components/client/PwaNavButton'
export { SettingsModalTrigger } from '@/components/client/SettingsModalTrigger'
export { OfflineScreen } from '@/components/client/OfflineScreen'
```

`apps/web/src/components/organisms/index.ts` — FALTAN:
```typescript
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

**F4-B: Crear `packages/tokens/`**

Crear:
- `packages/tokens/theme.css` — CSS `@theme` con colores, radios, fonts (ver plan)
- `packages/tokens/index.ts` — objeto TS para runtime/mobile
- `packages/tokens/package.json` — `{"name": "@eva/tokens", "version": "1.0.0", "main": "./index.ts"}`
- Agregar `"@eva/tokens": "packages/tokens"` a `package.json` raíz

**F4-C: optimizePackageImports en `apps/web/next.config.ts`**
```typescript
experimental: {
    optimizePackageImports: ['@eva/schemas', '@eva/types', '@eva/tokens'],
}
```

**F4-D: Mobile component barrels**

Crear:
- `apps/mobile/components/atoms/index.ts`
- `apps/mobile/components/molecules/index.ts`
- `apps/mobile/components/organisms/index.ts`

(Ver plan completo para los exports exactos de cada uno — 35 componentes total)

**F4-E: Agregar alias en mobile tsconfig**
```json
// apps/mobile/tsconfig.json compilerOptions.paths
"@eva/tokens": ["../../packages/tokens/index.ts"]
```

---

## Comandos de verificación

```bash
# Typecheck web (debe ser 0 errores)
npm run typecheck -w @eva/web

# Typecheck mobile
cd apps/mobile && npx tsc --noEmit

# Tests
npx vitest run

# Build
npm run build -w @eva/web

# Verificar que no quedan createClient en page.tsx
grep -rn "createClient" apps/web/src/app/**/page.tsx

# Verificar que no quedan supabase.from en _actions/
grep -rn "supabase\.from" apps/web/src/app/**/_actions/
```

---

## Estado actual del typecheck

`npm run typecheck -w @eva/web` → **0 errores** (verificado al final de esta sesión)

---

## Archivos del plan

- Plan maestro: `C:\Users\juanm\.claude\plans\ok-primero-que-nada-declarative-bunny.md`
- Memoria del proyecto: `C:\Users\juanm\.claude\projects\d--Proyectos-Antigravity-gymappjp\memory\`
- Este handoff: `HANDOFF-ARCHITECTURE-SPRINT.md` (raíz del proyecto)

---

## Contexto técnico importante

- **Zod v4**: canonical import es `from 'zod'` (NO `from 'zod/v4'`)
- **Re-export pattern para actions:** `'use server'\nexport * from './_actions/name.actions'`
- **React.cache** va SOLO en `_data/*.queries.ts`, NO en repositories
- **page.tsx** nunca crea el cliente Supabase — siempre importa de `_data/`
- **Services nunca llaman otros services** — orquestación en server action
- **Fat files copiados** `builder.actions.ts` + `client-detail.actions.ts`: son COPIAS temporales en `_actions/`, deben ser reescritos como thin cuando se creen los services en F3
- **Mega-reestructuración previa**: Hubo una restructuración arquitectónica en mayo 2026. Si un archivo no está donde se espera, revisar `git log --all --full-history -- "**/archivo*"`

---

## Estructura de directorios nueva (esta sesión)

```
apps/web/src/app/
├── admin/login/_actions/login.actions.ts          (NEW)
├── c/[coach_slug]/_actions/client-root.actions.ts (NEW)
├── c/[coach_slug]/check-in/_actions/check-in.actions.ts (NEW)
├── c/[coach_slug]/login/_actions/login.actions.ts (NEW)
├── c/[coach_slug]/onboarding/_actions/onboarding.actions.ts (NEW)
├── c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.ts (NEW)
├── coach/builder/[clientId]/_actions/builder.actions.ts (NEW - copy of fat file)
├── coach/clients/_actions/clients.actions.ts      (NEW)
├── coach/clients/_data/clients.queries.ts         (NEW)
├── coach/clients/[clientId]/_actions/client-detail.actions.ts (NEW - copy of fat file)
├── coach/dashboard/_actions/dashboard.actions.ts  (NEW)
├── coach/exercises/_actions/exercises.actions.ts  (NEW)
├── coach/exercises/_data/exercises.queries.ts     (NEW)
├── coach/meal-groups/_actions/meal-groups.actions.ts (NEW)
├── coach/meal-groups/_data/meal-groups.queries.ts (NEW)
├── coach/recipes/_actions/recipes.actions.ts      (NEW)
├── coach/workout-programs/_data/workout-programs.queries.ts (NEW)
packages/schemas/
├── client.ts (UPDATED: CreateClientSchema, UpdateClientDataSchema)
├── coach.ts  (UPDATED: CloneExerciseSchema, RegisterCoachFreeSchema)
├── workout.ts (UPDATED: WorkoutLogSetSchema)
├── index.ts  (UPDATED: comments for mobile-safe vs server-only)
apps/mobile/
├── package.json (UPDATED: zod dep added)
├── app/(auth)/login.tsx (UPDATED: LoginSchema)
├── app/(auth)/register.tsx (UPDATED: RegisterCoachFreeSchema)
├── app/(auth)/forgot-password.tsx (UPDATED: ForgotPasswordSchema)
```
