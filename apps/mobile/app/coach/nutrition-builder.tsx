import { Redirect, useLocalSearchParams } from 'expo-router'

/** Alias de deep-link: el constructor legacy ya no puede abrirse en standalone ni Team. */
export default function LegacyNutritionBuilderRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string | string[] }>()
  const resolvedClientId = Array.isArray(clientId) ? clientId[0] : clientId

  return resolvedClientId
    ? <Redirect href={`/coach/nutrition-v2/builder/${resolvedClientId}`} />
    : <Redirect href="/coach/nutricion" />
}
