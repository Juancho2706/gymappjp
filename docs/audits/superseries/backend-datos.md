# Auditoría SUPERSERIES — Lente Backend / Datos

Fecha: 2026-07-01 · Rama: `feat/redesign-eva-design-system` · Alcance: modelo de datos de superseries end-to-end (persistencia, invariantes, validación, integridad). READ-ONLY.

## TL;DR

La "superserie" **no es una entidad**: es una propiedad *emergente* de tres cosas sueltas en `workout_blocks`:
1. una **etiqueta de texto libre** `superset_group` (columna `text`, nullable, sin constraint),
2. el **orden global** `order_index` (int por plan, no por área), y
3. la **contigüidad** que se **reconstruye en lectura** (`groupContiguousSupersetRuns`).

Ningún invariante se valida en la capa de datos ni en el servidor. Zod solo limita `superset_group` a `max(10)`. Toda la lógica de agrupamiento (≥2 miembros contiguos, letras únicas, sin huérfanos) vive **solo en el reducer del cliente**, y **está duplicada y divergente entre web y mobile**. Varios caminos (drag-reorder, transfer entre días, sync de plantilla con overrides) pueden persistir grupos rotos u huérfanos en silencio, y la capa de lectura **renderiza un grupo de 1 bloque como "Superserie"**.

---

## 1. Cómo se persiste

### Esquema (`workout_blocks`)
- `supabase/migrations/00000000000001_baseline.sql:1498` → `"superset_group" "text"` (nullable, **sin default, sin CHECK, sin índice**).
- `apps/web/src/lib/database.types.ts:4329` → `superset_group: string | null`.
- No hay tabla de grupos, no hay `superset_group_id`, no hay FK ni índice único parcial. La única migración que menciona `superset_group` es el baseline; no hubo migración dedicada a superseries.

### El "modelo" real
- **Etiqueta**: `superset_group` = letra ("A", "B"…) asignada por `nextFreeSupersetLetter` (`apps/web/src/app/coach/builder/[clientId]/hooks/usePlanBuilder.ts:43`). Es un simple label, no un identificador estable.
- **Orden**: `order_index` es **global por plan** (0-based, posición en el array del día que incluye TODAS las áreas/secciones). Se asigna en:
  - guardado fresco: `blockRow(block, index)` con `index` = posición del array (`workout.service.ts:614`),
  - reconcile: `op.desiredIndex` (`workout.service.ts:222`),
  - payload cliente: `order_index: idx` en `mapDays` (`WeeklyPlanBuilder.tsx:933`) — **sin re-ordenar por área**.
- **Grupo (lectura)**: `groupContiguousSupersetRuns` (`apps/web/src/lib/workout-block-grouping.ts:29`) agrupa bloques ya filtrados por área y ordenados por `order_index`, uniendo tramos donde `superset_group` (trim) coincide **y** `next.order_index === prev.order_index + 1`.
- **Áreas** intervienen en lectura: `executionAreaGroupsFor` (`apps/web/src/lib/workout-areas.ts:145`) agrupa por `section_template_id` y **después** se corre el agrupamiento de superseries por área (`WorkoutExecutionClient.tsx:441`).

### Caminos de escritura (todos copian `superset_group` verbatim)
- `saveWorkoutProgramAction` fresco (`workout.service.ts:614`) y `blockRow` (`:148`).
- `reconcileExistingClientProgram` (programa de cliente existente, no destructivo) → `blockRow` (`:222`).
- `duplicateWorkoutProgramAction` (`:827`, copia `order_index` y `superset_group` tal cual).
- `assignProgramToClientsAction` (plantilla→alumnos, `:1042`, verbatim).
- `syncProgramFromTemplateAction` → `mergeBlocksForSync` (`:1255`) + `mapDbBlockToWorkoutInput` (`:1281`).

Ninguno normaliza ni valida las superseries; solo escriben la letra que venga.

---

## 2. Invariantes (y dónde se rompen)

| Invariante | Dónde se "enforcea" | Dónde se rompe |
|---|---|---|
| Un superset = **≥2 bloques contiguos** con la misma letra | Solo reducer web (`TOGGLE_SUPERSET`, re-letra tramos y descarta singletons, `usePlanBuilder.ts:267-305`) | Render **no** lo respeta (ver F5); `MOVE_BLOCK`/`TRANSFER_BLOCK`/sync sí crean singletons |
| Letras **únicas por día** | `nextFreeSupersetLetter` sobre todo el día; `COPY_DAY` remapea (`:129`) | `TRANSFER_BLOCK` conserva la letra al mover entre días (colisión); dos tramos no contiguos con misma letra en la misma área |
| Miembros **contiguos en `order_index`** dentro del área | Implícito: el builder mantiene el array agrupado por área en `SET_BLOCK_AREA` | `MOVE_BLOCK` (drag + rail de chevrons) hace `arrayMove` sin re-agrupar por área → `order_index` interleavea áreas → hueco dentro del área |
| `superset_group` = letra o NULL | Zod `max(10)` (acepta '' y espacios) | '' se persiste como '' (no NULL); trim en lectura lo salva pero queda storage inconsistente |

