# PLAN — Custom Exercise Creator

## Arquitectura

Reusa tabla `exercises` existente (ya tiene `coach_id` nullable, `video_url`, `gif_url`, etc.). Agregar:
- Columna `deleted_at timestamptz` (nullable) — soft-delete.
- Columna `source text DEFAULT 'manual'` — tracking origen.
- RLS habilitada con policies aditivas: SELECT permite `coach_id IS NULL` (sistema) + `coach_id = auth.uid()` (propios). INSERT/UPDATE/DELETE solo dueño.

Sigue Clean Architecture per CLAUDE.md:
- `domain/` — no aplica en master aún (módulo simple).
- `infrastructure/` — query directa a Supabase desde `_data/`.
- `services/` — no requerido (lógica simple, vive en server action).
- `app/coach/exercises/` — módulo con `_data/_actions/_components` (module pattern).

## Database changes

3 migrations expand-contract:

### Migration 1: `<ts>_exercises_add_columns_safe.sql`
```sql
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
CREATE INDEX CONCURRENTLY IF NOT EXISTS exercises_coach_id_active_idx
  ON exercises (coach_id) WHERE deleted_at IS NULL;
```
Aditiva pura. Cero impacto en queries existentes.

### Migration 2: `<ts>_exercises_enable_rls_with_permissive_policy.sql`
```sql
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY exercises_select_visible ON exercises FOR SELECT
  USING (coach_id IS NULL OR coach_id = auth.uid());
CREATE POLICY exercises_insert_own ON exercises FOR INSERT
  WITH CHECK (coach_id = auth.uid());
CREATE POLICY exercises_update_own ON exercises FOR UPDATE
  USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY exercises_delete_own ON exercises FOR DELETE
  USING (coach_id = auth.uid());
```
Requiere pre-check: 0 rows huérfanos antes de aplicar.

### Pre-check (manual, no migration)
```sql
SELECT count(*) FROM exercises e
  WHERE e.coach_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM coaches c WHERE c.id = e.coach_id);
-- Esperado: 0
```

### Sin migration p/ YouTube URL validation
App-layer only — CHECK constraint rompería rows existentes con URLs no normalizadas.

## Capa de datos

**Archivo nuevo `src/app/coach/exercises/_data/exercises.queries.ts`**:
- `getMyAndSystemExercises()` con `React.cache`.
- Reuso `EXERCISE_CATALOG_COLUMNS` de `src/lib/exercises/exercise-catalog-select.ts`.

```ts
export const getMyAndSystemExercises = cache(async () => {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return supabase.from('exercises')
    .select(EXERCISE_CATALOG_COLUMNS)
    .or(`coach_id.is.null,coach_id.eq.${user.id}`)
    .is('deleted_at', null)
    .order('name')
})
```

## Helpers nuevos

### `src/lib/youtube.ts` (puro, sin red)
- `extractYoutubeVideoId(url: string): string | null` — regex cubre `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`, `youtube.com/shorts/`, `m.youtube.com/...`.
- `normalizeYoutubeEmbedUrl(url: string): string | null` → `https://www.youtube-nocookie.com/embed/{id}?rel=0&modestbranding=1`.
- `getYoutubeThumbnailUrl(url: string, quality?: 'default'|'mq'|'hq'|'maxres'): string | null`.
- `isYoutubeUrl(url: string): boolean`.

Host whitelist hardcoded — rechaza `youtube.com.evil.com`.

## Server actions

**Archivo `src/app/coach/exercises/_actions/exercise.actions.ts`**:

```ts
'use server'

const exerciseSchema = z.object({
  name: z.string().min(2).max(100),
  muscle_group: z.string().min(1),
  secondary_muscles: z.array(z.string()).optional().default([]),
  equipment: z.string().optional(),
  difficulty: z.enum(['principiante','intermedio','avanzado']).optional(),
  body_part: z.string().optional(),
  youtube_url: z.string().url().refine(isYoutubeUrl, 'URL de YouTube inválida'),
  instructions: z.array(z.string()).optional().default([]),
})

export async function createExerciseAction(input: unknown) {
  // 1. auth + tier gate
  // 2. validate
  // 3. normalize YouTube URL
  // 4. insert con coach_id, source='coach'
  // 5. revalidatePath
}

export async function updateExerciseAction(id: string, input: unknown) { /* ... */ }
export async function softDeleteExerciseAction(id: string) { /* ... */ }
```

