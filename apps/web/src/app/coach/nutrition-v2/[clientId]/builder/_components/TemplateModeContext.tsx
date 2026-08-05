'use client'

import { createContext, useContext } from 'react'

/**
 * ¿El wizard esta armando una PLANTILLA (sin alumno)? Viaja por contexto y no por props para
 * no re-firmar ConstructionStep -> SlotEditor -> ItemRow -> FreeFoodFields solo para que las
 * dos hojas que llaman al servidor (buscador de catalogo y bloque de equivalencia) elijan la
 * puerta coach-scoped.
 */
export const TemplateModeContext = createContext(false)

export function useIsTemplateMode(): boolean {
  return useContext(TemplateModeContext)
}
