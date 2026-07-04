# Informe — Deuda técnica menor del rediseño EVA DS (3 ítems)

> Rama: `feat/redesign-eva-design-system`. App web: `apps/web` (Next.js App Router + Supabase + Tailwind v4).
> Investigación de sólo lectura. Ningún archivo de producto fue modificado.
> Fecha: 2026-07-04.

Los tres ítems son independientes y pueden ejecutarse en cualquier orden. Resumen de tamaño:
- **Ítem 1 (búsqueda global):** el más grande — arquitectura nueva de query/route + dropdown accesible. ~L.
- **Ítem 2 (borrar `LogoUploadForm.tsx`):** trivial — ~S. Confirmado dead code.
- **Ítem 3 (QA visual team/bodycomp/aprender):** medio — mayormente seed + capturas. ~M (team) + S (bodycomp/aprender).

---

## Estado actual (archivos:líneas concretos)

### Ítem 1 — Búsqueda global del topbar coach

**Superficie visual (lo que ya existe):**
- `apps/web/src/components/coach/CoachTopBar.tsx`
  - Input de búsqueda: líneas **199-227** (`type="search"`, valor controlado por `query`/`setQuery` en la línea **125**, `onKeyDown` de `Escape` limpia+desenfoca **204-209**, botón `×` para limpiar **214-226**).
  - Atajo `"/"` que enfoca el input: `useEffect` **131-142** (ignora si el foco ya está en `input/textarea/select`/contentEditable).
  - Comentario que difiere el dropdown real: **191-194** — *"DIFERIDO a la ola de datos: el dropdown de resultados agrupados (Alumnos/Programas/Ejercicios/Recetas) requiere endpoints reales de búsqueda."*
  - El `<header>` es **desktop-only** (`hidden ... md:flex`, línea **158**). En `<md` cada pantalla trae su propio header → **la búsqueda global es una feature de escritorio; mobile queda fuera de alcance.**
  - Devuelve `null` en el builder (líneas **145-147**) — la búsqueda no existe ahí.
- El topbar se monta en `apps/web/src/app/coach/layout.tsx` líneas **271-278**. El layout ya resuelve todo el contexto que la búsqueda necesita: `getCoach()` (línea **53**), `getPreferredWorkspaceForRender(coach.id)` (**65-68**), y deriva `activeEnterpriseCoach` / `activeTeamWorkspace` (**69-70**). Hoy esos datos NO se pasan al `CoachTopBar` (sólo `coachName/coachBrand/logoUrl/workspaces/currentWorkspaceLabel`).

**Capas de datos ya existentes que la búsqueda debe reutilizar (Clean Arch `_data → services → repository → Supabase`):**

| Dominio | Query/servicio existente | Scoping | Notas |
|---|---|---|---|
| Alumnos | `getCoachClientsWithPrograms(coachId, scope)` en `apps/web/src/app/coach/clients/_data/clients.queries.ts:22-42` | `CoachClientScope = { orgId, activeTeamId }` (3 vías: enterprise / team-pool / standalone) | Usa `SELECT *` — para búsqueda hay que acotar columnas. |
| Programas | `getWorkoutProgramsWithClients(coachId, scope)` en `apps/web/src/app/coach/workout-programs/_data/workout-programs.queries.ts:15-75` | mismo `CoachClientScope`; pool usa `or(...)` de `client_id.in` | Trae plantillas + programas del pool. |
| Ejercicios | `buildExerciseSearchOr(search)` + `fetchExercisePage(...)` en `apps/web/src/app/c/[coach_slug]/exercises/_data/exercises.queries.ts:77-126` | `scopeFilter` = system ∪ (org\|team\|coach) | **Ya resuelve búsqueda server-side** con `ilike` + sinónimos `MUSCLE_MAPPING`. Reutilizable casi tal cual. |
| Recetas | `getCoachRecipes(scope)` → `listCoachRecipes(supabase, scope)` en `apps/web/src/app/coach/nutrition-plans/_data/recipes.queries.ts:17-22` (servicio `services/nutrition-recipes.service.ts`, tipo `RecipeScope`) | `RecipeScope` (coach XOR team) | Sigue el flujo `_data→service` correcto. |

