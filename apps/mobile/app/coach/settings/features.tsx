import { Redirect } from 'expo-router'

/**
 * Ruta legacy `/coach/settings/features` — alias legacy (W3.4): deep links / navegaciones viejas.
 *
 * El editor de «Funciones de nutrición» (preset + secciones) ahora es el bloque «Detalle de
 * nutrición» de `app/coach/settings/funciones.tsx` (Ola de orden W3.3). Su master switch del
 * dominio dejó de estar duplicado ahí: la única fuente es el bloque «Qué se ve en tu panel».
 */
export default function CoachFeaturesScreen() {
  return <Redirect href="/coach/settings/funciones" />
}
