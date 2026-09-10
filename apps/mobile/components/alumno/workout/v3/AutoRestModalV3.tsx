import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { AUTOREST_MODAL_COPY, autoRestSublabel } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { haptics } from '../../../../lib/haptics'
import { Sheet } from '../../../Sheet'
import { JuicyButton } from './JuicyButton'
import { ExecToggle } from './ExecToggle'
import type { ExecTheme } from './exec-theme'

/**
 * Modal de PRIMERA VEZ de la preferencia D5 «Pasar solo al descanso» (specs/cuenta-atras-en-pantalla,
 * W5.6 · mockup F artifact 159aa43f). Sale UNA sola vez en la vida del alumno: en el primer ejercicio
 * del primer entreno que ejecuta, después de que el Despegue/morph se retiró y sin ningún otro
 * overlay abierto (esas condiciones las resuelve el orquestador `ExecutorV3`, no este componente).
 *
 * Mismo chrome que la tuerca: `Sheet` nativo, chrome oscuro forzado, snap chico. Un solo botón
 * «Listo». Cerrar sin responder (deslizar o tocar fuera) CUENTA como respondido: `onDismiss(null)`
 * ⇒ el orquestador marca «visto» y deja la preferencia apagada, y el modal no vuelve a aparecer.
 *
 * El toggle interno es el MISMO control que la fila «Pasar solo al descanso» de la tuerca
 * (`ExecToggle`), con los copys literales de R11b (`AUTOREST_MODAL_COPY`, motor compartido con web).
 * Arranca APAGADO: es el default del alumno sin historial (D5), y encenderlo es su decisión.
 */
export function AutoRestModalV3({
  open,
  exec,
  reducedMotion = false,
  onDismiss,
}: {
  open: boolean
  exec: ExecTheme
  reducedMotion?: boolean
  /**
   * `true`/`false` = respondió con «Listo» (valor del toggle); `null` = cerró sin responder
   * (deslizar / tocar fuera). En los tres casos el orquestador marca «visto».
   */
  onDismiss: (enabled: boolean | null) => void
}) {
  const s = exec.surface
  const [enabled, setEnabled] = useState(false)
  // «Listo» cierra el sheet a través del orquestador (`open` → false); ese cierre NO debe contarse
  // además como «cerró sin responder». El ref distingue los dos caminos por apertura.
  const answeredRef = useRef(false)

  useEffect(() => {
    if (open) {
      answeredRef.current = false
      setEnabled(false)
    }
  }, [open])

  const answer = () => {
    if (answeredRef.current) return
    answeredRef.current = true
    void haptics.tap()
    onDismiss(enabled)
  }

  const closeWithoutAnswer = () => {
    if (answeredRef.current) return
    answeredRef.current = true
    onDismiss(null)
  }

  return (
    <Sheet
      open={open}
      onClose={closeWithoutAnswer}
      nativeModal
      forceDark
      snapPoints={['52%']}
      dynamicSizing
      title={AUTOREST_MODAL_COPY.title}
      accessibilityLabel={AUTOREST_MODAL_COPY.title}
    >
      <View testID="autorest-modal" style={{ paddingBottom: 6 }}>
        <Text
          style={{
            fontFamily: FONT.uiMedium,
            fontSize: 13,
            lineHeight: 19,
            color: '#c4c4cf',
            marginBottom: 12,
          }}
        >
          {AUTOREST_MODAL_COPY.body}
        </Text>

        {/* Fila «boxed» del mockup: el mismo par nombre/sublabel + toggle que la tuerca, enmarcado. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: s.borderSubtle,
            backgroundColor: s.surfaceRaised,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, letterSpacing: -0.1, color: s.text }}>
              {AUTOREST_MODAL_COPY.toggle}
            </Text>
            <Text
              style={{ fontFamily: FONT.uiMedium, fontSize: 12, lineHeight: 16, color: s.textMuted, marginTop: 3 }}
            >
              {autoRestSublabel(enabled)}
            </Text>
          </View>
          <ExecToggle
            testID="autorest-modal-toggle"
            value={enabled}
            exec={exec}
            accessibilityLabel={AUTOREST_MODAL_COPY.toggle}
            onChange={(v) => {
              void haptics.tap()
              setEnabled(v)
            }}
          />
        </View>

        <JuicyButton
          testID="autorest-modal-cta"
          label={AUTOREST_MODAL_COPY.cta}
          onPress={answer}
          exec={exec}
          height={52}
          fontSize={15}
          reducedMotion={reducedMotion}
          style={{ marginTop: 14 }}
        />

        <Text
          style={{
            fontFamily: FONT.uiMedium,
            fontSize: 11,
            lineHeight: 15,
            color: s.textMuted,
            textAlign: 'center',
            marginTop: 10,
          }}
        >
          {AUTOREST_MODAL_COPY.foot}
        </Text>
      </View>
    </Sheet>
  )
}
