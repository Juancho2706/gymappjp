/**
 * Gramatica UNICA de "clasificar un alimento en un grupo de porciones" (T2.3 F3).
 *
 * Hasta esta fase la misma pregunta se contestaba en tres piezas distintas de `/coach/foods`,
 * cada una con su propio parseo de gramos y su propia regla de junto-o-nada:
 *
 *  - `ClassifyFoodSheet` (grupo + gramos sobre un alimento PROPIO, via `foods.exchange_*`);
 *  - `ExchangeListEntrySheet` (gramos de UN alimento dentro de UN grupo, via `exchange_group_foods`);
 *  - `ExchangePortionsSection` (`parseNumberEs`, el tercer parseo de coma decimal del archivo).
 *
 * Este modulo es PURO (sin React, sin Supabase, sin Next): recibe el estado leido y el borrador
 * del formulario y devuelve (a) el veredicto de validacion y (b) los PASOS de escritura. Elegir
 * el camino de escritura es logica de negocio, no de UI, y es justo donde las tres piezas viejas
 * se contradecian:
 *
 *  - alimento del coach ⇒ `setFoodExchangeEquivalenceAction`, que escribe las columnas
 *    `foods.exchange_*` Y sincroniza la fila de lista (borrando las mias viejas de ese alimento);
 *  - alimento global / de otro dueño ⇒ el coach NO puede escribir `foods` (la action filtra por
 *    `coach_id = auth.uid()`), asi que su clasificacion vive como fila propia de
 *    `exchange_group_foods`, y reclasificar exige BORRAR la fila del grupo viejo antes de
 *    escribir la del nuevo — si no, el alumno ve el mismo alimento en dos grupos.
 *
 * Los limites y los mensajes son los del SERVIDOR (`@eva/schemas/nutrition-exchanges`), no unos
 * propios: adelantar el veredicto sin round-trip, nunca uno distinto. La UI no autoriza nada.
 */

import {
  EXCHANGE_PORTION_GRAMS_MAX,
  EXCHANGE_PORTION_LABEL_MAX,
  foodExchangeEquivalenceIssue,
} from '@eva/schemas/nutrition-exchanges'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'

const COPY = PORTIONS_COPY.foodEquivalence

/** Mensajes que el servidor solo emite como issue de Zod (no estan en la tabla de microcopy). */
export const CLASSIFICATION_COPY = {
  gramsInvalid: 'Los gramos por porción deben ser un número.',
  gramsTooBig: `Máximo ${EXCHANGE_PORTION_GRAMS_MAX} g por porción.`,
  labelTooLong: `Máximo ${EXCHANGE_PORTION_LABEL_MAX} caracteres para la medida casera.`,
} as const

/** Lo que escribe el coach en el formulario: texto crudo, todavia sin parsear. */
export type FoodClassificationDraft = {
  /** '' = "Sin clasificar" (intencion legitima: quitar la clasificacion). */
  groupId: string
  grams: string
  label: string
}

export const EMPTY_FOOD_CLASSIFICATION: FoodClassificationDraft = { groupId: '', grams: '', label: '' }

/**
 * De donde sale la clasificacion vigente. Importa para el mensaje ("la escribiste tu" vs "viene
 * del catalogo") y, sobre todo, para saber que hay que borrar al reclasificar.
 */
export type FoodClassificationOrigin = 'coach-list-row' | 'food-columns'

export type FoodClassification = {
  groupId: string
  portionGrams: number | null
  portionLabel: string | null
  origin: FoodClassificationOrigin
}

/** Lo que devuelve la lectura server-side, ya normalizado. */
export type FoodClassificationSources = {
  /** Trio `foods.exchange_*` (rama legacy del read-model, rank 3). */
  columns: { groupId: string; portionGrams: number | null; portionLabel: string | null } | null
  /** MIS filas VIVAS de `exchange_group_foods` para ese alimento (rank coach, 0). Sin lapidas. */
  ownRows: { groupId: string; portionGrams: number | null; portionLabel: string | null }[]
}

/**
 * Clasificacion VIGENTE para este coach.
 *
 * Mi fila de lista gana sobre las columnas por la misma razon que en el read-model del alumno:
 * `EXCHANGE_LIST_OWNER_RANK.coach` (0) < `legacy` (3). Si mando la columna, el coach editaria un
 * numero que su alumno no ve.
 *
 * Con mas de una fila propia (estado imposible por diseño, pero posible por una escritura a
 * medias) gana la primera: el orden lo fija la lectura y reclasificar limpia el resto.
 */
export function resolveCurrentClassification(sources: FoodClassificationSources): FoodClassification | null {
  const row = sources.ownRows.find((candidate) => candidate.groupId.length > 0)
  if (row) {
    return {
      groupId: row.groupId,
      portionGrams: row.portionGrams,
      portionLabel: row.portionLabel,
      origin: 'coach-list-row',
    }
  }
  const columns = sources.columns
  if (columns && columns.groupId.length > 0) {
    return {
      groupId: columns.groupId,
      portionGrams: columns.portionGrams,
      portionLabel: columns.portionLabel,
      origin: 'food-columns',
    }
  }
  return null
}

