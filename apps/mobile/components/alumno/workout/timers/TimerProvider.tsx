import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { AnimatePresence } from 'moti'
import { buildIntervalSequence, type IntervalConfig, type IntervalPhase } from '@eva/workout-engine'
import { toast } from '../../../Toast'
import { RestTimerHost, type RestInterstitialRenderer } from './RestTimerHost'
import type { RestCountKind } from './rest-live-notification'
import { HoldTimer } from './HoldTimer'
import { IntervalTimer } from './IntervalTimer'
import { StopwatchTimer } from './StopwatchTimer'
import { clearRestClock, publishRestClock } from './rest-clock'
import { hydrateRestTimerPrefs } from './rest-timer-preferences'
import { primeTimerAudio } from './sound'

/**
 * WorkoutTimerProvider (E2-09) — orquesta UN solo timer activo a la vez (rest /
 * hold / interval / stopwatch), montándolo como overlay sobre el ejecutor. Port
 * RN del `WorkoutTimerProvider` web: reemplazo suave (toast al cambiar de tipo),
 * remount forzado (mismo tipo reinicia la cuenta vía `nonce`), y auto-skip del
 * descanso (`cancelRest`, p.ej. al registrar la siguiente serie).
 *
 * Contrato de la ola: `useWorkoutTimers()` expone `startRest(seconds, opts?)` +
 * `state`. Superset añadido para el ejecutor: `startHold`, `startInterval`,
 * `startStopwatch`, `cancelRest`, `close`. Los componentes de timer se montan
 * SOLOS vía este provider (el consumidor solo llama a los `start*`).
 */

/**
 * `setIndex`/`setTotal` son CONTEXTO de la notificación del descanso (QA-11 fase 2: "Serie 2 de 4"
 * en la bandeja/lockscreen). Opcionales y puramente informativos — no alteran la cuenta ni la UI
 * in-app; sin ellos la notificación cae a su copy histórico. `countKind` dice QUÉ se cuenta: un bloque
 * suelto cuenta series, una superserie cuenta RONDAS ("Ronda 2 de 4").
 */
type RestOpts = {
  autoStart?: boolean
  label?: string
  warmup?: boolean
  setIndex?: number
  setTotal?: number
  countKind?: RestCountKind
  /**
   * R3b («Reps tras el reloj», enmienda E1 del owner 12-09): arrancar el descanso YA MINIMIZADO —la
   * barra compacta de abajo— en vez del interstitial a pantalla completa. Lo pide `ExecutorV3` cuando
   * el reloj de fuerza por tiempo cerró la serie con huecos y hay que pedirle kg/reps al alumno: tiene
   * que seguir viendo la pantalla del EJERCICIO mientras anota, con el descanso ya corriendo detrás.
   * Al resolverse el prompt, `expandRest()` lo lleva a la pantalla grande CON EL MISMO reloj.
   * Default `false` ⇒ cualquier otro descanso arranca expandido, byte-idéntico a antes.
   */
  minimized?: boolean
}

type ActiveTimer =
  | {
      kind: 'rest'
      nonce: number
      seconds: number
      autoStart: boolean
      label?: string
      warmup?: boolean
      setIndex?: number
      setTotal?: number
      countKind?: RestCountKind
    }
  | { kind: 'hold'; nonce: number; seconds: number; label?: string }
  | { kind: 'interval'; nonce: number; phases: IntervalPhase[] }
  | { kind: 'stopwatch'; nonce: number }

