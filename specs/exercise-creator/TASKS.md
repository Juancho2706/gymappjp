# TASKS — Custom Exercise Creator

## Fase 1: Foundations (specs + helpers + migrations)

- [x] Create branch `feat/exercise-creator-and-excel-import` from master
- [x] Write SPEC.md
- [x] Write PLAN.md
- [x] Write TASKS.md
- [ ] Create `src/lib/youtube.ts`:
  - [ ] `extractYoutubeVideoId(url)`
  - [ ] `normalizeYoutubeEmbedUrl(url)`
  - [ ] `getYoutubeThumbnailUrl(url, quality?)`
  - [ ] `isYoutubeUrl(url)`
- [ ] Create `src/lib/youtube.test.ts` — 15+ casos (watch?v=, youtu.be, embed, shorts, m.youtube, query params extra, malformadas, atacante `youtube.com.evil.com`)
- [ ] Run `npm run test src/lib/youtube.test.ts` → passes
- [ ] Create migration `<ts>_exercises_add_columns_safe.sql` (ADD COLUMN deleted_at + source + index CONCURRENTLY)
- [ ] Create migration `<ts>_exercises_enable_rls_with_permissive_policy.sql` (RLS ON + 4 policies)
- [ ] Document pre-check SQL en migration header comment
- [ ] Test migrations local: `npx supabase db reset` → typecheck passes
- [ ] Regenerate `src/lib/database.types.ts`

## Fase 2: Tier gating

- [ ] Modify `src/lib/constants.ts`:
  - [ ] Add `canCreateCustomExercises: boolean` a `TierCapabilities` type
  - [ ] Update `TIER_CAPABILITIES` map (free: false, starter+: true)
- [ ] Create `src/components/upgrade/UpsellGate.tsx`:
  - [ ] Props `gate`, `currentTier`
  - [ ] Variants por gate (custom_exercises, import_clients, branding)
  - [ ] Renderiza `UpgradeGateTracker`
- [ ] Refactor `src/app/coach/settings/page.tsx` para usar `UpsellGate gate="branding"` (verifica equivalencia visual)

## Fase 3: Backend

- [ ] Create `src/app/coach/exercises/_data/exercises.queries.ts`:
  - [ ] `getMyAndSystemExercises()` con React.cache
- [ ] Create `src/app/coach/exercises/_actions/exercise.actions.ts`:
  - [ ] `createExerciseAction`
  - [ ] `updateExerciseAction`
  - [ ] `softDeleteExerciseAction`
  - [ ] Zod schema + tier guard server-side
- [ ] Create `src/app/coach/exercises/_actions/exercise.actions.test.ts`:
  - [ ] Tier gate (free → upgrade_required)
  - [ ] YouTube URL validation
  - [ ] Owner check (coach A no puede update/delete de B)

## Fase 4: UI `/coach/exercises`

- [ ] Create `src/app/coach/exercises/page.tsx` (RSC, gate)
- [ ] Create `src/app/coach/exercises/loading.tsx` (skeleton)
- [ ] Create `_components/ExercisesPageClient.tsx`
- [ ] Create `_components/ExerciseFormModal.tsx` (RHF + Zod + live preview)
- [ ] Create `_components/ExerciseCard.tsx` (thumbnail + badge + overlay)
- [ ] Create `_components/ExerciseFilters.tsx` (chip row)
- [ ] Create `_components/ExerciseSearchBar.tsx` (debounce 200ms)
- [ ] Create `_components/ExercisesGrid.tsx`
- [ ] Empty state ilustrado (starter+ sin ejercicios)
- [ ] Mobile responsive (h-dvh, FAB pb-safe)
- [ ] Dark mode variants

## Fase 5: Integración Builder

- [ ] Modify `src/app/coach/builder/[clientId]/DraggableExerciseCatalog.tsx`:
  - [ ] Botón `+ Crear ejercicio` header
  - [ ] Import + abre `ExerciseFormModal`
  - [ ] Post-create: refetch + scroll + flash highlight
  - [ ] Chip filter "Sistema/Míos"

## Fase 6: CSP + E2E

- [ ] Modify `next.config.ts`:
  - [ ] Add `frame-src https://www.youtube-nocookie.com https://www.youtube.com`
  - [ ] Add `img-src https://i.ytimg.com`
- [ ] Create `tests/e2e/exercise-creator.spec.ts`:
  - [ ] Free coach ve UpsellGate
  - [ ] Starter+ crea ejercicio
  - [ ] Aparece en builder picker
  - [ ] Coach B no ve ejercicio de coach A
  - [ ] Soft-delete oculta de picker pero mantiene en plan histórico
  - [ ] URL atacante rechazada
- [ ] Adapt `tests/enterprise/rls-isolation.spec.ts` para exercises
- [ ] Run full E2E: `npm run test:e2e -- exercise-creator`

## DoD (Definition of Done)

- [ ] Todos los AC del SPEC.md cumplidos
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run test:e2e` passes para suite exercise-creator
- [ ] Migration pre-check ejecutada en prod manual → resultado 0
- [ ] Migrations probadas en preview branch Supabase
- [ ] Rollback documentado y testeado en staging
- [ ] CSP no rompe otras páginas (verificar landing, dashboard, builder)
- [ ] PR review aprobada
- [ ] Pre-deploy checklist completo (ver PLAN.md sección rollout)
