---
status: done
owner: product-engineering
last_verified: "2026-09-07"
canonical: false
---

# SPEC — Plan vivo y guardado honesto

Incidente 2026-09-07, coach `doblementefit` (Angela Montefusco). Editó durante una tarde el programa
**desactivado** de su alumna creyendo que era la plantilla vigente. La app no se lo dijo en ningún
momento. Diagnóstico completo y evidencia en el artifact `2f5f4fc7-cbda-4ed4-9bd5-b953c9995850`.

**No hubo pérdida de datos en este caso** (nunca llegó a guardar). Sí hay pérdida comprobada en otros:
2 programas ya inactivos recibieron 60 bloques nuevos después de desactivarse, de 2 coaches distintos.

## Contexto de dominio

Al asignar una plantilla a un alumno (`assignProgramToClientsAction`, `workout.service.ts:937`):

1. Se desactivan los programas activos previos del alumno (`deactivateActiveProgramsForClient`, `:385`).
2. Se inserta una **copia independiente** con `client_id`, `source_template_id` → la plantilla, y
   `name` heredado **tal cual** de la plantilla (`:1080`).
3. La copia no se vuelve a vincular nunca: editar la plantilla no toca a los alumnos ya asignados.

El programa desactivado queda invisible para el alumno (el ejecutor exige `is_active = true`,
`workout-execution.queries.ts:137`) pero **sigue siendo editable y guardable por el coach**, porque
ninguna superficie del coach lee `is_active`.

## Números de LIVE (07-09-2026, read-only)

| Métrica | Valor |
|---|---|
| Programas asignados | 207 |
| ...inactivos | 78 (38 %) en 31 alumnos |
| Alumnos con más de un programa | 23 de 138 (17 %) |
| Copias con `source_template_id` | 122 |
| **Copias con nombre idéntico al de su plantilla** | **105 (86 %)** |
| Programas inactivos que recibieron bloques nuevos | 2 (60 bloques, 2 coaches) |

## Requisitos

### R1 — Un programa inactivo se anuncia como tal, en toda superficie del coach

- **R1.1** El builder muestra un aviso fijo (no descartable) cuando `initialProgram.is_active === false`.
- **R1.2** El aviso nombra el programa que el alumno **sí** está usando y linkea a él. Si el alumno no
  tiene ninguno activo, el aviso lo dice y ofrece volver a la ficha.
- **R1.3** La lista de programas y la vista previa distinguen «Ya no está en uso» con peso visual real
  (hoy es el tono más apagado de la paleta).
- **R1.4** El coach **puede seguir editando y guardando** un programa inactivo (decisión del owner
  D2-A: se usa para reciclar planes viejos). Lo que cambia es que sabe dónde está parado.
- **R1.5** Guardar un programa inactivo **no lo reactiva**. Comportamiento actual, se preserva
  explícitamente (`workout.service.ts:556-580` no toca `is_active`).

### R2 — Plantilla y copia del alumno son distinguibles a simple vista

- **R2.1** El builder titula qué se está editando: `Plantilla` o `Plan de <alumno>`.
- **R2.2** Cuando la copia tiene `source_template_id`, la UI cita la plantilla madre y dice que son
  independientes.
- **R2.3** Los nombres **guardados no se tocan** (decisión del owner D3-A). Es identidad en pantalla,
  no migración de datos. Cero DDL, cero UPDATE masivo.

### R3 — El guardado no miente

- **R3.1** Etiqueta única `Guardar cambios` en ambos modos (hoy: `Guardar y enviar` vs `Guardar plantilla`).
- **R3.2** El botón de guardar cambia de aspecto cuando hay cambios pendientes.
- **R3.3** El guard de salida cubre la navegación interna de la app (botón «Volver» ya cubierto,
  falta `popstate` del navegador), no solo el cierre de pestaña.

### R4 — La sincronización destructiva de la app sale de circulación

- **R4.1** Se retira la superficie de UI de «Sincronizar con plantilla» en RN: menú de la tarjeta
  (`ProgramCard.tsx:67-69`), hoja de vista previa (`ProgramPreviewCard.tsx:134-136`) y su cableado
  (`builder.tsx:383-405, 615`).
- **R4.2** `syncProgramFromTemplate` (`library-actions.ts:109`) queda en el código **sin callers**,
  con el comentario del porqué — espejo exacto de lo que se hizo en web en `086dc786`.
- **R4.3** No se reescribe el algoritmo. El rediseño seguro (identidad estable de bloque,
  dirty-tracking, diff, snapshot) es un tren aparte.

## Por qué R4 es P0

`library-actions.ts:129-133` borra **todos** los planes y bloques del alumno y recién después
reinserta, uno por uno:

```ts
const oldPlanIds = clientPlans.map((p) => p.id)
if (oldPlanIds.length) {
  await supabase.from('workout_blocks').delete().in('plan_id', oldPlanIds)
  await supabase.from('workout_plans').delete().in('id', oldPlanIds)
}
```

- Los dos `delete` no chequean error.
- No hay transacción: un insert que falle a mitad (`:157`, `:161`) deja al alumno sin rutina, sin rollback.
- Los ids de bloque cambian todos ⇒ los `workout_logs` quedan huérfanos (`block_id = NULL` por
  `20260630190000`): se pierde «sesión anterior», progreso por ejercicio y todo join por `block_id`.
- Un día cuyo merge quede vacío se borra y **no se reinserta** (`:141`).
- El `Alert.alert` de `builder.tsx:385-388` promete que «los ajustes manuales del alumno se conservan».
  Es falso: editar nunca prende `is_override`; solo lo hace un switch escondido
  (`BlockEditorSheet.tsx:497-499`). Es la misma falsa promesa que causó el incidente de web del 15-07,
  cuyo commit registró **112/112 programas vinculados en prod con 0 bloques override**.

La web retiró esta capacidad el 15-07-2026 (`086dc786`). El sync de RN nació el 08-07 (`61c81b8a`),
siete días antes, y nunca se revisó. Paridad pendiente desde entonces.

## Decisiones del owner (2026-09-07)

- **D1-A** Retirar hoy la UI del sync en la app. No se reescribe el algoritmo.
- **D2-A** Plan inactivo: avisar y ofrecer la salida. Se sigue pudiendo editar y guardar.
- **D3-A** Nombres: solo identidad en pantalla. No se renombra nada en la base.

## Fuera de alcance

- Reponer el sync en web (necesita `template_block_id` estable — limitación declarada en
  `packages/workout-engine/workout-save-reconcile.ts:16-20` — dirty-tracking automático, diff previo
  y snapshot; nada de eso existe).
- Tests de `mergeBlocksForSync` (queda sin callers tras R4; entra con el rediseño).
- Migraciones. Cero cambios de esquema: `is_active` y `source_template_id` ya llegan a la UI.
- Reactivar programas desde la UI.