export interface WorkoutTimersApi {
  /**
   * Inicia el descanso protagonista. `autoStart` (default true) = arranca corriendo.
   * Acepta SEGUNDOS (number, lo que ya pasa el ejecutor RN) o un STRING del plan
   * ('MM:SS' | '90s' | '1 min' | '90') que se parsea internamente con `parseRestTime`
   * — paridad de contrato con la web (`WorkoutTimerProvider.tsx:96-99`, que recibe string).
   */
  startRest: (seconds: number | string, opts?: RestOpts) => void
  startHold: (seconds: number, opts?: { label?: string }) => void
  startInterval: (config: IntervalConfig, sets?: number) => void
  startStopwatch: () => void
  /** Corta SOLO el descanso en curso (no pisa hold/interval/cronómetro). */
  cancelRest: () => void
  /**
   * Expande a pantalla completa el descanso que está corriendo MINIMIZADO (R3b). NO re-monta el host
   * ni reinicia el motor: sólo cambia la presentación, así el reloj sigue exactamente donde iba —que
   * es todo el punto de la enmienda E1 («que siga normal a la pantalla grande del descanso
   * continuando con el timer que ya tenía el mini»). No-op si no hay descanso activo (p. ej. terminó
   * mientras el alumno anotaba) o si ya está expandido.
   */
  expandRest: () => void
  /** Cierra cualquier timer activo. */
  close: () => void
  /** Timer activo (o null). Tipado laxo en el contrato (`unknown`). */
  state: ActiveTimer | null
  /**
   * Registra (o limpia con null) la presentacion interstitial V3 del descanso (E3.1). Solo `ExecutorV3`
   * lo llama; mientras haya un renderer registrado, el descanso se monta como overlay fullscreen (con la
   * barra compacta como estado minimizado). Sin renderer registrado, el descanso usa la barra clasica
   * (fallback sin interstitial).
   */
  setRestInterstitial: (renderer: RestInterstitialRenderer | null) => void
}

const Ctx = createContext<WorkoutTimersApi | null>(null)

/**
 * Convierte "01:30" | "90" | "90s" | "1 min" a segundos. El `startRest` del hook
 * recibe SEGUNDOS (number, por contrato); usa esto para parsear un valor string
 * del plan antes de llamar. Port de `parseRestTime` web.
 */
export function parseRestTime(restStr: string | null | undefined): number {
  if (!restStr) return 0
  const str = String(restStr).toLowerCase().trim()
  if (str.includes(':')) {
    const [mm, ss] = str.split(':')
    return (parseInt(mm, 10) || 0) * 60 + (parseInt(ss, 10) || 0)
  }
  if (str.includes('s')) {
    const v = parseInt(str, 10)
    return Number.isNaN(v) ? 0 : v
  }
  if (str.includes('m')) {
    const v = parseInt(str, 10)
    return Number.isNaN(v) ? 0 : v * 60
  }
  const v = parseInt(str, 10)
  return Number.isNaN(v) ? 0 : v
}

