# Búsqueda global del topbar coach — SPEC

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-07-04
**Related plan:** `specs/busqueda-global/PLAN.md`
**Informe fuente:** `docs/audits/fase-l-wl2/informe-deuda-tecnica.md` (ítem 1)

---

## Problem

El topbar del coach (`apps/web/src/components/coach/CoachTopBar.tsx:190-227`) ya
muestra un input de búsqueda con atajo `"/"` y botón de limpiar, pero es una
**cáscara sin resultados**: un comentario en el propio archivo (líneas 191-194)
difiere el dropdown real a "la ola de datos". El coach escribe y no pasa nada.

La plomería de datos ya existe: alumnos, programas, ejercicios y recetas tienen
búsqueda server-side con scope de 3 vías (enterprise / team-pool / standalone).
Falta conectar esa plomería a un dropdown de resultados agrupados para que la
búsqueda global sea funcional y el coach salte directo a la ficha del alumno, el
detalle del programa, el ejercicio en el catálogo o la receta.

## Users

- **Primary:** Coach (standalone, de team-pool o de enterprise) usando el
  dashboard de escritorio (`/coach/*`). La búsqueda es una feature de escritorio:
  el `<header>` es `hidden md:flex` (línea 158) — en `<md` cada pantalla trae su
  propio header y la búsqueda global **no aplica**.
- **Secondary:** ninguno.
- **Internal/operator:** ninguno.

## Goals

- Convertir el input en cáscara en una **búsqueda global funcional** con dropdown
  de resultados agrupados (Alumnos / Programas / Ejercicios / Recetas).
- Reutilizar las **queries de búsqueda existentes** (no inventar acceso a datos
  nuevo) componiéndolas en un servicio agregador con scope 3-vías.
- Que el click en un resultado **navegue directo** al destino canónico de ese
  ítem (ficha del alumno, detalle del programa, catálogo con el ejercicio, receta).
- **Cero fuga cross-scope:** un coach jamás ve ítems fuera de su workspace activo
  (replicando exactamente el scope de las queries existentes).
- Combobox **accesible** (ARIA APG combobox + listbox), operable 100% por teclado.

## Non-Goals (Fuera de alcance)

- **Mobile / `<md`.** El topbar es desktop-only; no se toca el chrome mobile ni se
  agrega búsqueda global a los headers por-pantalla del móvil.
- **Búsqueda en el builder.** `CoachTopBar` devuelve `null` en el builder
  (líneas 145-147); ahí no hay búsqueda y no se agrega.
- **Política de scope nueva.** No se inventa visibilidad: la búsqueda **replica**
  el scope de las queries existentes (incluida la regla vigente del pool de team).
  No se amplía ni restringe qué ve el coach respecto de sus páginas actuales.
- **Server action para la búsqueda.** Decisión tomada: es un **route handler GET**
  (ver Riesgos — bug Next con server action + debounce + navegación).
- **Preview / panel lateral en el resultado.** El click navega directo; no se
  abre un panel de vista previa.
- **Acento-insensitividad total.** `ilike` no es accent-insensitive (limitación
  heredada de `buildExerciseSearchOr`); aceptable en v1, se documenta.
- **Búsqueda de otras entidades** (check-ins, alimentos sueltos, logs) fuera de
  las 4 categorías definidas.
- **Cambios de DB.** No hay migración: solo se leen tablas existentes con
  columnas mínimas. Ver PLAN → Data Model.

## User Stories

- Como **coach**, quiero escribir el nombre de un alumno en el buscador del topbar
  y ver resultados en vivo, para saltar a su ficha sin navegar por menús.
- Como **coach**, quiero que los resultados estén **agrupados** por Alumnos /
  Programas / Ejercicios / Recetas con un tope por grupo, para escanear rápido.
- Como **coach de un team**, quiero que la búsqueda **solo** me muestre lo de mi
  workspace activo (según la regla del pool), para no ver material de otro coach.
- Como **coach**, quiero navegar los resultados con el teclado (`↓/↑/Enter/Esc`) y
  abrir el foco con `"/"`, para operar sin soltar el teclado.
- Como **coach**, quiero un estado claro de "cargando" y de "sin resultados", para
  entender qué está pasando cuando no aparece nada.

## Acceptance Criteria

