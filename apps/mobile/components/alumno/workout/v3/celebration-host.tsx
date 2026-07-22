import { View } from 'react-native'
import { AnimatePresence } from 'moti'
import { PrCelebration } from './PrCelebration'
import type { ExecTheme } from './exec-theme'
import type { PrCelebrationState } from './use-celebrations'

/**
 * Host de celebraciones del ejecutor V3 (E4.1) — capa de PRESENTACIÓN única que `ExecutorV3` monta sobre
 * el stepper. Recibe el estado de celebración de `useCelebrations` y lo renderiza; hoy sólo el PR en vivo
 * (E4.2) tiene overlay propio (toast+confeti). Las salidas micro ("+1 serie") y media ("Ronda lista")
 * viven en el interstitial (ya existían — el host las gobierna vía haptics, no las re-renderiza), y la
 * épica de FIN DE SESIÓN llega en Wave 2 (el evento `sesion_completada` ya se emite al finalizar).
 *
 * `pointerEvents="box-none"`: el overlay no intercepta toques — el CTA y el flujo siguen 100% vivos debajo
 * (contrato: "no corta el flujo"). Se posiciona bajo el header; el confeti/toast sólo ocupan el tramo superior.
 */
export function CelebrationHost({
  prCelebration,
  exec,
  reducedMotion,
  topOffset = 0,
}: {
  prCelebration: PrCelebrationState | null
  exec: ExecTheme
  reducedMotion: boolean
  /** Desplazamiento superior (alto del header) para no tapar los dots/cronómetro. */
  topOffset?: number
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: topOffset, left: 0, right: 0, alignItems: 'center', zIndex: 40 }}
    >
      <AnimatePresence>
        {prCelebration && (
          <PrCelebration
            key={prCelebration.nonce}
            exec={exec}
            weightKg={prCelebration.weightKg}
            prevBest={prCelebration.prevBest}
            kind={prCelebration.kind}
            reducedMotion={reducedMotion}
            nonce={prCelebration.nonce}
          />
        )}
      </AnimatePresence>
    </View>
  )
}
