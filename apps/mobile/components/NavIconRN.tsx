import { Image } from 'react-native'

/**
 * NavIconRN — espejo RN de `NavIcon` (web): glifo propio de navbar (siluetas del
 * CEO) que HEREDA el tinte del color del estado de la tab.
 *
 * Los PNG en `assets/nav-icons/*.png` son siluetas BLANCAS sobre alfa. RN no tiene
 * CSS `mask`, pero `Image` con `style.tintColor` hace exactamente lo mismo: tiñe
 * TODOS los píxeles no transparentes con el color dado, preservando el alfa. El
 * color viene del tema en tiempo de ejecución (activo = `theme.primary` white-label,
 * inactivo = `theme.mutedForeground` / `theme.ink400`, danger = `theme.destructive`).
 * Cero colores fijos.
 *
 * Nota: NO existe silueta 'aprender' todavía — ese ítem (biblioteca) sigue con
 * lucide en su call site.
 */

const SOURCES = {
  home: require('../assets/nav-icons/home.png'),
  nutricion: require('../assets/nav-icons/nutricion.png'),
  'check-in': require('../assets/nav-icons/check-in.png'),
  mas: require('../assets/nav-icons/mas.png'),
  perfil: require('../assets/nav-icons/perfil.png'),
  historial: require('../assets/nav-icons/historial.png'),
  'cerrar-sesion': require('../assets/nav-icons/cerrar-sesion.png'),
  entrenamiento: require('../assets/nav-icons/entrenamiento.png'),
  aprender: require('../assets/nav-icons/aprender.png'),
  // Siluetas del coach (mismo set blanco-sobre-alfa que el alumno).
  alumnos: require('../assets/nav-icons/alumnos.png'),
  programas: require('../assets/nav-icons/programas.png'),
  equipo: require('../assets/nav-icons/equipo.png'),
  ajustes: require('../assets/nav-icons/ajustes.png'),
  herramientas: require('../assets/nav-icons/herramientas.png'),
  suscripcion: require('../assets/nav-icons/suscripcion.png'),
  buscar: require('../assets/nav-icons/buscar.png'),
  novedades: require('../assets/nav-icons/novedades.png'),
} as const

export type NavConceptRN = keyof typeof SOURCES

export function NavIconRN({
  concept,
  size = 24,
  color,
}: {
  concept: NavConceptRN
  size?: number
  /** Tinte de la silueta — pásalo desde el token de tema del estado activo/inactivo. */
  color: string
}) {
  return (
    <Image
      source={SOURCES[concept]}
      resizeMode="contain"
      style={{ width: size, height: size, tintColor: color }}
    />
  )
}
