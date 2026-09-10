import { Pressable, Text, View } from 'react-native'
import { Clock } from 'lucide-react-native'
import { FONT } from '../../../../lib/typography'
import { JuicyButton } from './JuicyButton'
import type { ExecTheme } from './exec-theme'

/**
 * Par «Descansar N s» / «Siguiente serie» (specs/cuenta-atras-en-pantalla, R24 / W3.16).
 *
 * Hasta este tren en V3 NO existía un botón manual de descanso: RN sólo tenía los dos `startRest`
 * automáticos del orquestador. Con la preferencia «Pasar solo al descanso» APAGADA (R1: default para
 * el alumno nuevo) ese hueco sería la experiencia por defecto — cerraba una serie y no tenía cómo
 * descansar. Este panel es el único camino: tras cerrar cualquier serie (tocada o por reloj) con la
 * preferencia OFF y `rest_time > 0`, «Descansar N s» llama el MISMO `startRest` de hoy (lo pasa la
 * pantalla por `onRest`) y «Siguiente serie» sólo cierra el panel. Sin `rest_time` no hay nada que
 * arrancar ⇒ sólo «Siguiente serie». En el fin de ronda de una superserie el par se colapsa en
 * «Ronda lista · Descansar N s» (`kind: 'ronda'`, D2). Con la preferencia ON el descanso arranca solo
 * y este panel NO se pinta (nadie ve dos caminos para lo mismo).
 */
export function RestOfferV3({
  seconds,
  kind = 'serie',
  exec,
  reducedMotion = false,
  onRest,
  onNext,
  testIDPrefix = 'rest-offer',
}: {
  /** Segundos reales del bloque (`parseRestTime(rest_time)`); ≤ 0 ⇒ sólo «Siguiente serie». */
  seconds: number
  kind?: 'serie' | 'ronda'
  exec: ExecTheme
  reducedMotion?: boolean
  onRest: () => void
  /** Ausente en `ronda`: el CTA de la ronda no tiene «siguiente» (la siguiente ronda ya está activa). */
  onNext?: () => void
  testIDPrefix?: string
}) {
  const s = exec.surface
  const restLabel = kind === 'ronda' ? `Ronda lista · Descansar ${seconds} s` : `Descansar ${seconds} s`
  const nextLabel = kind === 'ronda' ? 'Siguiente ronda' : 'Siguiente serie'
  return (
    <View testID={`${testIDPrefix}-panel`} style={{ width: '100%', gap: 8 }}>
      {seconds > 0 ? (
        <JuicyButton
          testID={`${testIDPrefix}-rest`}
          label={restLabel}
          icon={<Clock size={18} color={exec.accentText} />}
          onPress={onRest}
          exec={exec}
          height={52}
          fontSize={16}
          reducedMotion={reducedMotion}
          accessibilityLabel={restLabel}
        />
      ) : null}
      {onNext ? (
        <Pressable
          testID={`${testIDPrefix}-next`}
          onPress={onNext}
          style={{ width: '100%', height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: s.borderStrong, backgroundColor: s.surfaceRaised }}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
        >
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 15, letterSpacing: 0.3, color: '#e8e8ee' }}>{nextLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
