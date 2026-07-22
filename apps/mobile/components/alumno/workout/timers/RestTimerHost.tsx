import { type ReactNode, useState } from 'react'
import { RestTimerBar } from './RestTimerBar'
import { useRestTimerEngine, type RestTimerEngine } from './useRestTimerEngine'

/** Controles que el host expone a la presentacion interstitial (minimizar → barra). */
export interface RestInterstitialHostControls {
  /** Minimiza el interstitial fullscreen a la barra compacta (el motor sigue corriendo). */
  minimize: () => void
}

/**
 * Renderer del interstitial V3 (E3.1). Lo provee `ExecutorV3` via `setRestInterstitial` — el host lo
 * invoca con el MOTOR compartido y sus controles de minimizar. Devuelve el overlay fullscreen. Fuera de
 * V3 no se registra ninguno → el host cae a la barra compacta clasica.
 */
export type RestInterstitialRenderer = (
  engine: RestTimerEngine,
  host: RestInterstitialHostControls,
) => ReactNode

/**
 * Host del descanso (E3.1) — posee UN motor (`useRestTimerEngine`) y elige la presentacion: el
 * interstitial V3 fullscreen (si `ExecutorV3` registro un renderer) o la barra compacta clasica.
 * Como el host NO se re-monta al alternar `minimized`, el motor sobrevive el minimizar/expandir: el
 * cronometro nunca se reinicia ni se duplica. El provider lo monta con `key={nonce}` → re-disparar un
 * descanso nuevo si re-monta (motor fresco), igual que antes con la barra.
 */
export function RestTimerHost({
  initialSeconds,
  autoStart = true,
  warmup = false,
  nextLabel,
  onClose,
  registerAlarmSilencer,
  renderInterstitial,
}: {
  initialSeconds: number
  autoStart?: boolean
  warmup?: boolean
  nextLabel?: string
  onClose: () => void
  registerAlarmSilencer?: (silence: (() => void) | null) => void
  renderInterstitial?: RestInterstitialRenderer | null
}) {
  const engine = useRestTimerEngine({ initialSeconds, autoStart, onClose, registerAlarmSilencer })
  const [minimized, setMinimized] = useState(false)

  if (renderInterstitial && !minimized) {
    return <>{renderInterstitial(engine, { minimize: () => setMinimized(true) })}</>
  }

  return (
    <RestTimerBar
      engine={engine}
      nextLabel={nextLabel}
      warmup={warmup}
      onExpand={renderInterstitial ? () => setMinimized(false) : undefined}
    />
  )
}