`order_index` global + contigüidad `+1` es el punto frágil central: la lectura asume que dentro de un área los `order_index` son **consecutivos sin huecos**, cosa que el guardado **no garantiza** (el payload es el orden crudo del array del builder, sin re-sort por área).

---

## 3. Validación Zod

`packages/schemas/workout.ts:128`:
```
superset_group: z.string().max(10).nullable().optional()
```
- Sin regex/enum: acepta cualquier string ≤10 (incluye '', espacios, minúsculas, multi-char).
- El `superRefine` del bloque (`:154`) solo valida cardio; **no hay validación cruzada** entre bloques de un día (contigüidad, ≥2 miembros, unicidad de letra). `WorkoutDaySchema` (`:174`) tampoco.
- Consecuencia: el servidor acepta y persiste cualquier estado de superserie que el cliente (o un `PATCH` directo a PostgREST desde `apps/mobile`) mande.

---

## 4. Hallazgos de integridad (detalle)

**F1 (ALTA) — Integridad de superserie no se enforcea en persistencia.** `superset_group` es texto libre sin constraint DB y Zod solo valida `max(10)`. Los invariantes (≥2 contiguos, letra única, contigüidad) viven solo en el reducer web. Cualquier bug de cliente, el reducer de mobile, o un `PATCH` PostgREST directo persiste grupos rotos; reconcile/duplicate/assign los propagan verbatim.

**F2 (ALTA) — Reorder y transfer no renormalizan `superset_group`.** `MOVE_BLOCK` (`usePlanBuilder.ts:81`, `arrayMove`) y `TRANSFER_BLOCK` (`:89`) no tocan la letra. Sacar un miembro de un grupo deja un **huérfano** (bloque solo con letra); meter un bloque en medio parte el run. El conector del builder decide "linked" por adyacencia de array (`DayColumn.tsx:410`, sin chequear área) mientras la ejecución agrupa por `order_index+1` dentro del área → builder y ejecución pueden **discrepar**.

**F3 (ALTA) — La contigüidad de lectura depende de `order_index` sin huecos, pero `order_index` es global y puede interleavear áreas.** El `SortableContext` cubre TODO el día, no por área (`DayColumn.tsx:404-405`), y `MOVE_BLOCK`/rail de chevrons (`WeeklyPlanBuilder.tsx:590`) no re-ordenan por área. Al guardar (`order_index=idx`, `WeeklyPlanBuilder.tsx:933`), un bloque de otra área intercalado numéricamente entre dos miembros del superset rompe el `+1` → la superserie **se parte en la pantalla del alumno** aunque en el builder se veía unida.

**F4 (MEDIA) — Sync de plantilla rompe/huérfana grupos.** `mergeBlocksForSync` (`workout.service.ts:1255`) fusiona posicionalmente (por índice j) bloques de plantilla y bloques `is_override` del cliente sin renormalizar superseries. Un override en medio de una superserie de plantilla (o colisión de letra entre override y plantilla) parte/huérfana el grupo tras el sync, en silencio.

**F5 (MEDIA) — La lectura renderiza un run de 1 bloque como "Superserie".** `groupContiguousSupersetRuns` emite `type: 'superset'` incluso para un tramo de longitud 1 (cualquier bloque con letra abre un run que se pushea como superset). Confirmado por el contrato de test (`workout-block-grouping.test.ts:73` afirma `type === 'superset'` para un bloque solo). La ejecución muestra "Superserie A · 1 ejercicios" + "Cómo hacerla" (`WorkoutExecutionClient.tsx:702`). No hay guardia contra singletons en el borde de lectura/render.

**F6 (MEDIA) — Lógica de superserie duplicada y divergente web vs mobile.** El reducer web re-letra tramos partidos y descarta singletons (`usePlanBuilder.ts:267-305`); el de mobile usa `clearAll`/`groupMembers` distinto (`apps/mobile/lib/plan-builder/reducer.ts:146-172`). `groupContiguousSupersetRuns` vive en `apps/web/src/lib` (no en `packages/`), así que mobile no lo comparte. Dos clientes pueden producir estados de `superset_group` distintos para la misma operación; ninguno valida server-side.

