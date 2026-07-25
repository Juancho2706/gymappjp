/**
 * Mapeo estado-vacío → ilustración + componente <StateIllustration /> (RN).
 *
 * Espejo del módulo web puro `apps/web/src/components/nutrition-v2/state-illustration.ts`
 * (líneas 11-71: las 8 ilustraciones del CEO y el mapeo semántico) más el mecanismo
 * RN: los mismos webp que sirve `apps/web/public/illustrations/` van EMPAQUETADOS en
 * el bundle (`apps/mobile/assets/illustrations/<key>.webp` + `@2x`; require estático,
 * sin red — el resolver de assets de RN elige la densidad por dispositivo, espejo del
 * `srcSet` 1x/2x del web).
 *
 * El render replica `NutritionStatePanel` web (NutritionV2Kit.tsx:371-391): círculo
 * 144pt tintado con el primario al 10% (web: `color-mix(in oklab, var(--theme-primary)
 * 10%, transparent)` → aquí `hexToRgba(theme.primary, 0.10)`, mismo contrato
 * white-label) con el arte a 96pt (web móvil `h-36 w-36` círculo / `h-24 w-24` imagen;
 * los tamaños `sm:` son de escritorio y no aplican en RN). Decorativa: el título +
 * descripción del panel ya anuncian el estado al lector de pantalla (paridad del
 * `aria-hidden` web).
 *
 * API de 1 línea para las superficies (4A-02/03/04/11): `<StateIllustration name="sin-plan" />`
 * o vía `NutritionStatePanel illustration="sin-plan"`.
 */
import { View } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '../../context/ThemeContext'
import { hexToRgba } from '../../lib/theme'

/** Nombres base de archivo en `assets/illustrations/` (los 8 estados vacíos). */
export const NUTRITION_ILLUSTRATIONS = [
  'sin-plan',
  'dia-completado',
  'sin-conexion',
  'sin-resultados',
  'catalogo-vacio',
  'sin-alumnos',
  'historial-vacio',
  'error-amable',
] as const

export type NutritionIllustration = (typeof NUTRITION_ILLUSTRATIONS)[number]

/**
 * Estados semánticos de las superficies V2 (espejo 1:1 del web). Cada uno cae en
 * exactamente una ilustración; los call-sites leen como negocio y el mapeo queda
 * centralizado y testeable.
 */
export type NutritionEmptyState =
  | 'no-plan' // alumno sin plan V2 publicado / coach sin plan vigente
  | 'day-complete' // día registrado / cerrado, nada por hacer
  | 'offline' // sin conexión / error de red al sincronizar
  | 'no-results' // búsqueda sin coincidencias (catálogo o roster filtrado)
  | 'empty-catalog' // catálogo o cola de curación sin ítems
  | 'no-clients' // roster sin alumnos en el scope activo
  | 'empty-history' // historial de días vacío
  | 'error' // error genérico / código inválido

const STATE_TO_ILLUSTRATION: Record<NutritionEmptyState, NutritionIllustration> = {
  'no-plan': 'sin-plan',
  'day-complete': 'dia-completado',
  offline: 'sin-conexion',
  'no-results': 'sin-resultados',
  'empty-catalog': 'catalogo-vacio',
  'no-clients': 'sin-alumnos',
  'empty-history': 'historial-vacio',
  error: 'error-amable',
}

/** Resuelve el estado semántico a su ilustración. Puro y total (todos los casos cubiertos). */
export function resolveNutritionIllustration(state: NutritionEmptyState): NutritionIllustration {
  return STATE_TO_ILLUSTRATION[state]
}

// Require estático por asset (Metro exige literales; mismo patrón que
// CelebrationOverlay.tsx:31-35). El `@2x` hermano se resuelve solo por densidad.
const ILLUSTRATION_SOURCES: Record<NutritionIllustration, ReturnType<typeof require>> = {
  'sin-plan': require('../../assets/illustrations/sin-plan.webp'),
  'dia-completado': require('../../assets/illustrations/dia-completado.webp'),
  'sin-conexion': require('../../assets/illustrations/sin-conexion.webp'),
  'sin-resultados': require('../../assets/illustrations/sin-resultados.webp'),
  'catalogo-vacio': require('../../assets/illustrations/catalogo-vacio.webp'),
  'sin-alumnos': require('../../assets/illustrations/sin-alumnos.webp'),
  'historial-vacio': require('../../assets/illustrations/historial-vacio.webp'),
  'error-amable': require('../../assets/illustrations/error-amable.webp'),
}

/** Fuente empaquetada de una ilustración (para un `<Image source={...} />` propio). */
export function nutritionIllustrationSource(
  illustration: NutritionIllustration,
): ReturnType<typeof require> {
  return ILLUSTRATION_SOURCES[illustration]
}

/**
 * Círculo tintado con el primario + arte del CEO (paridad web NutritionV2Kit.tsx:373-391).
 * Decorativa (oculta a lectores de pantalla); tamaños por defecto = breakpoint móvil web.
 */
export function StateIllustration({
  name,
  circleSize = 144,
  imageSize = 96,
}: {
  name: NutritionIllustration
  /** Diámetro del círculo tintado (web móvil: h-36 w-36 = 144). */
  circleSize?: number
  /** Lado del arte (web móvil: h-24 w-24 = 96). */
  imageSize?: number
}) {
  const { theme } = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-full"
      style={{
        width: circleSize,
        height: circleSize,
        backgroundColor: hexToRgba(theme.primary, 0.1),
      }}
    >
      <Image
        contentFit="contain"
        source={ILLUSTRATION_SOURCES[name]}
        style={{ width: imageSize, height: imageSize }}
      />
    </View>
  )
}
