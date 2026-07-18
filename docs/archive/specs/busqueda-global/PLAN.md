# Búsqueda global del topbar coach — PLAN

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-07-04
**Spec:** `specs/busqueda-global/SPEC.md`
**Informe fuente:** `docs/audits/fase-l-wl2/informe-deuda-tecnica.md` (ítem 1)

---

## Architecture

La búsqueda es **on-demand desde el cliente** (input con debounce), por lo que no
usa el flujo RSC/`_data`/preload. En su lugar:

- Un **servicio agregador** compone las 4 sub-búsquedas ya existentes con scope
  3-vías, respetando Clean Architecture (`services → repository/Supabase`).
- Un **route handler GET** expone el servicio, resolviendo identidad + scope
  server-side y aplicando rate-limit + validación Zod.
- Un **componente cliente** (`CoachGlobalSearch`) consume el endpoint con
  `fetch(signal)` y renderiza el dropdown combobox accesible.

Data flow (on-demand, no RSC):

```text
components/coach/CoachGlobalSearch.tsx  ('use client')
  -> GET /api/coach/search?q=...        (route handler: identidad+scope server-side, Zod, rate-limit)
     -> services/search/coach-search.service.ts   (agregador, scope 3-vías, Promise.all)
        -> queries/servicios existentes por dominio
           -> Supabase (columnas mínimas, LIMIT por grupo)
```

**Por qué route handler y no server action (decisión tomada):** la búsqueda
incremental con debounce + `AbortController` encaja natural con `fetch(signal)`;
las server actions no cancelan bien y hay un bug conocido de Next con navegación
durante una action con debounce (vercel/next.js#76936). El handler es el molde
exacto de `apps/web/src/app/api/recipes/search/route.ts`.

**Scope 3-vías (canónico, no se inventa):** `orgId = workspace.type ===
'enterprise_coach' ? workspace.orgId : null`, `activeTeamId = workspace.type ===
'coach_team' ? workspace.teamId : null` — patrón de
`apps/web/src/app/coach/clients/page.tsx:19-26`. Reusar el tipo `CoachClientScope`
de `clients.queries.ts`.

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `apps/web/src/services/search/coach-search.service.ts` | Agregador `searchCoachWorkspace(supabase, { coachId, scope, query, limitPerGroup })`; `Promise.all` de las 4 sub-búsquedas; columnas mínimas; scope 3-vías idéntico a las queries existentes. |
| CREATE | `apps/web/src/app/api/coach/search/route.ts` | GET `?q=`; molde de `api/recipes/search/route.ts`; identidad+scope server-side; Zod (`q` min 2, trim); rate-limit; JSON `CoachSearchResults`. |
| CREATE | `apps/web/src/components/coach/CoachGlobalSearch.tsx` | `'use client'`; combobox ARIA completo; `useDebounce` + `AbortController`; estados idle/loading/empty/results; grupos con cap 5. |
| UPDATE | `apps/web/src/services/nutrition-recipes.service.ts` | `searchCoachRecipes(scope, q)` (o param `q` en `listCoachRecipes`) con `ilike name`, columnas mínimas. |
| UPDATE | `apps/web/src/lib/rate-limit.ts` | `rateLimitCoachSearch` (espejo de `rateLimitRecipesSearch`). |
| UPDATE | `apps/web/src/components/coach/CoachTopBar.tsx` | Reemplazar el `<div>` de búsqueda (195-227) por `<CoachGlobalSearch/>`; preservar atajo `"/"` (useEffect 131-142) y estilos de foco. |
| REUSE | `apps/web/src/app/c/[coach_slug]/exercises/_data/exercises.queries.ts` | Reutilizar `buildExerciseSearchOr(query)` + `scopeFilter` (system ∪ scope) para la sub-búsqueda de ejercicios. |
| REUSE | `apps/web/src/lib/coach-context.ts` / `getPreferredWorkspaceForRender` | Resolución de identidad/workspace activo en el handler. |

### Contratos de tipo

```ts
type SearchHit = {
  id: string
  label: string
  sublabel?: string
  href: string
  thumbUrl?: string | null
}
type CoachSearchResults = {
  clients: SearchHit[]
  programs: SearchHit[]
  exercises: SearchHit[]
  recipes: SearchHit[]
}
```

### Sub-búsquedas (columnas mínimas + `href`)

| Grupo | Fuente | Columnas | Filtro | `href` |
|---|---|---|---|---|
| Alumnos | `clients` | `id, full_name, avatar_url` | scope 3-vías (idéntico a `getCoachClientsWithPrograms`) + `ilike full_name` | `/coach/clients/{id}` |
| Programas | `workout_programs` | `id, name, client_id` | scope 3-vías + `ilike name` | detalle de programa vigente (confirmar `href` al implementar) |
| Ejercicios | catálogo ejercicios | `id, name, muscle_group, thumbnail_url` | `buildExerciseSearchOr(q)` + `scopeFilter` (system ∪ scope) | catálogo con el ejercicio (`/coach/exercises?q=` o detalle vigente) |
| Recetas | `searchCoachRecipes(scope, q)` | mínimas (`id, name, image_url`) | `RecipeScope` (coach XOR team) + `ilike name` | detalle de receta vigente |

## Data Model

- **DB changes:** ninguno. Solo se leen tablas existentes (`clients`,
  `workout_programs`, catálogo de ejercicios, recetas) con columnas mínimas y
  `LIMIT` por grupo.
- **RLS impact:** ninguno. RLS es el techo; además se filtra explícitamente por
  scope activo para no cruzar workspaces (mismo criterio que `clients.queries.ts`).
- **GRANT impact:** ninguno (solo SELECT sobre columnas ya legibles por el coach).
- **Generated types impact:** ninguno (no cambia el schema).

## Server Actions

- **Ninguna.** La exposición es un **route handler GET**
  (`app/api/coach/search/route.ts`), no un server action (ver Architecture /
  Riesgos). No hay mutaciones, por lo tanto no hay `revalidatePath()`.
- Validación server-side: **Zod** sobre el query (`q`: string, trim, min 2). `q`
  corto → `{ clients:[], programs:[], exercises:[], recipes:[] }` sin golpear DB.

## UI/UX

- **Componente:** route-local en `components/coach/CoachGlobalSearch.tsx` (no
  atómico: es específico del dominio coach, usado en 1 lugar). Se extrae del topbar
  para no engordarlo.
- **Estructura ARIA (APG combobox + listbox):**
  - `<input role="combobox" aria-autocomplete="list" aria-expanded={open}
    aria-controls="coach-search-listbox" aria-activedescendant={activeId} />`.
  - `<ul role="listbox" id="coach-search-listbox">` con grupos "Alumnos /
    Programas / Ejercicios / Recetas" (encabezado no-focuseable + `role="group"`
    con `aria-label`), ítems `<li role="option" id=... aria-selected=...>`.
  - Foco DOM permanece en el input; selección visual vía `aria-activedescendant`
    (no `.focus()` en las opciones) + `scrollIntoView({ block:'nearest' })` manual.
