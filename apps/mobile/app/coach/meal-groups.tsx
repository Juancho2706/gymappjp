import { Redirect } from 'expo-router'

/**
 * Los grupos de comidas V1 se retiran de standalone y Team. Los grupos de porciones
 * se administran dentro del constructor V2; este alias evita dejar deep-links rotos.
 */
export default function LegacyMealGroupsRoute() {
  return <Redirect href="/coach/nutricion" />
}
