'use client'

/**
 * Señales del ALUMNO y del COACH que el picker de alimentos necesita en cada fila:
 * quién es el coach en pantalla (para separar "Mis alimentos"), su nombre para los títulos,
 * las restricciones dietarias declaradas y los favoritos.
 *
 * Viaja por contexto y no por props para no re-firmar la cadena
 * `PlanBuilderClient -> ConstructionStep -> SlotEditor -> ItemRow -> SubstitutionsField`
 * (ni la del quick-edit) solo para que la hoja pinte una estrellita o bloquee un alérgeno.
 * Cada superficie monta el provider UNA vez, con lo que su page ya resolvió server-side.
 *
 * Sin provider el picker sigue funcionando: cero restricciones, cero favoritos y sin la
 * sección "Mis alimentos" (degradación invisible, nunca un crash).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { FoodPickerRestriction } from './food-picker-grouping'

export interface FoodPickerPrefs {
  /** Coach autenticado (`foods.coach_id` que cuenta como "mío"). */
  viewerCoachId: string | null
  /** Nombre del alumno para los títulos ("Recientes de Ana"). `null` = plantillas. */
  clientName: string | null
  restrictions: readonly FoodPickerRestriction[]
  favoriteIds: readonly string[]
}

const EMPTY_PREFS: FoodPickerPrefs = {
  viewerCoachId: null,
  clientName: null,
  restrictions: [],
  favoriteIds: [],
}

const FoodPickerPrefsContext = createContext<FoodPickerPrefs>(EMPTY_PREFS)

export function FoodPickerPrefsProvider({
  viewerCoachId = null,
  clientName = null,
  restrictions,
  favoriteIds,
  children,
}: {
  viewerCoachId?: string | null
  clientName?: string | null
  restrictions?: readonly FoodPickerRestriction[]
  favoriteIds?: readonly string[]
  children: ReactNode
}) {
  const value = useMemo<FoodPickerPrefs>(
    () => ({
      viewerCoachId,
      clientName,
      restrictions: restrictions ?? [],
      favoriteIds: favoriteIds ?? [],
    }),
    [viewerCoachId, clientName, restrictions, favoriteIds],
  )
  return <FoodPickerPrefsContext.Provider value={value}>{children}</FoodPickerPrefsContext.Provider>
}

export function useFoodPickerPrefs(): FoodPickerPrefs {
  return useContext(FoodPickerPrefsContext)
}
