import { Redirect } from 'expo-router'

/**
 * Ruta legacy `/coach/modules` — alias legacy (W3.4): deep links / navegaciones viejas.
 *
 * El catálogo de Módulos (badges «Incluido» / «No incluido», chips de superficie, «Actualizar
 * estado») se demolió: bajo la regla del owner «todo está en todos los planes, solo se cobra el
 * cupo» ya no hay nada que un coach pueda tener o no tener, así que una pantalla que lista
 * candados solo genera dudas. Lo que sí decide el coach —qué se ve en su panel— vive en
 * `app/coach/settings/funciones.tsx` (Ola de orden W3.3 + W4.3).
 */
export default function CoachModulesScreen() {
  return <Redirect href="/coach/settings/funciones" />
}