**Resolución de scope (patrón canónico ya usado):** `apps/web/src/app/coach/clients/page.tsx:19-26` — `getCoach()` + `getPreferredWorkspaceForRender()` → `orgId = workspace.type==='enterprise_coach' ? workspace.orgId : null`, `activeTeamId = workspace.type==='coach_team' ? workspace.teamId : null`. Contexto JWT alternativo: `getCoachOrgContext()` en `apps/web/src/lib/coach-context.ts:10-81`.

**Infra reutilizable (no hay que inventar):**
- Patrón de **route handler GET con rate-limit**: `apps/web/src/app/api/recipes/search/route.ts:6-9` (`clientIpFromRequest` + `rateLimit*` + `jsonRateLimited`). Es el molde exacto para `/api/coach/search`.
- **Componente de command/list accesible ya en el repo**: `apps/web/src/components/ui/command.tsx` (cmdk, con `CommandGroup`/`CommandItem`/`CommandList`). Ya se usa en `admin/(panel)/coaches/_components/CoachCommandPanel.tsx` y `org/[slug]/_components/OrgEnterpriseNav.tsx`.
- **Hook de debounce**: ya hay `useDebounce` en el repo (usos en `apps/web/src/app/coach/foods/_components/FoodBrowser.tsx`, `apps/web/src/app/c/[coach_slug]/exercises/ClientExerciseCatalog.tsx`, `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilder.tsx`, etc.).

**Conclusión ítem 1:** toda la plomería de datos existe; falta (a) un **agregador de búsqueda** con scope 3-vías que devuelva las 4 categorías con columnas mínimas, (b) un **route handler** (o server action) que lo exponga, y (c) el **dropdown combobox accesible** dentro de `CoachTopBar`.

### Ítem 2 — `LogoUploadForm.tsx` (dead code)

- Archivo: `apps/web/src/app/coach/settings/LogoUploadForm.tsx` (185 líneas). Exporta `LogoUploadForm` (línea **30**).
- **Cero importadores**: `grep "LogoUploadForm"` sobre todo `apps/web/src` devuelve **sólo la línea de la definición** (`LogoUploadForm.tsx:30`). Ningún `import`, ningún `dynamic(() => import(...))`.
- El uploader de logo **vivo** es otro: `apps/web/src/app/coach/settings/BrandSettingsForm.tsx`, que sí consume `updateLogoAction` (de `_actions/settings.actions.ts`). Es decir, **borrar `LogoUploadForm.tsx` no deja huérfana la server action** — `updateLogoAction` conserva su caller.
- Detalle menor: `LogoUploadForm.tsx:102` tiene `data-tour-id="brand-logo"`. Hay que confirmar que el tour (`_components/BrandSettingsTour.tsx`) apunta al elemento que **sí** se renderiza hoy (el de `BrandSettingsForm`), no a este muerto. Casi con certeza ya apunta al vivo (si no, el tour estaría roto en prod).

**Conclusión ítem 2:** dead code confirmado. Borrado seguro de un solo archivo.

### Ítem 3 — QA visual: Equipo / Composición corporal / Aprender

Cuenta QA: **josefit** (`coach_id 503412d0-77cc-4c7e-b1c2-dec81fb00ce6`). Datos verificados en PROD vía Supabase (sólo lectura):

- `enabled_modules` de josefit: `{ cardio:true, body_composition:true, movement_assessment:true, nutrition_exchanges:true }` → **el módulo bodycomp ya está ON**.
- Ejercicios globales (catálogo "Aprender"): **839 filas** (`coach_id/org_id/team_id NULL`, `deleted_at NULL`).
- Alumnos de josefit: 18 totales; **2** con `team_id` (pool); **1** membresía de team activa.
- Filas `body_composition_measurements` de alumnos de josefit: **8**.

