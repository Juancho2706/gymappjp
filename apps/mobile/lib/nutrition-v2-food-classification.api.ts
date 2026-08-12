import type {
  ClassificationStep,
  FoodClassificationSources,
  NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { ApiError, apiFetch } from './api'
import {
  excludeExchangeListEntry,
  restoreExchangeListEntry,
  saveExchangeListEntry,
} from './nutrition-v2-exchange-lists.api'

/**
 * Cliente móvil de "clasificar un alimento en un grupo de porciones" (T2.3 F6.4) — espejo del
 * camino que la web resuelve con server actions en `ClassifyFoodFlow`.
 *
 * QUÉ VIVE ACÁ Y QUÉ NO. La GRAMÁTICA (qué se puede guardar y con qué escrituras) es del módulo
 * puro `food-classification` de `@eva/nutrition-v2`: el teléfono NO decide si un alimento se
 * clasifica por columnas o por fila de lista. Este archivo es solo el transporte: leer el estado
 * vigente y ejecutar UN paso del plan contra el endpoint que le corresponde.
 *
 * DOS FAMILIAS DE ENDPOINT, a propósito, porque son dos escrituras distintas del servidor:
 *  - `set-food-equivalence` (alimento PROPIO ⇒ columnas `foods.exchange_*` + sync de la lista) va
 *    por la acción `setFoodEquivalence` de `/api/mobile/nutrition-v2/coach/mutate`, que es donde
 *    vive el gate de rollout + workspace + entitlement del coach;
 *  - los tres pasos de LISTA (alimento ajeno/global ⇒ mi fila de `exchange_group_foods`) van por
 *    `/api/mobile/nutrition/exchanges/group-foods`, que ya corre `gateExchanges` server-side y es
 *    exactamente el mismo servicio que usa la web (ver `nutrition-v2-exchange-lists.api.ts`).
 *
 * La UI nunca autoriza: cada endpoint re-verifica sesión, visibilidad del grupo y RLS.
 */

const COACH_MUTATE_PATH = '/api/mobile/nutrition-v2/coach/mutate'

/**
 * Falla de red (el endpoint no respondió): honesta y distinta de un rechazo del servidor. Copia
 * literal de la de `nutrition-v2.api.ts` — su `coachMutate` es privado del módulo y exportarlo
 * solo para este archivo ensancharía la superficie de un helper que ya tiene siete llamadores.
 */
const NETWORK_FAILURE_COPY =
  'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'

/** Lo que el servidor sabe del alimento: sus fuentes de clasificación + quién es su dueño. */
export type FoodClassificationRead = FoodClassificationSources & {
  /** true ⇒ `foods.coach_id` es el actor: puede escribir las columnas. Lo dice el SERVIDOR. */
  ownedByActor: boolean
}

export type FoodClassificationWriteResult = { ok: true } | { ok: false; code: string; error: string }

/**
 * Normaliza una fuente (columnas o fila de lista). Descarta la fila sin `groupId`: sin grupo no
 * clasifica nada, y dejarla pasar haría que `resolveCurrentClassification` la eligiera como
 * "vigente" por ser la primera del arreglo.
 */
function classificationRowOf(
  raw: unknown,
): { groupId: string; portionGrams: number | null; portionLabel: string | null } | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.groupId !== 'string' || row.groupId.length === 0) return null
  return {
    groupId: row.groupId,
    portionGrams: typeof row.portionGrams === 'number' ? row.portionGrams : null,
    portionLabel: typeof row.portionLabel === 'string' ? row.portionLabel : null,
  }
}

/**
 * Estado VIGENTE del alimento para este coach. Se lee en cada apertura del formulario (no se
 * cachea): entre una y otra el coach pudo clasificar el mismo alimento desde la web o desde el
 * builder, y abrir con un valor viejo terminaría pisando su propio trabajo.
 *
 * Lanza (`ApiError`) igual que las otras lecturas del catálogo móvil: la pantalla ya necesita
 * ramificar entre "cargando", "falló" y "listo", y un resultado tipado la obligaría a inventar un
 * mensaje para el caso de red.
 */