/** Semilla del formulario a partir de lo vigente. Sin clasificacion ⇒ borrador vacio. */
export function draftFromClassification(current: FoodClassification | null): FoodClassificationDraft {
  if (!current) return EMPTY_FOOD_CLASSIFICATION
  return {
    groupId: current.groupId,
    grams: current.portionGrams != null ? String(current.portionGrams) : '',
    label: current.portionLabel ?? '',
  }
}

export type PortionGramsParse =
  | { state: 'empty' }
  | { state: 'invalid' }
  | { state: 'too-big' }
  | { state: 'value'; value: number }

/**
 * Parseo unico de los gramos por porcion. Acepta coma decimal es-CL ("22,5") porque el teclado
 * numerico de es-CL la escribe, y separa "vacio" de "invalido": el primero es el caso normal de
 * un alimento sin clasificar y el segundo es un error que hay que mostrar.
 */
export function parsePortionGrams(raw: string): PortionGramsParse {
  const trimmed = (raw ?? '').trim().replace(',', '.')
  if (trimmed === '') return { state: 'empty' }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return { state: 'invalid' }
  if (value > EXCHANGE_PORTION_GRAMS_MAX) return { state: 'too-big' }
  return { state: 'value', value }
}

export type FoodClassificationIssue = { field: 'group' | 'grams' | 'label'; message: string }

/**
 * Primer problema del borrador, o `null` si se puede guardar.
 *
 * La regla junto-o-nada (grupo ⇔ gramos, y la medida casera no vive sola) NO se reimplementa:
 * la resuelve `foodExchangeEquivalenceIssue`, el MISMO helper que corre dentro de
 * `setFoodExchangeEquivalenceAction`. Los chequeos propios son solo los que el servidor expresa
 * como issues de Zod sobre el tipo (no es numero / pasado de rango / etiqueta larga).
 */
export function validateFoodClassificationDraft(
  draft: FoodClassificationDraft,
): FoodClassificationIssue | null {
  const grams = parsePortionGrams(draft.grams)
  if (grams.state === 'invalid') return { field: 'grams', message: CLASSIFICATION_COPY.gramsInvalid }
  if (grams.state === 'too-big') return { field: 'grams', message: CLASSIFICATION_COPY.gramsTooBig }

  const label = (draft.label ?? '').trim()
  if (label.length > EXCHANGE_PORTION_LABEL_MAX) {
    return { field: 'label', message: CLASSIFICATION_COPY.labelTooLong }
  }

  const issue = foodExchangeEquivalenceIssue({
    exchangeGroupId: draft.groupId.length > 0 ? draft.groupId : null,
    exchangePortionGrams: grams.state === 'value' ? grams.value : null,
    exchangePortionLabel: label.length > 0 ? label : null,
  })
  if (!issue) return null
  return {
    field: issue.path === 'exchangeGroupId' ? 'group' : 'grams',
    // La tabla de microcopy es la fuente para los dos casos de junto-o-nada.
    message: issue.path === 'exchangeGroupId' ? COPY.groupRequired : COPY.gramsRequired,
  }
}

export type ClassificationStep =
  /** Alimento PROPIO: columnas `foods.exchange_*` + sync de la fila de lista, en un solo action. */
  | {
      kind: 'set-food-equivalence'
      foodId: string
      exchangeGroupId: string | null
      exchangePortionGrams: number | null
      exchangePortionLabel: string | null
    }
  /** Alimento que no es mio: mi fila propia en la lista del grupo. */
  | {
      kind: 'save-list-entry'
      foodId: string
      exchangeGroupId: string
      portionGrams: number
      portionLabel: string | null
    }
  /** Borra MI fila del grupo ⇒ vuelve a mandar el catalogo (o desaparece si el catalogo no lo tiene). */
  | { kind: 'clear-list-entry'; foodId: string; exchangeGroupId: string }
  /**
   * Lapida en el grupo del CATALOGO. Borrar mi fila no alcanza cuando quien clasifica es
   * `foods.exchange_group_id`: esa columna es la rama LEGACY del read-model del alumno
   * (`20260804091000_nutrition_v2_exchange_foods_from_lists.sql`, `owner_rank = 3`) y yo no
   * puedo escribirla en un alimento ajeno. La unica forma de apagarla para MIS alumnos es una
   * fila propia con `is_excluded`, que gana por rank 0 y cae en el `where not cand.is_excluded`.
   */
  | { kind: 'exclude-list-entry'; foodId: string; exchangeGroupId: string }

export type ClassificationPlan =
  | { ok: true; steps: ClassificationStep[] }
  | { ok: false; issue: FoodClassificationIssue }

