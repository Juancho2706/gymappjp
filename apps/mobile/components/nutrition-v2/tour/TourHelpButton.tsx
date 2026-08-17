import { Pressable, Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { MotiView } from 'moti'

import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { TOUR_COPY } from './TourOverlay'
import { useHasSeenTour } from './tour-flags'
import { useTourTarget } from './TourTargets'
import type { TourId } from './tours'

/**
 * El «?» de la Guía Viva en RN (SPEC `nutrition-onboarding-tour`, D2 — INVARIANTE BLOQUEANTE del
 * dueño: «el "?" jamás tapa nada»). Espejo de
 * `apps/web/src/components/nutrition-v2/tour/TourHelpButton.tsx`.
 *
 * Tres cosas son consecuencia directa de ese invariante y NO son gusto:
 *
 * 1. **30 px exactos, sin área táctil inflada.** Lo normal en un teléfono sería llegar a los 44 pt
 *    de la guía táctil con padding invisible; acá está prohibido, porque el invariante se mide sobre
 *    el rect REAL del control y un padding invisible es rect igual que uno visible. 30 px cumple el
 *    mínimo AA de destino (WCAG 2.5.8, 24×24) y `hitSlop` da el resto del área de toque SIN agrandar
 *    la caja — que es exactamente el truco que la web no tiene disponible.
 * 2. **Semi-transparente.** Sobre el lienzo del editor el botón tiene que dejarse ver sin pesar. La
 *    web además difumina el fondo; acá no se usa `expo-blur` para un adorno de 30 px (una capa de
 *    blur es una vista nativa cara y este botón vive encima de una lista que scrollea).
 * 3. **Pulso solo hasta el primer uso.** `useHasSeenTour` lo apaga apenas el coach termina o salta
 *    el tour; con «reducir movimiento» no se genera nunca.
 *
 * Dónde ponerlo lo decide cada superficie (D2): en el editor flota sobre el lienzo por el lado
 * IZQUIERDO respetando el área segura, y en el hub va inline en la cabecera. Por eso la posición
 * entra por `style` (objeto, jamás función — gotcha css-interop del repo) y no está horneada acá.
 */

export type TourHelpButtonVariant = 'floating' | 'inline'

export type TourHelpButtonProps = {
  /** Qué tour repite. También es la llave del flag que decide el pulso (D4). */
  tourId: TourId
  coachId: string | null | undefined
  variant?: TourHelpButtonVariant
  /** Abrir el tour. Normalmente `controller.start` de `useTourController`. */
  onOpen: () => void
  /** Posicionamiento de la superficie (absoluto en `floating`). Objeto estático, nunca función. */
  style?: ViewStyle
}

const SIZE = 30

export function TourHelpButton({
  tourId,
  coachId,
  variant = 'inline',
  onOpen,
  style,
}: TourHelpButtonProps) {
  const seen = useHasSeenTour(tourId, coachId)
  const motion = useEvaMotion()
  const { theme } = useTheme()

  // El «?» es el target del último paso del guion del hub («¿Y este "?"»). En el editor no lo usa
  // nadie y registrarlo no cuesta nada: hay un solo «?» por superficie.
  const targetRef = useTourTarget('help')

  return (
    <Pressable
      ref={targetRef}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={TOUR_COPY.help}
      onPress={onOpen}
      // El área de toque crece por fuera de la caja: `hitSlop` no entra en el rect del control, así
      // que el invariante D2 sigue siendo verdad mientras el pulgar gana 7 px por lado.
      hitSlop={7}
      className="items-center justify-center rounded-pill border border-subtle bg-surface-card/70"
      style={[
        { width: SIZE, height: SIZE },
        variant === 'floating'
          ? {
              position: 'absolute',
              // Sombra suave: flotando sobre el lienzo, sin filete propio se leería como parte de la
              // card que tenga debajo.
              shadowColor: '#000000',
              shadowOpacity: 0.18,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
            }
          : null,
        style ?? null,
      ]}
    >
      {/* Pulso: un anillo que se expande y se desvanece, en un hijo absoluto — NO agranda el rect
          del botón, así que el invariante de cero solapes se mantiene mientras el pulso corre. */}
      {seen || motion.reduced ? null : (
        <MotiView
          pointerEvents="none"
          from={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 1.85, opacity: 0 }}
          transition={{ type: 'timing', duration: 1400, loop: true, repeatReverse: false }}
          style={{
            position: 'absolute',
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            borderWidth: 2,
            borderColor: theme.primary,
          }}
        />
      )}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text className="text-[13px] font-bold text-muted">?</Text>
      </View>
    </Pressable>
  )
}
