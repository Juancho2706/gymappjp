import { Redirect, useLocalSearchParams } from 'expo-router'

/**
 * Alias de deep-link del constructor legacy. RETIRO del par viejo (R2): ya no apunta al wizard —
 * redirige al EDITOR UNICO, que resuelve solo si el alumno tiene plan vigente (crear vs editar).
 */
export default function LegacyNutritionBuilderRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string | string[] }>()
  const resolvedClientId = Array.isArray(clientId) ? clientId[0] : clientId

  return resolvedClientId
    ? <Redirect href={`/coach/nutrition-v2/editor/${resolvedClientId}`} />
    : <Redirect href="/coach/nutricion" />
}
