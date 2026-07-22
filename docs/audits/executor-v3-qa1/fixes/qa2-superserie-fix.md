# QA2-A — Superserie: overlay legible + pill duplicado fuera + editar miembros anteriores

Ronda QA2 (feedback device real CEO, PWA). Web espejada a RN en la misma unidad. Motor de
resiliencia INTOCADO: sólo props aditivas, ramas de render y reuso de handlers existentes.

## Archivos tocados
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SupersetStepV3.tsx`
- `apps/web/src/app/globals.css` (bloques superserie, ediciones quirúrgicas con anclas únicas)
- `apps/mobile/components/alumno/workout/v3/SupersetScreenV3.tsx`

## Hallazgo 1 — Overlay "¡Sigue sin detenerte!" ilegible sobre la media
- **Web (globals.css `.exec-v3-ss-cue*`):** fondo `rgba(8,8,12,.72)` → `rgba(5,5,9,.88)`. Título:
  contorno oscuro `-webkit-text-stroke: 1px rgba(0,0,0,.9)` + `text-shadow` en capas
  (`0 2px 6px rgba(0,0,0,.9)` + el glow de marca existente), texto en `var(--exec-brand)`. Nombre
  del siguiente ejercicio: blanco `#fff` con sombra oscura `0 1px 4px rgba(0,0,0,.9)`.
- **RN (SupersetScreenV3, overlay MotiView):** fondo `rgba(5,5,9,0.88)`. RN no tiene text-stroke →
  se optó por sombra oscura fuerte estable: título en `exec.accent` con
  `textShadowColor 'rgba(0,0,0,0.9)'`, radius 12, offset {0,2}; nombre en blanco con sombra oscura
  radius 6.

## Hallazgo 2 — Pill duplicado "Sin descanso — sigue con {X}"
- Eliminado por completo en web (JSX `.exec-v3-ss-link` + `.exec-v3-ss-arrow`) y RN (bloque pill +
  componente `SlideArrow`). La NOTA de descanso de grupo ("Descanso Ns al cerrar la ronda") es un
  elemento DISTINTO y se conserva intacta en ambas apps.
- Limpieza CSS: removidas reglas muertas `.exec-v3-ss-link`, `.exec-v3-ss-arrow(::before/::after)`,
  las animaciones de flecha y los keyframes `exec-v3-ss-arrow`/`exec-v3-ss-arrowline`. El latido del
  dot de ronda activo (`exec-v3-ss-beat`) se preservó dentro del mismo `@media no-preference`.
- Limpieza JS: removida la variable `nextLetter` (sólo alimentaba el pill). `nextInRound` se conserva
  (alimenta el aviso efímero y el estado "Sigue").

## Hallazgo 3 — Editar miembros anteriores de la ronda (pedido nuevo)
Superserie A-B-C estando en C: ahora se puede corregir A o B ya hechos.
- **Affordance:** la tarjeta COLAPSADA de un miembro HECHO (check) es tappable y muestra un lápiz
  chico junto al check. Los miembros PENDIENTES/`next` no son interactivos.
  - Web: `div role="button"` + `tabIndex` + `onKeyDown` (Enter/Espacio) + `aria-label="Editar {n}"`;
    ícono `Pencil` en `.exec-v3-exedit`; el botón de técnica lleva `stopPropagation`. Clase
    `.exec-v3-excard-edit` (cursor pointer + active scale).
  - RN: `Pressable onPress={() => setEditBlockId(...)}` (antes llamaba directo `onOpenSet` sólo de la
    ronda actual); `Pencil` + `Check` en fila.
- **Sheet "Editar {nombre}":** oscuro V3, monta la vista clásica de filas del motor para ESE bloque.
  - Web: reusa el chrome `.exec-v3-sheet-scrim` + `.exec-v3-settings` (framer-motion, igual que
    TechniqueSheetV3) y monta un `LogSetForm` por serie registrada del bloque (`existingLog`,
    `v3 heroV3`). Es el MISMO motor de edición del chip colapsado (tap → `setEditing(true)`); se
    pasa `onLogged` PLANO (no dispara el aviso), sin `supersetRest` (editar serie cerrada no toca el
    descanso; `buildRest` ya corta con `isLogged`).
  - RN: reusa `Sheet` (`nativeModal forceDark snapPoints={['60%']}`) montando `SetRow` por serie
    registrada — patrón idéntico al sheet "Editar series anteriores" del lápiz en `ExerciseScreenV3`.
    La edición real la resuelve `onOpenSet` (orquestador `ExecutorV3`, NO tocado).

## Verificación
- `tsc --noEmit` web: 0 errores.
- `tsc --noEmit` mobile: 0 errores.
- No se tocaron: ExecHeaderV3/ExecListMapV3, WEC, ExecutorV3 RN, LogSetForm/SetRow (sólo lectura).
- Sin commits (por instrucción).