## UI components

### Página `src/app/coach/exercises/page.tsx`
RSC. Si free → `<UpsellGate gate="custom_exercises" />`. Si starter+ → `<ExercisesPageClient initialExercises={...} />`.

### `_components/ExercisesPageClient.tsx` ('use client')
Header + SearchBar + Filters + Grid + FAB mobile. Estado local `useState` para search/filters.

### `_components/ExerciseFormModal.tsx` ('use client')
RHF + Zod v4. Single-page form 7 campos. Live preview YouTube iframe a la derecha (desktop) / abajo (mobile). Reusable en builder.

### `_components/ExerciseCard.tsx`
Thumbnail YouTube (`mqdefault.jpg`) o placeholder SVG. Badge `EVA` vs `Mío`. Hover overlay con `Editar` / `Ver video`.

### `_components/ExerciseFilters.tsx`
Chip row scrollable: grupo muscular, equipo, patrón movimiento, origen.

### `_components/ExerciseSearchBar.tsx`
Input con debounce 200ms.

### `_components/ExercisesGrid.tsx`
Grid responsive (1/2/3-4 cols).

### `loading.tsx`
Skeleton grid.

## Iframe security

```tsx
<iframe
  src={normalizeYoutubeEmbedUrl(video_url)!}
  sandbox="allow-scripts allow-same-origin allow-presentation"
  loading="lazy"
  referrerPolicy="strict-origin-when-cross-origin"
  allow="encrypted-media; picture-in-picture"
  className="aspect-video w-full rounded-lg"
  title={exercise.name}
/>
```

CSP en `next.config.ts`:
```
frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com
img-src 'self' data: https://i.ytimg.com [...otros]
```

## Tier gating

**Modificar `src/lib/constants.ts:129-166`**:
- Agregar `canCreateCustomExercises: boolean` a `TierCapabilities`.
- `free: false`, `starter+: true`.

**Reusable `src/components/upgrade/UpsellGate.tsx`** (refactor de `coach/settings/page.tsx`):
- Props: `gate: 'custom_exercises' | 'import_clients' | 'branding' | ...`, `currentTier: SubscriptionTier`.
- Copy + ilustración por gate.
- CTA `/coach/subscription?upgrade=starter`.
- Renderiza `<UpgradeGateTracker gate={gate} currentTier={tier} />`.

## Integración con Builder

**Modificar `src/app/coach/builder/[clientId]/DraggableExerciseCatalog.tsx`**:
- Botón `+ Crear ejercicio` arriba de la lista.
- onClick → abre `ExerciseFormModal` (importado).
- Al crear → refetch + scroll + flash highlight 2s al nuevo.
- Filtros mejorados: chip "Sistema/Míos" toggle.

## Fases de implementación

**Fase 1: Specs + helpers + migrations (este commit set)**
- Specs (SPEC/PLAN/TASKS) ✓
- `src/lib/youtube.ts` + tests
- 3 migrations (files only, no apply prod)

**Fase 2: Tier gating + UpsellGate refactor**
- `src/lib/constants.ts` capabilities
- `src/components/upgrade/UpsellGate.tsx` extraído de `coach/settings/page.tsx`
- `coach/settings/page.tsx` adopta UpsellGate

**Fase 3: Backend exercises**
- Server actions
- Queries
- Tests unit

**Fase 4: UI `/coach/exercises`**
- Página + módulo completo
- Skeleton + empty states

**Fase 5: Integración Builder**
- Botón `+ Crear` en DraggableExerciseCatalog
- Modal reusado

**Fase 6: E2E tests + CSP**
- Playwright happy path
- next.config CSP updates
- Manual QA prod-ready

## Verificación

Ver `TASKS.md` para checklist DoD.
