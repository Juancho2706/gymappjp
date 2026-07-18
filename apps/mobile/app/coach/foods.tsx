import { Redirect } from 'expo-router'

/**
 * Ruta legacy `/coach/foods` — la biblioteca de alimentos ahora vive como TAB del hub
 * de Nutrición (paridad web: FoodLibrary embebida en NutritionHub, E3-19). Esta ruta se
 * conserva (deep-links / navegaciones antiguas) y redirige al tab Alimentos del hub.
 */
export default function CoachFoodsScreen() {
  return <Redirect href="/coach/nutricion?tab=foods" />
}