**(a) Equipo — `/coach/team`**
- Página: `apps/web/src/app/coach/team/page.tsx`. Guard: `getPreferredWorkspaceForRender(user.id)`; si `workspace?.type !== 'coach_team'` → `redirect('/coach/dashboard')` (línea **24**). Datos: `getCoachTeamOverview(workspace.teamId)` (`_data/team.queries.ts:45-132`).
- Render: desktop `CoachTeamDesktop` (`_components/CoachTeamDesktop.tsx`, línea **68-70**); mobile = `<section className="... md:hidden">` verbatim (**73-193**) con hero, anillo SVG de cupos, `TeamShareLink`, `TeamBrandStudio`, `TeamMembersManager`.
- **Estado real del team:** josefit **es owner** de un team llamado **"Movida (test)"** (`team_id d0d0d0d0-0000-0000-0000-000000000001`, slug `movida-test`, `seat_limit 30`) pero está **casi vacío: 1 miembro activo (el propio josefit) y 2 alumnos de pool**. Con eso la vista se ve pobre: el `studentsByCoach` (badge "{n} alumnos" por coach, `team.queries.ts:80-83`) y el maestro-detalle de miembros no tienen material.
- **Gotcha de acceso:** josefit es **multi-workspace** (standalone + `coach_team`). Con `workspaces.length > 1` y sin preferencia guardada, `pickPreferredWorkspace` devuelve `null` (`services/auth/workspace.service.ts:198-208`) → post-login cae al selector `/workspace/select`. Para QA de `/coach/team` **hay que activar el workspace "Movida (test) - Equipo"** (el `CoachTopBar` con multi-workspace enlaza a `/workspace/select`, línea **240-241**).

**(b) Composición corporal — módulo bodycomp**
- Vista coach: `apps/web/src/app/coach/clients/[clientId]/bodycomp/page.tsx` → `getClientBodyComposition(clientId)` (`_data/body-composition.queries.ts:38-78`). Gating server-side: `assertBodyCompositionEnabled()` (kill-switch+entitlement) → `assertCoachClientWriteAccess` → `assertModule('body_composition', ctx)`. Estados: `module_off` (aviso `ModuleOffNotice`), `not_found`, `ok`. Render: `BodyCompositionTabB6b` con `bia[]` + `isak[]`.
- Vista alumno: `apps/web/src/app/c/[coach_slug]/bodycomp/_data/bodycomp.queries.ts` → `getStudentBodyComposition()` (read-only, usa service-role sólo para leer `enabled_modules`).
- Tabla/columnas: `body_composition_measurements` (repo `apps/web/src/infrastructure/db/body-composition.repository.ts`, `LIST_COLUMNS` línea **22-25**: `method` ∈ `bia|isak`, `measured_at`, `weight_kg`, `metrics` jsonb, etc.).
- **Datos ya sembrados (suficientes para QA mínimo):** `Demo Alumno Josefit` tiene **3 BIA + 2 ISAK**; `Carolina` 1 BIA + 1 ISAK; `Rosario` 1 ISAK. Con "Demo Alumno Josefit" alcanza para ver el módulo con serie temporal (tendencia). Se puede densificar para un gráfico más rico, pero **no es bloqueante**.

**(c) Aprender — `/c/[coach_slug]/exercises`**
- **Ruta confirmada:** NO existe `/coach/learn`. "Aprender" es la etiqueta del catálogo de ejercicios del **alumno**: `apps/web/src/app/c/[coach_slug]/exercises/page.tsx` (`metadata.title = "Aprender"`, `<h1>Aprender</h1>` líneas **9, 37, 52**). En el nav del alumno la entrada "Aprender" apunta a `${base}/exercises` (`components/client/ClientNav.tsx:111`).
- Datos: `getClientExerciseCatalogData(initialSearch)` (`_data/exercises.queries.ts:153-180`) — paginación real server-side (`CATALOG_PAGE_SIZE = 30`), búsqueda `ilike` + chips de músculo. **Usa el catálogo global (839 filas) → no requiere seed**; sólo hace falta **loguearse como un alumno de josefit** (p.ej. "Demo Alumno Josefit" o cualquiera de los QA `@josefit-designqa.cl`).

