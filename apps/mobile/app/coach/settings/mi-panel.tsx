import { Redirect } from 'expo-router'

/**
 * Ruta legacy `/coach/settings/mi-panel` — alias legacy (W3.4): deep links / navegaciones viejas.
 *
 * «Mi panel» (especialidad, master switches de los 5 dominios, guía de inicio y alumno de ejemplo)
 * se fusionó con «Funciones de nutrición», el catálogo de Módulos y el launcher Herramientas en
 * UNA sola pantalla: `app/coach/settings/funciones.tsx` (Ola de orden W3.3). Esta ruta se conserva
 * porque el nombre viejo vive en enlaces, correos y en la memoria de los coaches.
 */
export default function CoachMiPanelScreen() {
  return <Redirect href="/coach/settings/funciones" />
}
