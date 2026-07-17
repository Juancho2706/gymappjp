# Check-ins con estado "revisado" (cola del coach) - SPEC

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-07-04
**Related plan:** `specs/checkins-revisado/PLAN.md`

---

## Problem

El coach recibe check-ins de sus alumnos (peso, energia, notas, fotos) pero hoy
no tiene forma de marcar cuales ya atendio. En la ficha del alumno existe un boton
"Marcar como revisado" pero es de una sola via (no se puede des-marcar) y solo
aplica al ULTIMO check-in. En el dashboard, los check-ins recientes aparecen en el
feed de actividad sin ninguna senal de "pendiente vs revisado" ni un contador que
le diga al coach cuantos le faltan por atender. El resultado: el coach no tiene una
cola de trabajo clara y puede dejar check-ins sin respuesta (mal servicio, el
diferenciador de EVA es el coaching personalizado).

Nota importante: "check-in pendiente" en el dashboard actual (`dashboard.queries.ts`,
focus `checkin_pendiente`) significa "el ALUMNO no envio check-in en >30 dias"
(adherencia). Eso es un concepto DISTINTO de "el coach no ha REVISADO un check-in
que si llego". Esta feature trata del segundo: la cola de revision del coach.

## Users

- Primary: coach standalone (revisa check-ins de sus alumnos en la ficha y el dashboard).
- Secondary: coach dentro de un `team` / pool (varios coaches pueden atender; `reviewed_by` registra quien reviso).
- Internal/operator: enterprise `org_admin` (ya consume `reviewed_at` para metricas de tiempo de respuesta en `/org/[slug]/check-ins`; esta feature no cambia esa vista, solo alimenta mejor el dato).

## Goals

- El coach ve cuantos check-ins tiene PENDIENTES (sin revisar) con un badge donde ya mira (dashboard).
- El coach puede marcar un check-in como revisado y tambien des-marcarlo (toggle) desde la ficha del alumno.
- El coach puede filtrar la lista de check-ins recientes entre pendientes y revisados.
- El dato `reviewed_at` / `reviewed_by` queda consistente para las metricas enterprise ya existentes.

## Non-Goals (Fuera de alcance)

- **React Native / mobile (`apps/mobile`)**: la feature es web-first. No se toca el cliente RN en esta iteracion.
- **Migracion de columnas nuevas**: las columnas `reviewed_at` y `reviewed_by` YA existen en PROD (migracion `20260601000600_check_ins_reviewed_at.sql`, ya aplicada — presente en `database.types.ts`). No se crea columna nueva.
- **Notificaciones push / email al coach** cuando llega un check-in nuevo (posible follow-up, no ahora).
- **Cambiar la campana del coach** (`NewsBellButton`): es un feed de NOVEDADES de producto, no de check-ins. No se reutiliza para pendientes.
- **Reescribir la vista enterprise** `/org/[slug]/check-ins` (read-only de metricas; se mantiene como esta).
- **Redisenar el concepto de adherencia** "alumno sin check-in >30d" (focus `checkin_pendiente`): se mantiene separado y sin cambios.
- **Historial completo paginado de check-ins por alumno**: la "lista" filtrable es el feed de check-ins recientes del coach; no se construye una pagina nueva de historial.

## User Stories

- Como coach, quiero ver un contador de check-ins sin revisar en mi dashboard, para saber cuanto trabajo de seguimiento tengo pendiente.
- Como coach, quiero marcar un check-in como revisado, para sacarlo de mi cola de pendientes.
- Como coach, quiero des-marcar un check-in que marque por error, para corregir mi cola sin ayuda de soporte.
- Como coach, quiero filtrar mis check-ins recientes entre "pendientes" y "revisados", para enfocarme en los que faltan.
- Como coach de un team, quiero que quede registrado quien reviso cada check-in (`reviewed_by`), para no duplicar trabajo con otros coaches del pool.

## Acceptance Criteria

- [ ] Funcional: existe una accion "des-marcar como revisado" que limpia `reviewed_at` y `reviewed_by`; el boton de la ficha se comporta como toggle (revisado <-> pendiente).
- [ ] Funcional: el dashboard del coach muestra un badge/contador de check-ins pendientes (con `reviewed_at IS NULL`) acotado a la ventana de check-ins recientes que ya trae la query.
- [ ] Funcional: los items de check-in del feed de actividad muestran una senal visible "sin revisar" vs "revisado".
- [ ] Funcional: existe un filtro pendientes/revisados sobre la lista de check-ins recientes del coach.
- [ ] Seguridad: un coach NO puede marcar ni des-marcar check-ins de alumnos que no son suyos. Garantizado en 2 capas: (a) `assertCoachClientReadAccess` en el service; (b) RLS `check_ins_coach` (`clients.coach_id = auth.uid()`) via cliente `authenticated`. Cubierto por test unitario sobre la accion/service (no E2E).
- [ ] Seguridad/consistencia: marcar setea `reviewed_by = auth.uid()`; el escrito usa cliente `authenticated` (nunca service-role) para heredar RLS.
- [ ] Mobile/responsive: badge y filtro usan `dvh`/safe-areas donde aplique; el toggle de la ficha ya vive en Dialog (desktop) / Sheet (movil) — mantener.
- [ ] Accesibilidad: el badge tiene `aria-label` con el conteo; el toggle anuncia estado (revisado/pendiente).
- [ ] Observabilidad/soporte: no se rompen las metricas enterprise que ya leen `reviewed_at` (`getOrgCheckInOverview`).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Confundir "sin revisar" con "alumno sin check-in >30d" (adherencia) | Medio: UI enganosa, doble conteo | Nombrar el concepto explicito ("sin revisar" / "por revisar"); no tocar el focus `checkin_pendiente` existente |
| Des-marcar re-abre trabajo ya contado en metricas enterprise de tiempo de respuesta | Bajo | El avg de respuesta usa `reviewed_at` puntual; des-marcar es raro y correctivo. Documentar; no bloquea |
| El badge de "pendientes" solo cuenta la ventana recientes (limit del feed), no el total historico | Bajo | Definir el conteo como "pendientes en check-ins recientes" (ventana acotada); alinear copy. Evita un COUNT global caro por request |
| Toggle optimista se desincroniza si la accion falla | Bajo | Revertir estado local en catch; `revalidatePath` de la ficha tras exito |

## Open Questions

- [x] **RESUELTA (orquestador, 2026-07-04):** el badge cuenta pendientes sobre la ventana de check-ins recientes que ya trae la query (barato, cero query nueva). COUNT global scoped queda como mejora solo si el CEO la pide.
- [x] **RESUELTA (orquestador, 2026-07-04):** la lista filtrable es el feed de actividad del dashboard (donde el coach ya mira). No se construye seccion nueva en la ficha.