**Mecanismo de seed reversible existente:**
- `scripts/seed-josefit-design-qa.mjs` (+ manifest `scripts/seed-josefit-design-qa.json`). `--down` borra todo (líneas **264-285**), idempotente, guardrail estricto: sólo toca clientes con email `@josefit-designqa.cl` bajo `coach_id 503412d0`. Usa `SUPABASE_SERVICE_ROLE_KEY` de `.env.local`.
- **Limitación clave:** ese seed crea **sólo alumnos STANDALONE** (`org_id: null, team_id: null`, líneas **319-320**). **No** siembra miembros de team ni alumnos de pool. Por eso el team "Movida (test)" está vacío. → Para QA de Equipo hace falta un **script nuevo** (o extensión) que cree coaches-miembros + `team_members` + alumnos con `team_id` = `d0d0d0d0-...0001`.

---

## Investigación web 2026 (fuentes)

**Combobox + listbox accesible (fuente normativa, W3C APG):**
- Popup de autocompletar = **combobox editable con list autocomplete**. El input lleva `role="combobox"`, `aria-autocomplete="list"`, `aria-controls="<id listbox>"`, `aria-expanded`, y `aria-activedescendant="<id opción activa>"`. El popup es `role="listbox"` con hijos `role="option"` (+ `aria-selected` en la activa). **El foco DOM permanece en el input**; la "visual focus" se mueve con `aria-activedescendant` (no con `.focus()` en las opciones). Teclas: `Down/Up` abren/mueven por opciones (con wrap), `Enter` selecciona y cierra, `Escape` limpia o cierra, teclear devuelve foco al textbox y filtra. El navegador **no** auto-scrollea al elemento de `aria-activedescendant` → hay que hacer `scrollIntoView` manual al cambiar de opción. Grupos: usar el patrón de *Listbox with Grouped Options* (opciones agrupadas con encabezado de grupo). Fuentes:
  - https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/
  - https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
  - https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-grouped/
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/combobox_role

**Command palette / búsqueda global agrupada (patrones UX 2026):**
- Consenso: operable 100% por teclado, resultados **agrupados por categoría con encabezado + separador visual**, la primera opción resaltada al abrir, resultados casi-instantáneos (caching + carga asíncrona + componentes ligeros). Fuentes:
  - https://uxpatterns.dev/patterns/advanced/command-palette
  - https://mobbin.com/glossary/command-palette
  - https://solomon.io/designing-command-palettes/
  - https://www.designrush.com/best-designs/websites/trends/search-ux-best-practices

**Debounce + cancelación de respuestas stale (React 2026):**
- Debounce y `AbortController` resuelven problemas **distintos** y se usan **juntos**: el debounce reduce la frecuencia de disparo (~200-300 ms); el `AbortController` cancela requests en vuelo y **evita que una respuesta vieja pise a la nueva** (race condition). Guardar el controller en `useRef`, abortar en el cleanup del `useEffect`. Fuentes:
  - https://medium.com/@velja/delaying-debouncing-and-cancelling-request-using-abortcontoller-in-react-d8e089bfce14
  - https://www.opcito.com/blogs/cancel-api-requests-react-abortcontroller
  - https://sergiodxa.com/tutorials/debounce-loaders-and-actions-in-react-router

---

## Diseño propuesto

### Ítem 1 — Búsqueda global (arquitectura por capas)

**Capa de datos (nueva, respetando `_data → services → repository → Supabase`):**
- Nuevo servicio agregador `apps/web/src/services/search/coach-search.service.ts`:
  - Firma: `searchCoachWorkspace(supabase, { coachId, scope, query, limitPerGroup=5 }): Promise<CoachSearchResults>`, con `scope: CoachClientScope` (reusar el tipo de `clients.queries.ts`) y `CoachSearchResults = { clients: SearchHit[]; programs: SearchHit[]; exercises: SearchHit[]; recipes: SearchHit[] }`.
  - `SearchHit = { id: string; label: string; sublabel?: string; href: string; thumbUrl?: string | null }`.
  - Ejecuta las 4 sub-búsquedas en `Promise.all`, cada una con **columnas mínimas** y `LIMIT limitPerGroup`:
    - Alumnos: `from('clients').select('id, full_name, avatar_url')` + filtro de scope 3-vías idéntico a `getCoachClientsWithPrograms` + `.ilike('full_name', %q%)`. `href = /coach/clients/{id}`.
    - Programas: `from('workout_programs').select('id, name, client_id')` + scope + `.ilike('name', %q%)`. `href = /coach/workout-programs?programId={id}` (o la ruta de detalle vigente).
    - Ejercicios: **reutilizar** `buildExerciseSearchOr(query)` + el `scopeFilter` de `exercises` (system ∪ scope). Columnas de `EXERCISE_LIST_COLUMNS` recortadas a `id, name, muscle_group, thumbnail_url`. `href = /coach/exercises?q={name}` (o abrir detalle).
    - Recetas: extender `listCoachRecipes` con un filtro `ilike name` (o nueva `searchCoachRecipes(scope, q)` en `services/nutrition-recipes.service.ts`). `href = /coach/recipes/{id}`.
