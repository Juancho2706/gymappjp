import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  getShoppingListView,
  type ShoppingItemView,
  type ShoppingAisleView,
  type ShoppingListView,
} from '@/services/nutrition-shopping.service'

/**
 * Lista de compras del alumno = líneas DERIVADAS del plan activo (puras) + estado
 * persistido (checks + ítems manuales). Cacheado por request (React.cache).
 *
 * La lógica (fetch del plan + build + merge de estado) vive en el servicio
 * (`getShoppingListView`) para compartirla 1:1 con el bridge móvil
 * (`/api/mobile/nutrition/shopping`). Este archivo sólo la envuelve en `React.cache`
 * con el cliente server (cookies). Data flow: _data -> services -> Supabase.
 */

export type { ShoppingItemView, ShoppingAisleView, ShoppingListView }

export const getShoppingList = cache(
  async (clientId: string): Promise<ShoppingListView> => {
    const supabase = await createClient()
    return getShoppingListView(supabase, clientId)
  }
)