export async function fetchFoodClassificationRN(input: {
  foodId: string
  signal?: AbortSignal
}): Promise<FoodClassificationRead> {
  const params = new URLSearchParams({ foodId: input.foodId, surface: 'coach' })
  const raw = await apiFetch<{ ok?: boolean; classification?: unknown }>(
    `/api/mobile/nutrition-v2/food-classification?${params.toString()}`,
    { authenticated: true, signal: input.signal },
  )
  const classification =
    raw.ok === true && raw.classification && typeof raw.classification === 'object'
      ? (raw.classification as Record<string, unknown>)
      : null
  if (!classification) throw new Error('No pudimos leer la clasificación de este alimento.')
  return {
    ownedByActor: classification.ownedByActor === true,
    columns: classificationRowOf(classification.columns),
    ownRows: Array.isArray(classification.ownRows)
      ? classification.ownRows
          .map(classificationRowOf)
          .filter((row): row is NonNullable<ReturnType<typeof classificationRowOf>> => row != null)
      : [],
  }
}

/**
 * Columnas `foods.exchange_*` del alimento PROPIO. El servidor sincroniza además mi fila de lista
 * (borrando las viejas de ese alimento), así que este paso viaja solo: no hay que combinarlo con
 * los de lista, y el módulo puro nunca los emite juntos.
 */
export async function setFoodEquivalenceRN(input: {
  scope: NutritionV2CoachScope
  foodId: string
  exchangeGroupId: string | null
  exchangePortionGrams: number | null
  exchangePortionLabel: string | null
}): Promise<FoodClassificationWriteResult> {
  try {
    const raw = await apiFetch<{ ok?: boolean; error?: string; code?: string }>(COACH_MUTATE_PATH, {
      method: 'POST',
      authenticated: true,
      body: {
        action: 'setFoodEquivalence',
        workspace: input.scope,
        foodId: input.foodId,
        exchangeGroupId: input.exchangeGroupId,
        exchangePortionGrams: input.exchangePortionGrams,
        exchangePortionLabel: input.exchangePortionLabel,
      },
    })
    if (raw.ok === true) return { ok: true }
    // 200 con `ok: false`: el endpoint contestó pero rechazó la escritura.
    return {
      ok: false,
      code: typeof raw.code === 'string' ? raw.code : 'WRITE_FAILED',
      error: typeof raw.error === 'string' ? raw.error : 'No pudimos guardar la equivalencia.',
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, code: error.code ?? 'WRITE_FAILED', error: error.message }
    }
    return { ok: false, code: 'NETWORK', error: NETWORK_FAILURE_COPY }
  }
}

/**
 * Ejecuta UN paso del plan contra el endpoint que le corresponde. Sin lógica de negocio acá: el
 * orden de los pasos y cuáles existen lo decidió `planFoodClassification`.
 *
 * El mapeo es el MISMO que el `runStep` de la web (`ClassifyFoodFlow.tsx:73-104`), incluida la
 * pareja que se lee al revés de lo que sugiere su nombre: `clear-list-entry` ⇒ **restore**
 * (`DELETE`), porque borrar MI fila es justamente lo que devuelve el alimento al valor del
 * catálogo; `exclude-list-entry` ⇒ **exclude** (`PATCH`), la lápida que tapa la rama legacy
 * `foods.exchange_group_id` de un alimento ajeno que yo no puedo escribir.
 */
export async function runClassificationStepRN(
  scope: NutritionV2CoachScope,
  step: ClassificationStep,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (step.kind === 'set-food-equivalence') {
    const result = await setFoodEquivalenceRN({
      scope,
      foodId: step.foodId,
      exchangeGroupId: step.exchangeGroupId,
      exchangePortionGrams: step.exchangePortionGrams,
      exchangePortionLabel: step.exchangePortionLabel,
    })
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }
  if (step.kind === 'save-list-entry') {
    return saveExchangeListEntry({
      exchangeGroupId: step.exchangeGroupId,
      foodId: step.foodId,
      portionGrams: step.portionGrams,
      portionLabel: step.portionLabel,
    })
  }
  if (step.kind === 'exclude-list-entry') {
    return excludeExchangeListEntry({
      exchangeGroupId: step.exchangeGroupId,
      foodId: step.foodId,
    })
  }
  return restoreExchangeListEntry({
    exchangeGroupId: step.exchangeGroupId,
    foodId: step.foodId,
  })
}