**F7 (BAJA) — El alumno en mobile no ve superseries.** `apps/mobile/app/alumno/workout/[planId].tsx` selecciona `superset_group` pero **no lo agrupa ni renderiza** (sin `groupContiguous`, sin `section_template_id`/áreas). Paridad rota: web agrupa, mobile muestra lista plana.

**F8 (BAJA) — Letra cruda ambigua en render.** Se muestra `grupo ${supersetLetter}` (`WorkoutExecutionClient.tsx:620`). Dos runs no contiguos con la misma letra en la misma sección se muestran ambos como "A" (sin re-etiquetar por render). Confuso para el alumno.

**F9 (BAJA) — `''` vs `NULL` inconsistente.** Zod acepta `''`; `blockRow`/`mapDays` usan `?? null` (que **no** convierte `''` a null → `''` persiste). El trim en lectura lo neutraliza, pero el storage queda inconsistente (`''` y `NULL` coexisten para "sin grupo").

---

## 5. QA — escenarios de test que faltan

- **Reorder rompe grupo**: dispatch `MOVE_BLOCK` que saca un miembro de un superset y que mete un ajeno en medio → assert que el estado final no deja huérfanos ni runs partidos (hoy no existe; el reducer no lo maneja).
- **Interleave de áreas → split en lectura**: guardar un plan donde `order_index` de un área tiene hueco (bloque de otra área intercalado) y verificar que la superserie NO se parte (hoy se parte).
- **`mergeBlocksForSync` + override**: plantilla con superset A(0,1) y cliente con override en pos 0 → assert que el sync no deja un superset huérfano/roto.
- **Round-trip con logs**: save → reconcile (programa de cliente con logs) → read → group; verificar que las superseries sobreviven al match posicional y a `ON DELETE SET NULL`.
- **`groupContiguousSupersetRuns` NO debe rendir superset de 1** (hoy el test `:73` afirma lo contrario — debe invertirse tras el fix F5).
- **Paridad web↔mobile**: misma secuencia de toggles produce el mismo `superset_group` en ambos reducers.
- **Zod cross-block** (si se agrega): rechazar letra en un solo bloque / no contigua / duplicada dentro del día.
- **`TRANSFER_BLOCK` colisión de letra** entre día origen y destino.

---

## 6. Mejoras propuestas (priorizadas, schema aditivo o sin schema)

**P0 — sin cambios de schema**
1. **Función pura `normalizeSupersetRuns(blocks)`** (fuente única): por área, densifica `order_index` (sin huecos), descarta grupos con <2 miembros contiguos (→ null) y re-letra tramos partidos. Aplicarla en `blockRow`/serialización del save, **reconcile, duplicate, assign y el merge de sync**. Colocarla en `packages/schemas` (o `packages/`) y consumirla desde web y mobile → mata drift (F1, F2, F3, F4, F6).
2. **`groupContiguousSupersetRuns`: degradar run de 1 a `type: 'single'`** (defensa en lectura aunque la escritura esté sucia) y actualizar el test `:73` (F5, F8).
3. **Renormalizar tras `MOVE_BLOCK`/`TRANSFER_BLOCK`** en ambos reducers, o correr `normalizeSupersetRuns` en `mapDays` antes del save (F2, F3).

**P1**
4. Mover `groupContiguousSupersetRuns` + `normalizeSupersetRuns` a un paquete compartido y **renderizar superseries en el alumno mobile** (leer también áreas/`section_template_id`) (F6, F7).
5. **Endurecer Zod**: `superset_group` regex `^[A-Z]$` y `''`→`null`; opcional `superRefine` a nivel `WorkoutDaySchema` que rechace singletons/no-contiguos/duplicados (defensa en profundidad server-side) (F1, F9).

**P2 — schema aditivo (opcional, identidad estable de grupo)**
6. Agregar `superset_group_id uuid` nullable a `workout_blocks` (identidad estable del grupo, desacopla el agrupamiento de "letra + contigüidad"; la letra queda solo para display). Migración **aditiva** + obligatorio `GRANT UPDATE(superset_group_id) ON workout_blocks TO authenticated` en la MISMA migración (gotcha de column-level grants de CLAUDE.md) + regenerar `database.types.ts`. Evita el CASCADE-de-contigüidad al reordenar. La contigüidad por CHECK/trigger en DB es frágil (cross-row); preferir normalización en app-layer sobre trigger.