export function WorkoutTimerProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveTimer | null>(null)
  const activeKindRef = useRef<ActiveTimer['kind'] | null>(null)
  const nonceRef = useRef(0)

  useEffect(() => {
    activeKindRef.current = active?.kind ?? null
  }, [active])

  // Hidrata preferencias de sonido y prepara el modo de audio una vez.
  useEffect(() => {
    void hydrateRestTimerPrefs()
    primeTimerAudio()
  }, [])

  /** Reemplazo suave: avisa si se pisa un timer de OTRO tipo (paridad web AC5). */
  const replaceWith = useCallback((next: ActiveTimer) => {
    if (activeKindRef.current && activeKindRef.current !== next.kind) {
      toast.info('Temporizador anterior reemplazado')
    }
    setActive(next)
  }, [])

  /**
   * ¿El descanso vivo se muestra MINIMIZADO (barra compacta) en vez del interstitial? (R3b)
   *
   * El estado vive ACÁ y ya no dentro de `RestTimerHost` porque pasó a tener dos dueños: el toque del
   * alumno (barra ⇄ interstitial, que sigue funcionando igual) y el orquestador, que necesita
   * arrancar el descanso minimizado (`startRest(…, { minimized: true })`) y expandirlo después
   * (`expandRest()`). Subirlo NO re-monta nada: el host se monta con `key={nonce}`, que no cambia al
   * alternar la presentación, así que el motor —y con él la cuenta— sobrevive intacto.
   *
   * Deliberadamente FUERA del `api` del contexto: es puro detalle de presentación, y publicarlo ahí
   * re-renderizaría a todos los consumidores (el ejecutor entero) en cada minimizar/expandir.
   */
  const [restMinimized, setRestMinimized] = useState(false)

  const startRest = useCallback(
    (input: number | string, opts?: RestOpts) => {
      // Paridad de contrato con la web (`WorkoutTimerProvider.tsx:96-99`): `startRest` acepta un
      // STRING ('MM:SS' | '90s' | '1 min' | '90') y lo parsea con `parseRestTime`, además del number
      // que ya pasa el ejecutor RN. Así un caller que pase un string NO rompe en silencio (antes el
      // early-return por `!Number.isFinite` lo tragaba). Sólo dispara si segundos > 0 (igual que web).
      const seconds = typeof input === 'string' ? parseRestTime(input) : input
      if (!Number.isFinite(seconds) || seconds <= 0) return
      // R3b: cada descanso declara su presentación inicial. Sin la opción arranca EXPANDIDO, como
      // siempre — así el flag nunca queda pegado del descanso anterior.
      setRestMinimized(opts?.minimized === true)
      // W5.1b: primera publicación del reloj para el chip vivo del teclado (`useRestRemainingSec`).
      // Va acá —y no sólo en el host— porque el chip puede montarse ANTES del primer tick del motor.
      // `Date.now()` en un handler, nunca en render (regla `react-hooks/purity`). Después el
      // `RestTimerHost` toma la posta con las pausas y los ±15 s.
      const secs = Math.round(seconds)
      publishRestClock(
        (opts?.autoStart ?? true)
          ? { endAtMs: Date.now() + secs * 1000, pausedRemainingSec: null }
          : { endAtMs: null, pausedRemainingSec: secs },
      )
      nonceRef.current += 1
      replaceWith({
        kind: 'rest',
        nonce: nonceRef.current,
        seconds: Math.round(seconds),
        autoStart: opts?.autoStart ?? true,
        label: opts?.label,
        warmup: opts?.warmup,
        setIndex: opts?.setIndex,
        setTotal: opts?.setTotal,
        countKind: opts?.countKind,
      })
    },
    [replaceWith],
  )

  const startHold = useCallback(
    (seconds: number, opts?: { label?: string }) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return
      nonceRef.current += 1
      replaceWith({ kind: 'hold', nonce: nonceRef.current, seconds: Math.round(seconds), label: opts?.label })
    },
    [replaceWith],
  )

  const startInterval = useCallback(
    (config: IntervalConfig, sets = 1) => {
      // Secuencia COMPLETA (Fase D · deuda #6 cardio-ejes): los pasos por DISTANCIA entran como
      // fases `manual` y el overlay muestra la distancia + "Fase siguiente" — antes acá había un
      // early-return con toast y 8×400m/HYROX quedaban sin timer flotante. `[]` solo si el work no
      // prescribe ni tiempo ni distancia (nada que correr).
      const phases = buildIntervalSequence(config, sets)
      if (phases.length === 0) return
      nonceRef.current += 1
      replaceWith({ kind: 'interval', nonce: nonceRef.current, phases })
    },
    [replaceWith],
  )

  const startStopwatch = useCallback(() => {
    nonceRef.current += 1
    replaceWith({ kind: 'stopwatch', nonce: nonceRef.current })
  }, [replaceWith])

  const close = useCallback(() => {
    // W5.1b: sin timer no hay reloj que mostrar. Es idempotente (`publishRestClock` ignora lo igual),
    // así que cerrar un hold/interval —que nunca publicó nada— no dispara a ningún suscriptor.
    clearRestClock()
    setActive(null)
  }, [])

  const cancelRest = useCallback(() => {
    clearRestClock()
    setActive((cur) => (cur?.kind === 'rest' ? null : cur))
  }, [])

  /**
   * R3b: el prompt de huecos se resolvió ⇒ el descanso que venía corriendo en la barra pasa a la
   * pantalla grande, sin tocar el motor. La guarda lee `activeKindRef` (y no `active`) para que el
   * callback quede ESTABLE: `ExecutorV3` lo mete en las deps de `resolveHoldPrompt`, que a su vez es
   * dep de `handleCommit`. Si el descanso ya se cerró solo mientras el alumno anotaba, no hace nada.
   */
  const expandRest = useCallback(() => {
    if (activeKindRef.current !== 'rest') return
    setRestMinimized(false)
  }, [])

  // Renderer del interstitial V3 (E3.1). `ExecutorV3` lo registra; se guarda envuelto en un objeto para
  // que un renderer (funcion) no se confunda con el updater funcional de `useState`.
  const [restInterstitial, setRestInterstitialState] = useState<{ render: RestInterstitialRenderer } | null>(null)
  const setRestInterstitial = useCallback((renderer: RestInterstitialRenderer | null) => {
    setRestInterstitialState(renderer ? { render: renderer } : null)
  }, [])

  // Silenciar la alarma con un toque en CUALQUIER parte del ejecutor (paridad web
  // `RestTimer.tsx:102-111`: mientras `isAlarmRinging`, un listener GLOBAL en `document`
  // escucha `click`/`touchstart` y CUALQUIER toque en cualquier zona llama `stopAlarm()`).
  // Antes en RN el toque solo silenciaba SOBRE la barra (`RestTimerBar` `onTouchStart`), no
  // sobre la fila de serie ni el fondo. El equivalente idiomático es un observador de
  // responder a nivel de TODA la pantalla: `onStartShouldSetResponderCapture` corre en la
  // fase de captura para CADA toque sobre cualquier descendiente (ejecutor + overlay) y
  // SIEMPRE devuelve false → nunca roba el gesto, así el toque además ejecuta su acción normal
  // debajo (igual que el listener pasivo de la web). `RestTimerBar` registra aquí su `stopAlarm`
  // mientras la alarma suena (y lo limpia al parar/desmontar); si no hay rest activo el ref es
  // null → no-op (no afecta hold/interval/cronómetro).
  const alarmSilencerRef = useRef<(() => void) | null>(null)
  const registerAlarmSilencer = useCallback((silence: (() => void) | null) => {
    alarmSilencerRef.current = silence
  }, [])
  const handleScreenTouchCapture = useCallback(() => {
    alarmSilencerRef.current?.()
    return false // observador puro: no captura el gesto (el ejecutor/scroll debajo lo maneja)
  }, [])

  const api = useMemo<WorkoutTimersApi>(
    () => ({ startRest, startHold, startInterval, startStopwatch, cancelRest, expandRest, close, state: active, setRestInterstitial }),
    [startRest, startHold, startInterval, startStopwatch, cancelRest, expandRest, close, active, setRestInterstitial],
  )

  return (
    <Ctx.Provider value={api}>
      {/* Wrapper de pantalla completa: ancla el observador de toques (silenciar-alarma-en-cualquier-lado,
          ver `handleScreenTouchCapture`) como ANCESTRO del ejecutor Y del overlay, de modo que la fase de
          captura vea todo toque de la pantalla — imposible desde el overlay `box-none` (es hermano encima,
          no ancestro). `flex:1` para llenar (el ejecutor ya es un SafeAreaView flex-1). */}
      <View style={styles.screen} onStartShouldSetResponderCapture={handleScreenTouchCapture}>
      {children}
      {/* <AnimatePresence> mantiene el overlay montado mientras el timer sale, para que la barra de
          descanso ANIME su salida (`exit` de `RestTimerBar`) en vez de desaparecer de golpe — paridad
          web `RestTimer.tsx:300-308` (motion.div dentro de AnimatePresence con `exit={{ y:40, opacity:0 }}`).
          Key ESTABLE en el overlay: el swap por `nonce` (remount al re-disparar el mismo tipo) NO es un
          hijo directo de AnimatePresence, así no dispara exit — solo la transición null↔activo anima. */}
      <AnimatePresence>
        {active ? (
          <View key="timer-overlay" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {active.kind === 'rest' ? (
              <RestTimerHost
                key={active.nonce}
                initialSeconds={active.seconds}
                autoStart={active.autoStart}
                nextLabel={active.label}
                setIndex={active.setIndex}
                setTotal={active.setTotal}
                countKind={active.countKind}
                warmup={active.warmup}
                onClose={close}
                registerAlarmSilencer={registerAlarmSilencer}
                renderInterstitial={restInterstitial?.render ?? null}
                minimized={restMinimized}
                onMinimizedChange={setRestMinimized}
              />
            ) : null}
            {active.kind === 'hold' ? (
              <HoldTimer key={active.nonce} initialSeconds={active.seconds} label={active.label} onClose={close} />
            ) : null}
            {active.kind === 'interval' ? (
              <IntervalTimer key={active.nonce} phases={active.phases} onClose={close} />
            ) : null}
            {active.kind === 'stopwatch' ? <StopwatchTimer key={active.nonce} onClose={close} /> : null}
          </View>
        ) : null}
      </AnimatePresence>
      </View>
    </Ctx.Provider>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
})

/** Hook de acceso a los timers. Debe usarse dentro de `WorkoutTimerProvider`. */
export function useWorkoutTimers(): WorkoutTimersApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWorkoutTimers must be used within a WorkoutTimerProvider')
  return ctx
}