- [ ] **Funcional — resultados agrupados:** al escribir ≥2 caracteres, el dropdown
  muestra hasta 4 grupos (Alumnos / Programas / Ejercicios / Recetas) con **cap de
  5 ítems por grupo**, cada uno con label + sublabel/thumb cuando aplique.
- [ ] **Funcional — navegación directa:** click (o `Enter` sobre el ítem activo)
  navega al destino canónico: alumno → `/coach/clients/{id}`, programa → detalle
  vigente del programa, ejercicio → catálogo con el ejercicio, receta → detalle de
  receta.
- [ ] **Seguridad / aislamiento — cero fuga cross-scope:** el scope
  (`coachId/orgId/teamId`) se deriva **siempre** server-side de la sesión/JWT
  (`getCoach()` + `getPreferredWorkspaceForRender()`), **nunca** del query string.
  Un coach de team NO ve alumnos/programas/recetas de otro coach del pool salvo la
  **regla vigente del pool** (misma que las queries existentes). Test de
  no-fuga cross-workspace incluido.
- [ ] **Seguridad — rate limit:** el endpoint respeta rate-limit (espejo de
  `rateLimitRecipesSearch`); degrada a "permitir" si Redis no está (dev).
- [ ] **Accesibilidad — combobox APG:** `input role="combobox"` con
  `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`;
  popup `role="listbox"` con grupos (`role="group"` + `aria-label`) e ítems
  `role="option"` con `aria-selected`. El foco DOM permanece en el input; la
  selección visual se mueve con `aria-activedescendant` + `scrollIntoView` manual.
- [ ] **Accesibilidad — teclado completo:** `↓/↑` mueven la opción activa sobre la
  lista aplanada con wrap; `Enter` navega; `Escape` cierra y (si ya cerrado) limpia
  respetando el `onKeyDown` actual; `"/"` enfoca (atajo existente preservado).
- [ ] **UX — estados:** idle (sin query) / cargando (spinner) / vacío ("Sin
  resultados para …") / resultados. Query `<2` chars no golpea la DB.
- [ ] **Mobile/responsive:** la feature no aparece ni rompe layout en `<md`
  (topbar `hidden md:flex`). No se introduce `h-screen`/`100vh` fuera de `md:`.
- [ ] **Dark mode:** dropdown, grupos, estados y opción activa legibles y con
  contraste correcto en light y dark (tokens EVA `--surface-*`/`--text-*`/`--sport-*`).
- [ ] **Race safety:** respuestas viejas no pisan a las nuevas (debounce +
  `AbortController`, controller en `useRef`, abort en cleanup).
- [ ] **Gates de repo:** `pnpm typecheck` + Vitest del agregador verdes; sin
  llamadas Supabase directas en `_data`; scope validado con Zod en el handler.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Fuga cross-scope si el scope viniera del cliente | Alto (aislamiento pool/enterprise/standalone) | Scope SIEMPRE server-side desde sesión/JWT; filtro explícito además de RLS; test de no-fuga |
| Respuesta stale pisa la nueva (race) | Medio (resultados incorrectos) | Debounce ~220 ms **+** `AbortController` en `useRef`, abort en cleanup del effect |
| `aria-activedescendant` no auto-scrollea | Medio (a11y teclado) | `scrollIntoView({ block:'nearest' })` manual al cambiar opción activa |
| Server action + debounce + navegación (bug Next #76936) | Medio (funcionalidad) | **Route handler GET** con `fetch(signal)`, no server action |
| `SELECT *` de `getCoachClientsWithPrograms` trae blobs | Bajo (perf) | Sub-búsqueda de alumnos con columnas mínimas (`id, full_name, avatar_url`), no reusar la query pesada |
| `ilike` no accent-insensitive | Bajo (recall) | Aceptado v1; `MUSCLE_MAPPING` cubre sinónimos de músculo; documentar limitación |
| Rate-limit depende de Upstash Redis | Bajo (dev) | Degradar a "permitir" como ya hace `lib/rate-limit.ts` |

## Open Questions

- [ ] Ninguna bloqueante. (Decisiones de click-directo, route handler, grupos con
  cap 5 y scope server-side ya están tomadas y bakeadas arriba.)
- [ ] Confirmar la ruta de detalle canónica vigente de **programa** y **receta** al
  implementar (`href` exacto), según el estado de la rama de rediseño.
