import { Redirect } from 'expo-router'

/** Alias de deep-link para instalaciones anteriores a la versión mínima de V2. */
export default function LegacyAddFoodRoute() {
  return <Redirect href="/alumno/nutrition-v2/add-food-v2" />
}
