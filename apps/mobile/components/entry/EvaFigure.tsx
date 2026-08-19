import { Image } from 'expo-image'
import type { ImageStyle, StyleProp } from 'react-native'

/**
 * EvaFigure — la figura blanca de EVA, unica marca de la familia de entrada.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.1 y §5.2.
 *
 * Asset VERIFICADO (§5.2): `assets/eva-icon.png` es 585x526, silueta rellena de blanco
 * puro (#FFFFFF, A=255) sobre fondo transparente. NO confundir con `eva-mark-filled.png`,
 * que es la variante NEGRA — es la que hoy apunta el splash nativo sobre `#07080C` y da
 * contraste ~1:1 (QA ronda 1, F10). No se aplica `tintColor`: el PNG ya es blanco.
 *
 * Reglas:
 *  - `transition={0}`: la imagen debe estar en el PRIMER frame. Un fade de expo-image
 *    rompe el handoff pixel-identico con el splash nativo.
 *  - Un solo asset para los 4 tamanos de la familia (180 / 30 / 22 / 22); el alto se
 *    deriva SIEMPRE del aspecto 585:526 para no deformar la silueta.
 *  - El alpha del PNG es practicamente binario (sin antialiasing): no usarlo a tamano
 *    nativo ni ampliado (§5.2).
 *  - La figura es la marca; el texto "EVA" es firma, nunca protagonista (§3.1).
 */

/**
 * Aspecto y alto derivan de `splash-geometry` (modulo puro, testeable en Node): el tamano
 * del splash tiene un guard de paridad contra el `imageWidth` de `app.json` y la formula
 * tiene que ser UNA sola. Re-exportados aca para los consumidores historicos.
 */
import { evaFigureHeight } from './splash-geometry'

export { EVA_FIGURE_RATIO, evaFigureHeight } from './splash-geometry'

export interface EvaFigureProps {
  /** Ancho en pt. El alto se deriva del aspecto. */
  size: number
  /** Opacidad de la pieza (§3.2 lockup .96, §3.4 navbar .82). */
  opacity?: number
  style?: StyleProp<ImageStyle>
}

export function EvaFigure({ size, opacity, style }: EvaFigureProps) {
  return (
    <Image
      source={require('../../assets/eva-icon.png')}
      style={[{ width: size, height: evaFigureHeight(size) }, opacity == null ? null : { opacity }, style]}
      contentFit="contain"
      transition={0}
      cachePolicy="memory-disk"
      priority="high"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}
