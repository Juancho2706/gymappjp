import { Redirect, useLocalSearchParams } from 'expo-router'

/**
 * Deep-link canónico a UN ejercicio del catálogo "Aprender": `/alumno/exercise/<id>`.
 * Reenvía a la tab "Aprender" con `?ex=<id>`, que abre el sheet de detalle (fetch on-demand del
 * ejercicio por id si no está en la página ya cargada). Ruta path-based estable para push
 * notifications / enlaces externos; la tab hace el trabajo real (evita duplicar la UI de detalle).
 */
export default function ExerciseDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>()
  if (!id) return <Redirect href="/alumno/exercises" />
  return <Redirect href={{ pathname: '/alumno/exercises', params: { ex: id } }} />
}