- **Teclado:** `↓/↑` mueven `activeIndex` sobre la lista **aplanada** de hits con
  wrap; `Enter` navega al `href` del hit activo; `Escape` cierra y (si ya cerrado)
  limpia — respeta el `onKeyDown` actual de `CoachTopBar` (204-209). Atajo `"/"`
  (useEffect 131-142) preservado.
- **Estado:** `useState(query)` → `useDebounce(query, 220)` → `useEffect` que hace
  `fetch('/api/coach/search?q=', { signal })` con `AbortController` en `useRef`
  (abort en cleanup). Estados: idle / loading (spinner) / empty ("Sin resultados
  para …") / results.
- **Mobile viewport:** desktop-only; nada de `h-screen`/`100vh` fuera de `md:`. El
  dropdown se ancla al input dentro del `<header>` `hidden md:flex`.
- **Dark mode:** tokens EVA `--surface-*` (fondo dropdown), `--text-*` (labels /
  sublabels / encabezados de grupo), `--sport-*` (opción activa/hover). Verificar
  contraste de la opción activa en light y dark.

## Phases

Cada fase cierra con su gate (`pnpm typecheck` + Vitest de lo tocado). Playwright/E2E
y cualquier SQL contra PROD **solo con OK explícito del CEO**.

1. **Fase 1 — Capa de datos (agregador + recetas + rate-limit).**
   - `services/search/coach-search.service.ts` (agregador, scope 3-vías,
     `Promise.all`, columnas mínimas, limit por grupo; reusar `buildExerciseSearchOr`).
   - `searchCoachRecipes(scope, q)` en `nutrition-recipes.service.ts`.
   - `rateLimitCoachSearch` en `lib/rate-limit.ts`.
   - **Gate:** `pnpm typecheck` + Vitest del agregador (scope 3-vías, límites,
     query corta, no-fuga).
2. **Fase 2 — Route handler.**
   - `app/api/coach/search/route.ts`: GET + Zod + rate-limit + identidad/scope
     server-side + JSON.
   - **Gate:** `pnpm typecheck` + Vitest (si aplica al parseo/handler puro).
3. **Fase 3 — Presentación (combobox).**
   - `components/coach/CoachGlobalSearch.tsx` (ARIA completo, teclado, debounce +
     AbortController, estados, grupos con cap 5, dark mode).
   - Montar en `CoachTopBar.tsx` reemplazando el `<div>` 195-227; preservar `"/"`.
   - **Gate:** `pnpm typecheck` + `pnpm lint`.
4. **Fase 4 — QA visual + E2E (solo con OK del CEO).**
   - Capturas light/dark (desktop) + smoke de teclado; test E2E de no-fuga
     cross-workspace si el CEO lo autoriza.

## Test Plan

- **Unit (Vitest):** agregador `searchCoachWorkspace` — scope 3-vías
  (standalone/team-pool/enterprise) produce filtros distintos; cap por grupo;
  query `<2` chars retorna vacío sin golpear DB; forma de `CoachSearchResults`.
  Parseo Zod del handler (query corta/larga/trim).
- **Integration:** el handler deriva scope de sesión, no del query (no se puede
  inyectar `coachId/orgId/teamId` por query string).
- **E2E (Playwright, solo con OK CEO):** un coach de team no ve alumnos/programas
  de otro coach del pool fuera de la regla vigente; teclado `↓/↑/Enter/Esc`;
  navegación directa al `href`.
- **Manual:** light/dark en desktop; estados idle/loading/empty/results; atajo
  `"/"`; `scrollIntoView` de la opción activa fuera de viewport.

## Rollback Plan

Revert del componente es suficiente para volver a la cáscara: en `CoachTopBar.tsx`
restaurar el `<div>` de búsqueda (195-227) en lugar de `<CoachGlobalSearch/>`. El
route handler y el servicio quedan inertes (sin caller) y pueden borrarse en un
segundo commit. No hay estado de DB ni migración que revertir. `rateLimitCoachSearch`
y `searchCoachRecipes` son aditivos e inertes sin caller.