- `_data` wrapper para RSC/preload no es necesario (la búsqueda es on-demand desde el cliente), pero el servicio **no** debe llamarse desde el componente `'use client'`: se expone por un route handler.

**Capa de exposición — route handler GET (recomendado sobre server action):**
- `apps/web/src/app/api/coach/search/route.ts` — molde de `api/recipes/search/route.ts`:
  - `GET ?q=` con **rate-limit** (agregar `rateLimitCoachSearch` en `lib/rate-limit.ts`, espejo de `rateLimitRecipesSearch`).
  - Resolver identidad + scope **server-side** desde la sesión (`getCoach()` + `getPreferredWorkspaceForRender()`), **nunca** leer `coachId/orgId/teamId` del query (regla CLAUDE.md: scope sale de `auth.uid()`/JWT). RLS es el techo, pero igual filtramos por scope activo para no cruzar workspaces.
  - Validar `q` con Zod (min 2 chars, trim); `q` corto → `{ results: {clients:[],...} }` vacío (sin golpear DB).
  - Devuelve `CoachSearchResults` JSON.
  - Por qué route handler y no server action: la búsqueda incremental con **debounce + AbortController** encaja natural con `fetch(signal)`; las server actions no cancelan bien y hay un bug conocido de Next con navegación durante una action con debounce (ver riesgos).

**Capa de presentación — dropdown combobox en `CoachTopBar`:**
- Extraer la búsqueda a un componente `apps/web/src/components/coach/CoachGlobalSearch.tsx` (`'use client'`) para no engordar el topbar. El `CoachTopBar` lo monta en el slot central (reemplaza el `<div>` de líneas 195-227).
- Estructura ARIA (APG combobox+listbox):
  - `<input role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="coach-search-listbox" aria-activedescendant={activeId} />`.
  - Popup `<ul role="listbox" id="coach-search-listbox">` con **grupos** "Alumnos / Programas / Ejercicios / Recetas" (encabezado no-focuseable + `role="group"` con `aria-label`), items `<li role="option" id=... aria-selected=...>`.
  - Navegación teclado: `Down/Up` mueven `activeIndex` sobre la lista **aplanada** de hits (con wrap) y hacen `scrollIntoView`; `Enter` navega al `href` del hit activo; `Escape` cierra (y si ya está cerrado, limpia — respetando el `onKeyDown` actual). Mantener el atajo `"/"` existente.
  - Estado: `useState(query)`, `useDebounce(query, 220)`, `useEffect` que hace `fetch('/api/coach/search?q=', { signal })` con un `AbortController` en `useRef` (abort en cleanup). Estados de UI: idle / loading (spinner) / empty ("Sin resultados para …") / results.
- **Scope multi-workspace:** ya resuelto en el servidor (route handler usa el workspace activo). En el cliente no hace falta pasar scope. Coherente con `coach standalone` vs `team` (pool) vs `enterprise`.
- **Alcance:** desktop-only (el topbar es `hidden md:flex`); no se toca el chrome mobile.

### Ítem 2 — Borrar `LogoUploadForm.tsx`

