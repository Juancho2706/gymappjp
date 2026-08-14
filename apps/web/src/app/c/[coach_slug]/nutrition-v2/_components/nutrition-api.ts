'use client'

/**
 * Cliente HTTP del área del alumno (QA T2.7 F4, hallazgo H12 — 2026-08-14).
 *
 * Reemplaza la invocación DIRECTA de las server actions desde el navegador: cada helper llama
 * al puente `/api/student/nutrition-v2` con `fetch()`, que NO pasa por el ActionQueue del App
 * Router. Motivo: en Next 16.3.0 la server action de "marcar un alimento" dejaba el router
 * incapaz de navegar hasta recargar (ver el docblock del route handler). Mismos nombres y
 * MISMAS firmas que las funciones de `_actions/*` — los call sites solo cambian el import.
 */

type IntakeActions = typeof import('../_actions/intake.actions')
type FavoriteActions = typeof import('../_actions/favorites.actions')
type TodayActions = typeof import('../_actions/today.actions')
type HistoryActions = typeof import('../_actions/history.actions')

async function call(op: string, input: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch('/api/student/nutrition-v2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, input }),
      credentials: 'same-origin',
    })
  } catch {
    // Red caída: mismo shape de fallo que devuelven las funciones de _actions, para que los
    // catch/branch de la UI no distingan el transporte.
    return { ok: false, error: 'Sin conexión. Revisa tu red e inténtalo de nuevo.' }
  }
  try {
    return await res.json()
  } catch {
    return { ok: false, error: 'No se pudo completar la acción. Intenta de nuevo.' }
  }
}

export const recordIntakeAction: IntakeActions['recordIntakeAction'] = (input) =>
  call('record', input) as ReturnType<IntakeActions['recordIntakeAction']>
export const correctIntakeAction: IntakeActions['correctIntakeAction'] = (input) =>
  call('correct', input) as ReturnType<IntakeActions['correctIntakeAction']>
export const voidIntakeAction: IntakeActions['voidIntakeAction'] = (input) =>
  call('void', input) as ReturnType<IntakeActions['voidIntakeAction']>
export const recordSlotIntakeBatchAction: IntakeActions['recordSlotIntakeBatchAction'] = (input) =>
  call('batchRecord', input) as ReturnType<IntakeActions['recordSlotIntakeBatchAction']>
export const voidSlotIntakeBatchAction: IntakeActions['voidSlotIntakeBatchAction'] = (input) =>
  call('batchVoid', input) as ReturnType<IntakeActions['voidSlotIntakeBatchAction']>
export const recordSubstitutionIntakeAction: IntakeActions['recordSubstitutionIntakeAction'] = (
  input,
) => call('substitute', input) as ReturnType<IntakeActions['recordSubstitutionIntakeAction']>
export const loadSubstitutionGroupPageAction: IntakeActions['loadSubstitutionGroupPageAction'] = (
  input,
) => call('substitutionGroupPage', input) as ReturnType<IntakeActions['loadSubstitutionGroupPageAction']>
export const searchFoodCatalogAction: IntakeActions['searchFoodCatalogAction'] = (input) =>
  call('search', input) as ReturnType<IntakeActions['searchFoodCatalogAction']>
export const markPortionIntakeAction: IntakeActions['markPortionIntakeAction'] = (input) =>
  call('markPortion', input) as ReturnType<IntakeActions['markPortionIntakeAction']>
export const undoPortionIntakeAction: IntakeActions['undoPortionIntakeAction'] = (input) =>
  call('undoPortion', input) as ReturnType<IntakeActions['undoPortionIntakeAction']>
export const getFavoriteFoodIdsAction: FavoriteActions['getFavoriteFoodIdsAction'] = (input) =>
  call('favoriteIds', input) as ReturnType<FavoriteActions['getFavoriteFoodIdsAction']>
export const listFavoriteFoodsAction: FavoriteActions['listFavoriteFoodsAction'] = (input) =>
  call('favoriteList', input) as ReturnType<FavoriteActions['listFavoriteFoodsAction']>
export const toggleFavoriteFoodAction: FavoriteActions['toggleFavoriteFoodAction'] = (input) =>
  call('favoriteToggle', input) as ReturnType<FavoriteActions['toggleFavoriteFoodAction']>
export const fetchNutritionTodayAction: TodayActions['fetchNutritionTodayAction'] = (input) =>
  call('fetchToday', input) as ReturnType<TodayActions['fetchNutritionTodayAction']>
export const fetchNutritionHistoryWeeksAction: HistoryActions['fetchNutritionHistoryWeeksAction'] = (
  input,
) => call('historyWeeks', input) as ReturnType<HistoryActions['fetchNutritionHistoryWeeksAction']>
