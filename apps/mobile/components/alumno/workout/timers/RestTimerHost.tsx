import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTheme } from '../../../../context/ThemeContext'
import { RestTimerBar } from './RestTimerBar'
import { useRestTimerEngine, type RestTimerEngine } from './useRestTimerEngine'
import type { RestCountKind, RestLiveContext } from './rest-live-notification'

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
  setIndex,
  setTotal,
  countKind,
  onClose,
  registerAlarmSilencer,
  renderInterstitial,
}: {
  initialSeconds: number
  autoStart?: boolean
  warmup?: boolean
  nextLabel?: string
  /** Serie/ronda que se acaba de cerrar y su total (contexto de la notificacion). */
  setIndex?: number
  setTotal?: number
  /** Que cuenta el par de arriba: series (bloque suelto) o rondas (superserie). */
  countKind?: RestCountKind
  onClose: () => void
  registerAlarmSilencer?: (silence: (() => void) | null) => void
  renderInterstitial?: RestInterstitialRenderer | null
}) {
  // Contexto VISUAL de la notificacion del descanso (QA-11 fase 2, mock aprobado por el CEO):
  // "Descanso · sigue {ejercicio}" + "Serie n de N" (o "Ronda n de N" en superserie, segun
  // `countKind`) + logo del coach como largeIcon.
  //
  // Todo sale de lo que YA hay a mano — cero fetches nuevos: `nextLabel`/`setIndex`/`setTotal` bajan
  // como props desde `startRest`, y la marca sale de `useTheme()` (branding runtime hidratado en el
  // layout raiz; `logoUrl` es una URL remota ya almacenada, que Notifee baja por su cuenta). El logo
  // dark se prefiere en tema oscuro porque la bandeja de Android sigue el tema del sistema.
  const { branding, resolvedScheme, theme } = useTheme()
  const logoUrl = (resolvedScheme === 'dark' ? branding?.logoUrlDark ?? branding?.logoUrl : branding?.logoUrl) ?? undefined
  const liveContext = useMemo<RestLiveContext>(
    () => ({ nextLabel, setIndex, setTotal, countKind, largeIconUrl: logoUrl, color: theme.primary }),
    [nextLabel, setIndex, setTotal, countKind, logoUrl, theme.primary],
  )

  const engine = useRestTimerEngine({ initialSeconds, autoStart, onClose, registerAlarmSilencer, liveContext })
  const [minimized, setMinimized] = useState(false)

  // QA4 (paridad web `RestTimer.tsx`): la píldora/interstitial del descanso existe SÓLO mientras el
  // alumno descansa. Al llegar a 0 mostramos "¡A entrenar!" ~1.5s y AUTO-DESCARTAMOS el descanso vía
  // `engine.close()` — el provider desmonta el host y su AnimatePresence anima la salida (barra o
  // interstitial). Así JAMÁS queda pegada "DESCANSO 0:00" al pasar al siguiente ejercicio. El MOTOR
  // (`useRestTimerEngine`) queda INTACTO: sólo se retira la presentación. "Saltar"/cerrar = close inmediato.
  const { done, close } = engine
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => close(), 1500)
    return () => clearTimeout(t)
  }, [done, close])

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