- Eliminar `apps/web/src/app/coach/settings/LogoUploadForm.tsx`.
- Verificación pre-borrado (DoD): (1) `grep -r LogoUploadForm apps/` = sólo la definición; (2) `updateLogoAction` conserva caller en `BrandSettingsForm.tsx`; (3) el tour (`_components/BrandSettingsTour.tsx`) apunta al `data-tour-id="brand-logo"` del componente **vivo**. Luego `pnpm typecheck` + `pnpm lint`.

### Ítem 3 — Plan de verificación QA (seed → capturas → fixes)

**Seed necesario (reversible, patrón `--down`):**
1. **Aprender:** cero seed. Basta login como alumno de josefit (catálogo global = 839).
2. **Bodycomp:** ya hay data suficiente ("Demo Alumno Josefit": 3 BIA + 2 ISAK). *Opcional* densificar a ~5-6 BIA para una curva de tendencia más vistosa — extender un mini-seed dentro del guardrail existente. No bloqueante.
3. **Equipo:** **script nuevo** `scripts/seed-josefit-team-qa.mjs` (+ manifest json, `--down`), reutilizando la estructura y guardrails de `seed-josefit-design-qa.mjs`:
   - Crear 2-3 **coaches-miembros** sintéticos (auth user + fila `coaches`, email `@josefit-teamqa.cl`) y sus filas `team_members` (status `active`, uno con `can_manage=true`) contra `team_id = d0d0d0d0-0000-0000-0000-000000000001`.
   - Crear ~8-10 **alumnos de pool** (`team_id` = ese team, `org_id null`), repartidos entre los coaches-miembros (`clients.coach_id`) para poblar `studentsByCoach`.
   - Guardrail: tocar sólo emails `@josefit-teamqa.cl` y ese `team_id`; `--down` borra miembros + pool + auth users por manifest.
   - **Ojo GRANT/scoping:** `clients.team_id`/`coach_id` son service-role-only (column grants). El seed usa `SUPABASE_SERVICE_ROLE_KEY` → OK.

**Procedimiento de captura (light/dark × 1440/390):**
- Activar workspace de josefit según pantalla: **standalone** para bodycomp coach y aprender-alumno; **"Movida (test) - Equipo"** (vía `/workspace/select`) para `/coach/team`.
- Rutas a capturar:
  - `/coach/team` (desktop 1440 → `CoachTeamDesktop`; mobile 390 → section `md:hidden`).
  - `/coach/clients/{demoAlumnoId}/bodycomp` (coach) + `/c/josefit/bodycomp` (alumno, login como "Demo Alumno Josefit").
  - `/c/josefit/exercises` ("Aprender") + probar búsqueda (`?q=`) y chips de músculo.
- Cada ruta en **light y dark** (toggle) y en **1440 y 390** → 4 capturas/ruta.
- Salida esperada: una **lista de fixes** (drift de tokens `--sport-*`/`--text-*`/`--surface-*`, contraste dark, overflow horizontal, `h-dvh` fuera de `md:`, radios EVA), con archivo:línea por cada uno.
- Al terminar: `node scripts/seed-josefit-team-qa.mjs --down` (y el bodycomp opcional) para dejar PROD limpio.

---

## Tareas atómicas estimadas (S/M/L)

**Ítem 1 — Búsqueda global**
1. (M) `services/search/coach-search.service.ts`: agregador `searchCoachWorkspace` con scope 3-vías + `Promise.all` de las 4 sub-búsquedas (columnas mínimas, limit por grupo). Reusar `buildExerciseSearchOr`.
2. (S) `services/nutrition-recipes.service.ts`: `searchCoachRecipes(scope, q)` (o param `q` en `listCoachRecipes`) con `ilike name`.
3. (S) `lib/rate-limit.ts`: `rateLimitCoachSearch` (espejo de `rateLimitRecipesSearch`).
4. (M) `app/api/coach/search/route.ts`: GET con Zod + rate-limit + resolución de identidad/scope server-side + JSON.
5. (L) `components/coach/CoachGlobalSearch.tsx`: combobox ARIA completo (roles/attrs, teclado Down/Up/Enter/Escape, `aria-activedescendant` + `scrollIntoView`, grupos), `useDebounce` + `AbortController`, estados idle/loading/empty/results.
6. (S) `components/coach/CoachTopBar.tsx`: reemplazar el `<div>` de búsqueda (195-227) por `<CoachGlobalSearch/>`, preservando atajo `"/"` y estilos de foco.
7. (S) Tests unitarios del agregador (scope 3-vías, límites, query corta) — el codebase testea funciones puras.

