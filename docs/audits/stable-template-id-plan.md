# Plan — Identidad estable de bloques/comidas (fix drift por `order_index`)

**Estado:** DISEÑADO, no implementado. **Fecha:** 2026-07-01. **Impacto hoy:** bajo-medio (solo al reordenar).
**Origen:** diferido del batch de Joaquín (progresión + CASCADE + P1-3, PR #98/#99/#101).

---

## Problema

El save/propagación empareja hijos **por posición (`order_index`)**, no por identidad. Al **reordenar**, el `id` se queda en la posición y "se corre" al contenido vecino.

### Workout
`diffBlocksByPosition` (`apps/web/src/services/workout/workout-save-reconcile.ts:88`) matchea bloques por `order_index`:
```
Antes:  B0=Sentadilla(pos0, log 100kg) · B1=Banca(pos1, log 80kg)
Coach reordena a [Banca, Sentadilla] y guarda →
  UPDATE B0 → Banca (pos0);  UPDATE B1 → Sentadilla (pos1)
  Pero workout_logs.block_id=B0 (100kg) ahora resuelve a "Banca" → historial cruzado
```
El dato NO se pierde (snapshot `exercise_name_at_log` + `exercise_id` [PR #101] preservan la verdad del log), pero el link **bloque↔ejercicio activo** se corre.

### Nutrición
`reconcileMeals` (`apps/web/src/services/nutrition-propagation.reconcile.ts:66`) matchea comidas por `order_index` al propagar plantilla→N-clientes. Reordenar en la plantilla **sobreescribe** (UPDATE name/description) una comida con logs — no la borra (invariante preservada), pero el log queda apuntando a una comida cuyo contenido cambió.

CLAUDE.md §"Propagación de plantillas de nutrición" ya documenta esto como limitación conocida.

---

## Insight clave

Ninguna tabla tiene id estable **propio**, pero:
- **Workout:** el builder YA carga el PK real del bloque (`BuilderBlock.uid = "block-<id>"`). El PK es estable (el reconcile lo reusa vía UPDATE). El único problema: `mapDays()` **no manda el id** al guardar (solo `order_index`). → Fix SIN migración.
- **Nutrición:** es propagación template→muchos-clientes; cada comida-de-cliente tiene id ≠ al de la plantilla. Necesita una columna que las enlace. → Fix CON migración.

---

## Solución A — Workout (SIN migración, alto valor, ~medio día)

Mandar el `id` real del bloque en el payload y matchear por id (fallback a posición para bloques nuevos/clonados).

Cambios:
1. `apps/web/src/app/coach/builder/[clientId]/types.ts` — `BuilderBlock`: agregar `id?: string` (el PK, ya vive en `uid`).
2. `program-read-mappers.ts` (`mapDbBlockToBuilderBlock`) — setear `id: b.id` (nuevos/clonados quedan `undefined`).
3. `WeeklyPlanBuilder.tsx` (`mapDays`) — incluir `id: b.id ?? null` en el payload.
4. `packages/schemas/workout.ts` — `id` opcional en el schema del bloque (nullable).
5. `workout-save-reconcile.ts` — `diffBlocksByPosition` → `diffBlocksById`:
   - desired con `id` que existe → UPDATE ese bloque (aunque cambie `order_index`) → logs quedan correctos.
   - desired sin `id` (o id inexistente) → INSERT.
   - existing cuyo id no está en desired → DELETE (logs sobreviven vía ON DELETE SET NULL, #98).
6. `workout.service.ts` (`reconcileExistingClientProgram`) — pasar el nuevo diff.

Tests: reorden preserva el binding log↔ejercicio; insertar en medio no re-apunta; borrar deja logs huérfanos (block_id NULL) resueltos por snapshot exercise_id.

**Riesgo:** bajo. Behavior-preserving salvo el reorden, que pasa a ser correcto. El PK ya era estable.

### Ambigüedad residual (decisión de producto, NO se resuelve con id)
Si el coach **cambia intencionalmente el ejercicio de un bloque con logs** (misma posición), el log queda en un bloque de otro ejercicio; el snapshot preserva la verdad del log. Correcto/aceptado.

---

## Solución B — Nutrición (CON migración, ~1 día)

Columna `nutrition_meals.template_meal_id uuid` = id de la comida de la plantilla origen.

Cambios:
1. Migración: `ALTER TABLE nutrition_meals ADD COLUMN template_meal_id uuid;` + backfill por posición actual (una vez, plantilla↔cliente por `order_index` presente) + índice.
2. Propagación (`nutrition.service.ts`): al insertar comidas de cliente desde la plantilla, guardar `template_meal_id` = id de la comida de plantilla.
3. `reconcileMeals` (`nutrition-propagation.reconcile.ts`) + RPC `nutrition_propagation_rpc.sql`: matchear por `template_meal_id` (fallback `order_index` para legacy/sin backfill).
4. Preservar la invariante existente (no borrar comidas con logs — test de orfandad).

**Nota FK:** revisar estado de `nutrition_meal_logs.meal_id` (CLAUDE.md dice ON DELETE CASCADE con guard "solo borra sin logs"; #100 tocó otra relación plan→adherencia). No bloquea este fix.

**Riesgo:** medio (toca propagación money-adjacent de adherencia). Requiere paridad en prod + test de orfandad.

---

## Recomendación

- **Workout primero** (barato, sin migración, el reorden es acción común del coach).
- **Nutrición** cuando haya aire (migración + propagación).
- Ninguno es urgente; 0 pérdida de datos hoy (los snapshots cubren la verdad). Es corrección de correctness del link, no data-loss.

## Verificación (multi-agente 2026-07-01)
Trazado confirmado: workout `workout-save-reconcile.ts:48-100`, nutrición `nutrition-propagation.reconcile.ts:45-72` + `nutrition_propagation_rpc.sql:148-171`. Ni `workout_blocks` ni `nutrition_meals` tienen columna de identidad estable hoy. El builder ya expone `b.id` (`WeeklyPlanBuilder.tsx:105`).
