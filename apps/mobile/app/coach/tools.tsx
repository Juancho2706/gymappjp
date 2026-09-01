import { Redirect } from 'expo-router'

/**
 * Ruta legacy `/coach/tools` — alias legacy (W3.4): deep links / navegaciones viejas.
 *
 * El launcher «Herramientas» se disolvió: cada dominio prendido se abre desde su propia fila con
 * el enlace «Abrir ›» de `app/coach/settings/funciones.tsx` (Ola de orden W3.3, decisión 6A del
 * owner). El selector de alumno de Composición corporal se mudó a
 * `components/coach/BodycompClientPicker.tsx`.
 */
export default function CoachToolsScreen() {
  return <Redirect href="/coach/settings/funciones" />
}