/**
 * Pasos de escritura para llevar al alimento al estado que pide el borrador.
 *
 * Idempotente a proposito: guardar dos veces lo mismo produce los mismos pasos y el mismo estado
 * final. Quien decide si vale la pena escribir es la UI, con `hasClassificationChanges`.
 *
 * El ORDEN importa en el camino de lista: primero se borra la fila del grupo viejo y despues se
 * escribe la del nuevo. Al reves, un fallo intermedio dejaria el alimento en los DOS grupos.
 */
export function planFoodClassification(input: {
  foodId: string
  /** true ⇒ `foods.coach_id` es el actor: puede escribir las columnas. Lo dice el SERVIDOR. */
  ownedByActor: boolean
  current: FoodClassification | null
  /**
   * `foods.exchange_group_id` del alimento, si lo tiene. Solo importa cuando el alimento NO es
   * mio: es el grupo que la rama legacy le impone a mis alumnos y que hay que tapar con lapida
   * si lo reclasifico en otro lado (si no, el alumno lo ve en DOS grupos).
   */
  catalogGroupId?: string | null
  draft: FoodClassificationDraft
}): ClassificationPlan {
  const issue = validateFoodClassificationDraft(input.draft)
  if (issue) return { ok: false, issue }

  const grams = parsePortionGrams(input.draft.grams)
  const targetGroupId = input.draft.groupId.length > 0 ? input.draft.groupId : null
  const label = (input.draft.label ?? '').trim()
  const portionLabel = label.length > 0 ? label : null
  const portionGrams = grams.state === 'value' ? grams.value : null

  if (input.ownedByActor) {
    return {
      ok: true,
      steps: [
        {
          kind: 'set-food-equivalence',
          foodId: input.foodId,
          exchangeGroupId: targetGroupId,
          exchangePortionGrams: targetGroupId ? portionGrams : null,
          exchangePortionLabel: targetGroupId ? portionLabel : null,
        },
      ],
    }
  }

  const steps: ClassificationStep[] = []
  const myGroupId = input.current?.origin === 'coach-list-row' ? input.current.groupId : null
  const catalogGroupId = input.catalogGroupId && input.catalogGroupId.length > 0 ? input.catalogGroupId : null

  // Retirar de los grupos viejos ANTES de escribir el nuevo: al reves, un fallo intermedio
  // dejaria el alimento en los dos. `Set` porque mi fila y la del catalogo pueden ser el MISMO
  // grupo, y ahi la lapida sola hace las dos cosas (el upsert reescribe mi fila existente).
  const retire = new Set<string>()
  if (myGroupId && myGroupId !== targetGroupId) retire.add(myGroupId)
  if (catalogGroupId && catalogGroupId !== targetGroupId) retire.add(catalogGroupId)
  for (const groupId of retire) {
    steps.push({
      kind: groupId === catalogGroupId ? 'exclude-list-entry' : 'clear-list-entry',
      foodId: input.foodId,
      exchangeGroupId: groupId,
    })
  }

  if (targetGroupId && portionGrams != null) {
    steps.push({
      kind: 'save-list-entry',
      foodId: input.foodId,
      exchangeGroupId: targetGroupId,
      portionGrams,
      portionLabel,
    })
  }
  return { ok: true, steps }
}

/**
 * ¿El borrador dice algo distinto de lo vigente? Sirve para no gastar un round-trip (ni un toast
 * de "guardado") cuando el coach abre el sheet, mira y cierra.
 *
 * Compara el borrador YA normalizado: "22,5" y "22.5" son el mismo numero, y una etiqueta con
 * espacios de sobra es la misma etiqueta.
 */
export function hasClassificationChanges(
  current: FoodClassification | null,
  draft: FoodClassificationDraft,
): boolean {
  const grams = parsePortionGrams(draft.grams)
  const targetGroupId = draft.groupId.length > 0 ? draft.groupId : null
  const label = (draft.label ?? '').trim()

  if ((current?.groupId ?? null) !== targetGroupId) return true
  // Sin grupo destino los otros dos campos no viajan: el servidor los pone en NULL.
  if (targetGroupId == null) return false
  if ((grams.state === 'value' ? grams.value : null) !== (current?.portionGrams ?? null)) return true
  return (label.length > 0 ? label : null) !== (current?.portionLabel ?? null)
}

/**
 * Frase de preview con la tabla de microcopy canonica (`PORTIONS_COPY.foodEquivalence.preview`).
 * Port del `foodEquivalencePreview` que vivia dentro de `FoodEquivalenceFields` de `/coach/foods`
 * — misma regla: sin el par grupo+gramos completo no se muestra nada, porque el texto mentiria.
 */
export function classificationPreview(
  draft: FoodClassificationDraft,
  groups: readonly { id: string; name: string }[],
): string | null {
  const group = groups.find((candidate) => candidate.id === draft.groupId)
  const grams = parsePortionGrams(draft.grams)
  if (!group || grams.state !== 'value') return null
  const label = (draft.label ?? '').trim()
  return COPY.preview(group.name, String(grams.value), label.length > 0 ? label : null)
}
