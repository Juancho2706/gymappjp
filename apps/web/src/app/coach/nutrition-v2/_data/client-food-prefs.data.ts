import 'server-only'

import {
  getClientFoodFavorites,
  getClientFoodRestrictions,
} from '@/app/coach/nutrition-plans/_actions/nutrition-coach.actions'
import type { FoodPickerRestriction } from '../_components/food-picker/food-picker-grouping'

/**
 * Señales dietarias del alumno para el picker de alimentos V2 (alergias/intolerancias/
 * disgustos + favoritos), resueltas SERVER-SIDE en la page y bajadas por props.
 *
 * DECISIÓN (frontera V2): la consulta vive en las acciones V1 de `nutrition-plans`
 * (`client_food_preferences` + `coachOwnsClient`, que cubre standalone/enterprise/team). Se
 * REUSA en vez de duplicarla: `pnpm check:nutrition-v2-boundaries` prohíbe montar los SHELLS
 * V1 (NutritionShell/NutritionHub/PlanBuilder y los componentes de ruta del alumno V1) dentro
 * de V2, no compartir una lectura de dominio — que es justo lo que la regla de "no duplicar
 * lógica compartible" pide. Este módulo es el ÚNICO punto de cruce: si mañana esa acción se
 * poda con V1, se reemplaza acá adentro (misma tabla) sin tocar ninguna superficie V2.
 *
 * `server-only`: nada de esto puede colarse al bundle del cliente.
 */
export interface ClientFoodPrefsLoad {
  restrictions: FoodPickerRestriction[]
  favoriteIds: string[]
}

export const EMPTY_CLIENT_FOOD_PREFS: ClientFoodPrefsLoad = { restrictions: [], favoriteIds: [] }

/**
 * Fail-soft a propósito: si una de las dos lecturas falla, el picker pierde una AYUDA visual
 * (estrellita / aviso), no una barrera de seguridad — el gate real de qué alimentos existen y
 * quién puede leerlos lo pone la RLS del catálogo. Nunca tira la página del coach.
 */
export async function fetchClientFoodPrefsForPicker(
  clientId: string,
): Promise<ClientFoodPrefsLoad> {
  const [restrictions, favoriteIds] = await Promise.all([
    getClientFoodRestrictions(clientId).catch(() => []),
    getClientFoodFavorites(clientId).catch(() => []),
  ])

  return {
    restrictions: restrictions.map((row) => ({ foodId: row.food_id, kind: row.preference_type })),
    favoriteIds,
  }
}