**Ítem 2 — Dead code**
8. (S) Borrar `LogoUploadForm.tsx` + verificar tour/action + `typecheck`/`lint`.

**Ítem 3 — QA visual**
9. (M) `scripts/seed-josefit-team-qa.mjs` + manifest + `--down` (miembros + pool).
10. (S) *Opcional* densificar BIA de "Demo Alumno Josefit" (mini-seed reversible).
11. (M) Ejecutar capturas light/dark × 1440/390 de las 3-4 rutas y redactar lista de fixes con archivo:línea.
12. (S) `--down` de los seeds al cerrar QA.

---

## Riesgos y gotchas

- **Scope del server nunca del cliente (dinero/aislamiento):** el route handler de búsqueda debe derivar `coachId/orgId/teamId` de la sesión (`getCoach()` + `getPreferredWorkspaceForRender()`), jamás del query string. RLS es el techo, pero el filtro explícito evita cruzar pool/enterprise/standalone (mismo criterio que `clients.queries.ts`).
- **Race conditions:** sin `AbortController`, una respuesta lenta de "cat" puede pisar la de "catalina". Debounce **no** basta (ver fuentes). Guardar controller en `useRef`, abortar en cleanup.
- **`aria-activedescendant` no auto-scrollea:** hay que `scrollIntoView({ block:'nearest' })` manual al mover la opción activa, o el usuario de teclado "pierde" la selección fuera de viewport.
- **Bug Next.js con server action + debounce + navegación** (https://github.com/vercel/next.js/issues/76936): refuerza elegir **route handler** para la búsqueda incremental.
- **Rate-limit depende de Upstash Redis** (prod). En dev sin Redis, degradar a "permitir" (como ya hace `lib/rate-limit.ts`).
- **Búsqueda de ejercicios: `ilike` no es accent-insensitive** (documentado en `buildExerciseSearchOr`). "gluteos"/"glúteos" se cubren por `MUSCLE_MAPPING`, pero nombres con tilde pueden fallar. Aceptable para v1; documentarlo.
- **`SELECT *` en clientes:** `getCoachClientsWithPrograms` usa `*`; para la búsqueda usar columnas mínimas (`id, full_name, avatar_url`) — no reusar esa query tal cual (trae blobs innecesarios).
- **QA Equipo — workspace activo:** josefit es multi-workspace; si el evaluador no cambia a "Movida (test) - Equipo", `/coach/team` redirige a `/coach/dashboard` (guard `page.tsx:24`). Documentar el paso `/workspace/select` en el runbook de QA.
- **Seed de team toca columnas service-role-only** (`clients.team_id/coach_id`, `team_members`): usar `SUPABASE_SERVICE_ROLE_KEY`. El `--down` debe borrar auth users además de filas (como el seed existente) para no dejar huérfanos.
- **Guardrails de seed:** el team "Movida (test)" es data legacy del deal Movida (cancelado) — el nuevo seed debe **agregar** miembros/pool sintéticos identificables (`@josefit-teamqa.cl`) y **no** borrar el team ni tocar los 2 alumnos de pool preexistentes en el `--down`.
- **`data-tour-id="brand-logo"`:** al borrar `LogoUploadForm.tsx`, confirmar que el tour no quede apuntando a un id inexistente (debería ya apuntar al de `BrandSettingsForm`).

---

## Preguntas para el CEO

1. **Destino del click en cada resultado de búsqueda:** ¿navegar directo a la ficha/detalle (`/coach/clients/{id}`, `/coach/exercises?q=`, `/coach/recipes/{id}`) o abrir un panel/preview? Asumo navegación directa.
2. **Densidad del seed de Equipo:** ¿cuántos coaches-miembros y alumnos de pool sintéticos quiere para el QA (propuesta: 2-3 miembros + ~8-10 alumnos)? ¿OK reutilizar el team "Movida (test)" o prefiere un team QA nuevo aislado?
