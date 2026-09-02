import type { ExerciseType } from '@eva/workout-engine'
import type { BuilderBlock, DayState } from './types'

/**
 * Reconciliar los bloques YA colocados en el día contra el catálogo recién releído (E1-RN).
 *
 * EL BUG QUE CIERRA. Cuando el coach edita uno de sus ejercicios propios desde el preview del
 * catálogo (`ExerciseSearchSheet` → `ExerciseFormSheet` → `onSaved`), el builder solo relee el
 * CATÁLOGO (`catalogReloadKey`). Los bloques que ya estaban en el día conservan el nombre, la
 * media y el tipo que se les copiaron al agregarlos: la fila del día seguía diciendo «Press banca»
 * después de renombrarlo, y el editor seguía ofreciendo series/reps para un ejercicio que ahora es
 * cardio. Hasta acá la única salida era recargar el builder entero.
 *
 * QUÉ SE TOCA Y QUÉ NO. Solo los campos que son un ESPEJO del catálogo (`exercises`): nombre,
 * grupo muscular, media y tipo. La prescripción del coach (series, reps, carga, descanso, notas,
 * superserie, área, `exercise_type_override`) no se toca NUNCA: es del bloque, no del ejercicio.
 *
 * NO ES UN CAMBIO QUE SE GUARDE. Ninguno de estos campos es columna de `workout_blocks`
 * (ver `serialize.ts`): viajan en el embed `exercises ( ... )` y se rehidratan en cada lectura.
 * Por eso el llamador trata la reconciliación como cosmética y NO marca el programa como «sin
 * guardar»; lo único que cambia es lo que el coach ve.
 *
 * IDENTIDAD ESTABLE. Si nada cambió se devuelve EXACTAMENTE el mismo array (y los mismos objetos
 * de día y de bloque). Eso es lo que deja al llamador comparar por referencia y no disparar
 * re-renders, autosave ni el badge de cambios cuando el catálogo volvió idéntico.
 *
 * UN EJERCICIO QUE YA NO ESTÁ EN EL CATÁLOGO SE DEJA INTACTO. `onCatalogChanged` también se
 * dispara al eliminar (y al deshacer la eliminación), y un bloque cuyo ejercicio desapareció
 * conserva su nombre: borrarle el texto dejaría al coach mirando una fila anónima.
 */

/** Lo que el catálogo manda sobre un bloque ya colocado. Subconjunto de `ExerciseRow`. */
export interface CatalogExerciseFacts {
  id: string
  name: string
  muscle_group: string
  gif_url: string | null
  video_url: string | null
  exercise_type: string | null
  cardio_modality: string | null
}

/** `''`/`null` del catálogo ⇒ `undefined`, que es como el builder representa «sin media». */
function optional(value: string | null | undefined): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : undefined
}

const EXERCISE_TYPES: readonly ExerciseType[] = ['strength', 'cardio', 'mobility', 'roller']

/** Tipo del catálogo, solo si es uno de los 4 conocidos. Lo desconocido se ignora (no se borra). */
function asExerciseType(value: string | null | undefined): ExerciseType | null | undefined {
  if (value == null) return null
  return (EXERCISE_TYPES as readonly string[]).includes(value) ? (value as ExerciseType) : undefined
}

/**
 * Un bloque contra su fila de catálogo. Devuelve el MISMO objeto si no hay nada que actualizar.
 */
export function reconcileBlockWithCatalog(
  block: BuilderBlock,
  row: CatalogExerciseFacts | undefined,
): BuilderBlock {
  if (!row) return block

  const name = row.name.trim() || block.exercise_name
  const muscleGroup = row.muscle_group?.trim() || block.muscle_group
  const gifUrl = optional(row.gif_url)
  const videoUrl = optional(row.video_url)
  const exerciseType = asExerciseType(row.exercise_type)
  const cardioModality = optional(row.cardio_modality) ?? null

  // `undefined` de `asExerciseType` = valor no reconocido ⇒ se conserva el que tenía el bloque.
  const nextType = exerciseType === undefined ? block.exercise_type : exerciseType

  const changed =
    block.exercise_name !== name
    || block.muscle_group !== muscleGroup
    || block.gif_url !== gifUrl
    || block.video_url !== videoUrl
    || (block.exercise_type ?? null) !== (nextType ?? null)
    || (block.cardio_modality ?? null) !== cardioModality

  if (!changed) return block

  return {
    ...block,
    exercise_name: name,
    muscle_group: muscleGroup,
    gif_url: gifUrl,
    video_url: videoUrl,
    exercise_type: nextType,
    cardio_modality: cardioModality,
  }
}

/**
 * Todos los días de una variante. Devuelve el MISMO array (y los mismos días) si nada cambió.
 *
 * `catalog` se recibe como `Map` para que el llamador la arme una vez y la comparta entre las dos
 * variantes (A y B) sin recorrer el catálogo dos veces.
 */
export function reconcileDaysWithCatalog(
  days: readonly DayState[],
  catalog: ReadonlyMap<string, CatalogExerciseFacts>,
): DayState[] {
  if (catalog.size === 0) return days as DayState[]

  let daysChanged = false
  const next = days.map((day) => {
    let blocksChanged = false
    const blocks = day.blocks.map((block) => {
      const reconciled = reconcileBlockWithCatalog(block, catalog.get(block.exercise_id))
      if (reconciled !== block) blocksChanged = true
      return reconciled
    })
    if (!blocksChanged) return day
    daysChanged = true
    return { ...day, blocks }
  })

  return daysChanged ? next : (days as DayState[])
}

/** Índice por id a partir de las filas del catálogo, en la forma que espera la reconciliación. */
export function catalogFactsById(
  rows: readonly CatalogExerciseFacts[],
): Map<string, CatalogExerciseFacts> {
  return new Map(rows.map((row) => [row.id, row]))
}
