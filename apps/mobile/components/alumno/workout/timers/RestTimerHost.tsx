import { type ReactNode, useEffect, useMemo } from 'react'
import { useTheme } from '../../../../context/ThemeContext'
import { RestTimerBar } from './RestTimerBar'
import { clearRestClock, publishRestClock } from './rest-clock'
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
 *
 * R3b («Reps tras el reloj», enmienda E1 del owner 12-09): `minimized` es CONTROLADO por el provider
 * y ya no un `useState` de acá. Motivo: ahora tiene dos dueños — el toque del alumno (esta pantalla)
 * y el orquestador, que arranca el descanso minimizado mientras el teclado pide kg/reps y lo expande
 * al resolverse el prompt. Subirlo no cambia el comportamiento observable: el host sigue sin
 * re-montarse al alternar, así que el motor y su cuenta siguen siendo los mismos.
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
  minimized,
  onMinimizedChange,
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
  /** Presentacion actual: `true` = barra compacta, `false` = interstitial fullscreen (R3b). */
  minimized: boolean
  /** Cambia la presentacion. El dueño del estado es el provider (ver el docblock de arriba). */
  onMinimizedChange: (next: boolean) => void
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

  // W5.1b · chip vivo del teclado: el host es el único que ve TODAS las transiciones del motor (tick,
  // pausa, ±15 s, reset, el 0), así que es el que mantiene fiel el mini-store que lee
  // `useRestRemainingSec`. Se publica el fin ABSOLUTO mientras corre y los segundos CONGELADOS cuando
  // no (pausa, o `timeLeft === 0` ⇒ el chip dice «¡A entrenar!» hasta que el host se cierre solo a los
  // ~1,5 s). Nada de esto re-renderiza al provider ni al ejecutor: es un ref + listeners.
  const { timeLeft, isActive } = engine
  useEffect(() => {
    publishRestClock(
      isActive && timeLeft > 0
        ? { endAtMs: Date.now() + timeLeft * 1000, pausedRemainingSec: null }
        : { endAtMs: null, pausedRemainingSec: timeLeft },
    )
  }, [isActive, timeLeft])
  // Host desmontado = no hay descanso (se cerró, se saltó o lo reemplazó otro timer): el chip
  // desaparece en vez de quedar contando un reloj fantasma.
  useEffect(() => () => clearRestClock(), [])

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
    return <>{renderInterstitial(engine, { minimize: () => onMinimizedChange(true) })}</>
  }

  return (
    <RestTimerBar
      engine={engine}
      nextLabel={nextLabel}
      warmup={warmup}
      onExpand={renderInterstitial ? () => onMinimizedChange(false) : undefined}
    />
  )
}
