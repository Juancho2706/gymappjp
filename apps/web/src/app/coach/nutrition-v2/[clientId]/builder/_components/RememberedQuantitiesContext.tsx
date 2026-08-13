'use client'

import { createContext, useContext } from 'react'

/** Cantidad recordada por alimento, ya resuelta por precedencia (alumno → coach) en el servidor. */
export interface RememberedQuantity {
  quantity: string
  unit: 'g' | 'ml' | 'un'
}

/**
 * Porcion pegajosa (T2.6 F4). Viaja por CONTEXTO, no por props, por la misma razon que
 * `TemplateModeContext`: la unica hoja que la necesita es la que agrega un alimento
 * (`SlotEditor`), y re-firmar ConstructionStep → SlotEditor para eso seria arrastrar una prop
 * por dos capas que no la usan.
 *
 * El mapa llega resuelto de la page: el cliente no decide precedencias ni consulta nada.
 */
export const RememberedQuantitiesContext = createContext<Record<string, RememberedQuantity>>({})

/** La cantidad recordada de un alimento, o `undefined` si no hay memoria (manda el catalogo). */
export function useRememberedQuantity(foodId: string | null | undefined): RememberedQuantity | undefined {
  const map = useContext(RememberedQuantitiesContext)
  return foodId == null ? undefined : map[foodId]
}
