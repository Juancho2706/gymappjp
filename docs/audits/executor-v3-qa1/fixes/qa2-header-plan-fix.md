# QA2-C — Consistencia de conteos del header + "Plan completo" solo lectura

Unidad: qa2-header-plan. Rama fix/executor-v3-qa1. Sin commits (por instruccion).

## Decision del jefe aplicada
Unificar TODO el vocabulario del ejecutor V3 a **ejercicios individuales** (cada miembro de superserie
cuenta como uno) y convertir el "Plan completo" (mapa "Ver todo" + peek de descanso + lista RN) en
**solo lectura**. Web y RN espejados en la misma unidad.

## Diagnostico
- El header ya contaba por bloque (`blocks.length`), pero el "ejercicio activo" salia del **primer
  bloque incompleto** del grupo. En una superserie el motor intercala rondas (A1→B1→A2…), asi que ese
  "primer incompleto" es siempre el miembro A hasta la ultima ronda — NO el miembro que el alumno esta
  trabajando. El chip interno ("Ronda 2 de 3", miembro B activo) no cuadraba con el header.
- El mapa "Plan completo" (`ExecListMapV3` web / `ExerciseListV3` RN) y el peek contaban por **paso**
  (superserie = 1 fila), rompiendo el vocabulario respecto al header y a las barras de progreso.
- Las filas del mapa web y del peek web **navegaban** (`onJump`/`handleJump` → salto de stepper). El
  peek RN y las filas RN ya mostraban estado pero la lista RN full-screen tambien saltaba (`onJumpTo`).

## Cambios — HALLAZGO 1 (conteos)
Motor de guardado/cola INTOCADO. Todo lo nuevo es derivacion de presentacion.

- **`headerActiveBlockId`** (nuevo, web `WorkoutExecutionClient.tsx` + RN `ExecutorV3.tsx`): "ejercicio
  activo" a nivel individual. Si el bloque activo es miembro de superserie, se resuelve con
  `firstIncompleteInRounds` (motor `superset-rounds`, ya existente); fuera de superserie coincide con el
  `activeBlockId` de siempre. `activeBlockId` global se dejo INTACTO (lo usan interstitial/scroll/box-shadow).
- Header `N`: posicion 1-based de `headerActiveBlockId` dentro de `blocks`. `M` = `blocks.length`
  (cardio/movilidad/roller cuentan 1 c/u; ya eran bloques sueltos).
- Dots del header: `.done` = `isBlockComplete` (todas las series/rondas del bloque), `.now` sigue al
  miembro activo de la superserie (antes seguia al 1er incompleto).
- `execListMapItems` (web) y `listItems` (RN): reconstruidos con **flatMap por bloque** — una fila por
  ejercicio individual; miembros de superserie con su letra A/B/C y `groupTitle` "Superserie X" en el
  primer miembro. `doneSets`/`totalSets`/`complete` por bloque; `isCurrent` = `headerActiveBlockId`.
- Titulo "Plan completo · N" agregado (web `ExecListMapV3`, header RN `ExerciseListV3`) usando el mismo M.
- Peek de descanso (web + RN): mismas filas por bloque, con encabezado de grupo + letra; contador
  "hechos / M" ahora sobre ejercicios individuales.

## Cambios — HALLAZGO 2 (solo lectura)
- `ExecListMapV3` (web): fila `<button onClick=onJump>` → `<div>` no interactivo; prop `onJump` y campo
  `stepIndex` eliminados; regla CSS `.exec-v3-map-row:hover` quitada (sin affordance de tap).
- Peek web (`RestInterstitialV3`): `<button onClick=handleJump>` → `<div>`; `onJump` fuera de
  `RestInterstitialData` y del provider.
- `ExerciseListV3` (RN): filas `<Pressable onPress=onJumpTo>` → `<View>`; props `currentIndex`/`onJumpTo`
  y campo `index` eliminados; `isCurrent` por item. El boton cerrar (X) y el FAB "Volver al ejercicio"
  (chrome de navegacion, no ejecucion) se conservan.
- Peek RN: ya era `<View>` no interactivo; se le quito `currentIndex` (usa `isCurrent`) y se le agrego
  grupo + letra.

## CSS (globals.css, quirurgico, anclas unicas)
Nuevas clases scoped `[data-exec-v3]`: `.exec-v3-map-group`, `.exec-v3-map-letter`,
`.exec-v3-map-row-member` (indent), `.exec-v3-sgroup`, `.exec-v3-sletter`. Tinta sobre marca via
`var(--exec-brand)` / `var(--exec-brand-ink)`; nada de verdes hardcodeados. Quitada `.exec-v3-map-row:hover`.

## Verificacion de consistencia (superserie de 3 + sueltos)
Ronda 2 con miembro B activo → header "Ejercicio (idx B) de M", chip "Ronda 2 de 3", dots
[A todo, B now, C todo], lista/peek: 3 filas bajo "Superserie X" (A 2/3, B ahora, C 1/3). Mismo M en
header, titulo y contador del peek. Cardio/movilidad/roller = 1 fila / 1 dot cada uno.

## tsc
- `apps/web`: `tsc --noEmit` limpio.
- `apps/mobile`: `tsc --noEmit` limpio.

## Nota / pendiente para el jefe
En la **web**, el modo "Ver todo" (toggle Lista/Paso a paso) muestra el mapa read-only y DEBAJO la lista
completa de cards `renderGroup` **interactivas** (modo de ejecucion en lista, legado V2). En RN no existe
ese modo: `ExerciseListV3` es un modal puramente de lectura. Mi unidad hizo read-only las FILAS del mapa
(alcance del brief), pero las cards interactivas de abajo siguen permitiendo registrar series desde "Ver
todo". Si la intencion del CEO ("solo para ver") cubre TODO ese modo, hay que decidir si el modo
lista-ejecucion web se retira/oculta en V3 — cambio mayor fuera del alcance de esta unidad.
