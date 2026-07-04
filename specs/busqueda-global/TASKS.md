# Búsqueda global del topbar coach — TASKS

**Status:** COMPLETADO 2026-07-04
**Owner:** TBD
**Last updated:** 2026-07-04
**Spec:** `specs/busqueda-global/SPEC.md`
**Plan:** `specs/busqueda-global/PLAN.md`

---

## Tasks

### Fase 1 — Capa de datos

- [x] **T1 (M) — Servicio agregador `searchCoachWorkspace`** *(extra posterior 2026-07-04: thumbnails estáticos en resultados de ejercicios)*
  - Scope: crear `apps/web/src/services/search/coach-search.service.ts` con
    `searchCoachWorkspace(supabase, { coachId, scope, query, limitPerGroup=5 })`
    → `CoachSearchResults`. `scope: CoachClientScope` (reusar tipo de
    `clients.queries.ts`). `Promise.all` de las 4 sub-búsquedas, cada una con
    columnas mínimas y `LIMIT limitPerGroup`:
    - Alumnos: `clients.select('id, full_name, avatar_url')` + filtro scope 3-vías
      idéntico a `getCoachClientsWithPrograms` + `ilike full_name`.
    - Programas: `workout_programs.select('id, name, client_id')` + scope + `ilike name`.
    - Ejercicios: **reutilizar** `buildExerciseSearchOr(query)` + `scopeFilter`
      (system ∪ scope); columnas `id, name, muscle_group, thumbnail_url`.
    - Recetas: llamar `searchCoachRecipes(scope, query)` (T2).
  - Construir `SearchHit.href` por grupo (ver PLAN → Sub-búsquedas).
  - Verification: `pnpm typecheck` verde; Vitest de T7 pasa.
- [x] **T2 (S) — `searchCoachRecipes(scope, q)`**
  - Scope: en `apps/web/src/services/nutrition-recipes.service.ts`, agregar
    `searchCoachRecipes(scope, q)` (o param `q` en `listCoachRecipes`) con
    `ilike name` y columnas mínimas (`id, name, image_url`). Respeta `RecipeScope`
    (coach XOR team).
  - Verification: `pnpm typecheck`; consumido por T1.
- [x] **T3 (S) — `rateLimitCoachSearch`**
  - Scope: en `apps/web/src/lib/rate-limit.ts`, agregar `rateLimitCoachSearch`
    como espejo de `rateLimitRecipesSearch`. Degrada a "permitir" sin Redis.
  - Verification: `pnpm typecheck`.

### Fase 2 — Route handler

- [x] **T4 (M) — `GET /api/coach/search`**
  - Scope: crear `apps/web/src/app/api/coach/search/route.ts` con el molde de
    `api/recipes/search/route.ts`: `clientIpFromRequest` + `rateLimitCoachSearch`
    + `jsonRateLimited`. Resolver identidad + scope **server-side** (`getCoach()`
    + `getPreferredWorkspaceForRender()`), derivando `orgId/activeTeamId` del
    workspace activo — **nunca** del query string. Validar `q` con Zod (string,
    trim, min 2); `q` corto → resultados vacíos sin golpear DB. Llamar
    `searchCoachWorkspace`. Devolver `CoachSearchResults` JSON.
  - Verification: `pnpm typecheck`; smoke manual GET con sesión.

### Fase 3 — Presentación

- [x] **T5 (L) — `CoachGlobalSearch.tsx` (combobox ARIA)**
  - Scope: crear `apps/web/src/components/coach/CoachGlobalSearch.tsx` (`'use client'`):
    - ARIA APG: `input role="combobox"` (`aria-autocomplete="list"`,
      `aria-expanded`, `aria-controls="coach-search-listbox"`,
      `aria-activedescendant`); `ul role="listbox"` con grupos `role="group"` +
      `aria-label`, ítems `li role="option"` + `aria-selected`.
    - Teclado: `↓/↑` mueven opción activa sobre lista aplanada con wrap +
      `scrollIntoView({ block:'nearest' })`; `Enter` navega al `href`; `Escape`
      cierra y (si cerrado) limpia.
    - Datos: `useState(query)` → `useDebounce(query, 220)` → `useEffect` con
      `fetch('/api/coach/search?q=', { signal })`, `AbortController` en `useRef`,
      abort en cleanup.
    - Estados: idle / loading (spinner) / empty ("Sin resultados para …") /
      results. Grupos con cap 5. Dark mode con tokens `--surface-*`/`--text-*`/`--sport-*`.
  - Verification: `pnpm typecheck` + `pnpm lint`; smoke manual teclado + dark.
- [x] **T6 (S) — Montar en `CoachTopBar.tsx`**
  - Scope: en `apps/web/src/components/coach/CoachTopBar.tsx`, reemplazar el
    `<div>` de búsqueda (líneas 195-227) por `<CoachGlobalSearch/>`. Preservar el
    atajo `"/"` (useEffect 131-142) y los estilos de foco. Borrar el comentario de
    "DIFERIDO" (191-194).
  - Verification: `pnpm typecheck` + `pnpm lint`; la búsqueda no aparece en `<md`
    (topbar `hidden md:flex`).

### Tests

- [x] **T7 (S) — Tests unitarios del agregador**
  - Scope: Vitest sobre `searchCoachWorkspace` (función/composición pura testeable):
    scope 3-vías produce filtros distintos; cap por grupo respetado; query `<2`
    chars retorna vacío sin golpear DB; **no-fuga cross-workspace** (un scope de
    team no incluye ítems de otro coach fuera de la regla del pool); forma de
    `CoachSearchResults`.
  - Verification: `npx vitest run` del archivo verde.

### Fase 4 — QA (solo con OK del CEO)

- [x] **T8 (S) — QA visual + E2E**
  - Scope: capturas light/dark (desktop 1440); smoke de teclado; E2E Playwright de
    no-fuga cross-workspace **solo si el CEO autoriza**. Cualquier SQL contra PROD
    requiere OK explícito.
  - Verification: capturas adjuntas + E2E verde (si autorizado).

## Universal Definition of Done

- [x] `pnpm typecheck`
- [x] Targeted tests for touched domain (Vitest del agregador)
- [x] No direct feature-data Supabase calls in `_data` (la búsqueda no usa `_data`;
  el acceso va por el servicio agregador)
- [x] Route handler valida con Zod (no hay server action en esta feature)
- [x] Sin mutaciones → no aplica `revalidatePath()`
- [x] Mobile viewport uses `dvh`, not `vh`/`h-screen` (feature desktop-only; no se
  introduce `100vh` fuera de `md:`)
- [x] Fixed edge UI uses safe-area utilities (n/a — dropdown anclado al topbar)
- [x] Dark mode checked (dropdown, grupos, opción activa, estados)
- [x] New atomic UI has Storybook story (n/a — componente route-local del coach)
- [x] Docs updated si cambian rutas/flows (registrar `/api/coach/search` en el mapa
  de flujos si corresponde)

## Notes

- **Cero fuga cross-scope es criterio de aceptación duro:** el scope sale SIEMPRE
  de la sesión/JWT server-side, jamás del query. Replica el scope de las queries
  existentes; no inventa política nueva.
- No reusar `getCoachClientsWithPrograms` tal cual (usa `SELECT *`): la búsqueda
  usa columnas mínimas.
- Preservar el comportamiento del atajo `"/"` y del `Escape` existentes.
