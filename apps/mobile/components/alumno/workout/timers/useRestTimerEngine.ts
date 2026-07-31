import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { haptics, timerHaptics } from '../../../../lib/haptics'
import {
  isRestTimerMuted,
  isRestTimerVibrationEnabled,
  setRestTimerMuted,
  subscribeRestTimerPrefs,
} from './rest-timer-preferences'
import { playTimerCue } from './sound'
import {
  cancelRestEndNotification,
  dismissRestEndNotification,
  ensureRestNotifPermission,
  scheduleRestEndNotification,
  sweepRestNotifications,
} from './rest-notification'
import {
  showRestLiveCountdown,
  showRestPausedNotice,
  stopRestLiveCountdown,
  type RestLiveContext,
} from './rest-live-notification'
import {
  clearRestLiveSnapshot,
  drainRestRemoteCommands,
  getRestLiveSnapshot,
  setRestLiveSnapshot,
  subscribeRestRemoteCommands,
} from './rest-remote-commands'

/**
 * Motor del descanso protagonista (E3.1) — EXTRAIDO 1:1 del cuerpo de `RestTimerBar` (Ola 2) para que
 * DOS presentaciones (la barra compacta y el interstitial V3 fullscreen) consuman UN MISMO cronometro.
 * NO re-implementa nada: es exactamente la misma cuenta endTime-based (resiste el throttling de
 * background), las mismas notificaciones locales/cronometro vivo, la misma alarma en loop, y los mismos
 * controles (pausa/reset/±15s/mute/cerrar). El `RestTimerHost` lo instancia UNA vez y se lo pasa a la
 * presentacion activa; al minimizar/expandir el interstitial el host NO re-monta → el motor sobrevive.
 *
 * Cambio ADITIVO (E3.7): la haptica de la alarma final y del tick 3-2-1 ahora respeta la preferencia
 * `restTimerVibration` (la tuerca V3). Default ON = feel identico a Ola 2. El audio del tick/alarma sigue
 * gateado por `restTimerMuted` (self-gate en `playTimerCue`).
 *
 * Contrato de background/lock-screen: identico al de `RestTimerBar` original (ver sus comentarios). En
 * Android el cronometro vivo del lockscreen SI existe (E5.3, `rest-live-notification.ts` via notify-kit
 * chronometer — enciende con un build EAS que enlace la lib).
 *
 * MEDIA SESSION / controles multimedia de lockscreen (E5.5) — DIFERIDO. Evaluacion: NO hay camino limpio
 * con Expo puro para exponer controles de pantalla de bloqueo (play/pausa/±) de un TEMPORIZADOR:
 *   · `expo-audio` reproduce efectos pero NO expone MediaSession (Android) ni MPNowPlayingInfoCenter /
 *     MPRemoteCommandCenter (iOS) para un cronometro; su superficie es solo playback.
 *   · `expo-video` tiene `showNowPlayingNotification`, pero atado a la reproduccion de un video real, no a
 *     una cuenta regresiva — no aplica a un rest timer.
 *   · iOS especialmente exige un modulo nativo custom (MPNowPlayingInfoCenter + remote commands) que Expo
 *     no envuelve. Implementarlo a ciegas sin build de device seria adivinar.
 * Por eso el Android-only chronometer (E5.3) es la maxima cobertura de lockscreen sin modulo nativo; los
 * controles multimedia reales (iOS + botones de accion) quedan DIFERIDOS hasta un modulo nativo dedicado.
 */
export interface RestTimerEngine {
  /** Segundos restantes (recomputados desde endTime). */
  timeLeft: number
  /** Total de la barra/anillo (crece con +15s si se pasa del inicial). */
  totalSeconds: number
  /** Corriendo (true) o en pausa (false). */
  isActive: boolean
  /** Alarma sonando (llego a 0). */
  isAlarmRinging: boolean
  /** Sonido silenciado (preferencia global del cronometro). */
  muted: boolean
  /** Llego a 0. */
  done: boolean
  /** Pausa/reanuda. */
  toggleTimer: () => void
  /** Reinicia al valor inicial y arranca. */
  resetTimer: () => void
  /** ±segundos al vuelo (reanuda si venia del 0; respeta pausa). */
  adjust: (delta: number) => void
  /** Alias semantico de `adjust` (E3.1 pidio un control `extend`). */
  extend: (delta: number) => void
  /** Alterna el mute global del cronometro. */
  toggleMute: () => void
  /** Silencia la alarma en curso (sin cerrar el descanso). */
  stopAlarm: () => void
  /** Cierra/salta el descanso (limpia notifs + alarma) e invoca `onClose`. */
  close: () => void
}

interface UseRestTimerEngineArgs {
  initialSeconds: number
  autoStart?: boolean
  onClose: () => void
  /**
   * Registra en el provider el `stopAlarm` mientras la alarma suena, para que un toque en CUALQUIER parte
   * de la pantalla la silencie (paridad web listener global de `document`). Opcional.
   */
  registerAlarmSilencer?: (silence: (() => void) | null) => void
  /**
   * Contexto VISUAL de la notificacion del descanso (ejercicio que sigue, serie, logo del coach).
   * Opcional: sin el, la notificacion conserva los copys historicos. Lo arma `RestTimerHost`, que ya
   * tiene el `nextLabel` y el branding runtime via `useTheme()`.
   */
  liveContext?: RestLiveContext
}

export function useRestTimerEngine({
  initialSeconds,
  autoStart = true,
  onClose,
  registerAlarmSilencer,
  liveContext,
}: UseRestTimerEngineArgs): RestTimerEngine {
  const [timeLeft, setTimeLeft] = useState(initialSeconds)
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds)
  const [isActive, setIsActive] = useState(autoStart)
  const [isAlarmRinging, setIsAlarmRinging] = useState(false)
  const [muted, setMuted] = useState(isRestTimerMuted())

  const endTimeRef = useRef<number | null>(null)
  const timeLeftRef = useRef(initialSeconds)
  const isActiveRef = useRef(autoStart)
  const mountedRef = useRef(true)
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const alarmCountRef = useRef(0)
  const alarmRingingRef = useRef(false)
  const lastBeepRef = useRef<number | null>(null)
  // Contexto visual en un ref: cambia de identidad en cada render del host, pero las callbacks que lo
  // usan (syncEndNotification) no deben re-crearse por eso — re-crearlas reejecutaria sus efectos.
  // Se sincroniza en un efecto (no durante el render) por la regla `react-hooks/refs`.
  const liveContextRef = useRef<RestLiveContext | undefined>(liveContext)
  // Drenador de comandos remotos, expuesto por ref para que el listener de AppState (declarado ANTES
  // que la callback) lo invoque PRIMERO al volver a foreground: asi el estado que dejo un boton de la
  // notificacion se adopta antes de que el recomputo desde `endTimeRef` lea un reloj viejo.
  const consumeRemoteRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    liveContextRef.current = liveContext
  }, [liveContext])

  // Sincroniza el mute con la preferencia global (tuerca ↔ barra/interstitial).
  useEffect(() => {
    const unsub = subscribeRestTimerPrefs(() => setMuted(isRestTimerMuted()))
    return unsub
  }, [])

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current)
      alarmIntervalRef.current = null
    }
    alarmRingingRef.current = false
    alarmCountRef.current = 0
    setIsAlarmRinging(false)
  }, [])

  // Limpieza dura al desmontar: corta el loop de alarma y cancela notifs programadas + cronometro vivo.
  // Tambien BORRA el espejo del puente de acciones: sin descanso montado, un press de la notificacion
  // no debe encontrar un snapshot fantasma con el que "mover" un reloj que ya no existe.
  useEffect(() => () => {
    mountedRef.current = false
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current)
    void cancelRestEndNotification()
    void stopRestLiveCountdown()
    void dismissRestEndNotification()
    clearRestLiveSnapshot()
  }, [])

  // Silenciar-alarma-en-cualquier-lado: registra `stopAlarm` en el provider SOLO mientras suena.
  useEffect(() => {
    if (!registerAlarmSilencer) return
    registerAlarmSilencer(isAlarmRinging ? stopAlarm : null)
    return () => registerAlarmSilencer(null)
  }, [isAlarmRinging, stopAlarm, registerAlarmSilencer])

  const triggerAlarm = useCallback(() => {
    if (alarmRingingRef.current) return
    alarmRingingRef.current = true
    alarmCountRef.current = 1
    setIsAlarmRinging(true)
    setIsActive(false)
    endTimeRef.current = null

    // Cue HAPTICO (gateado por la preferencia de vibracion, E3.7) + audio gateado por mute. El alarma
    // llego en foreground: cancela la notif local programada (evita el beep duplicado al minimizar en el 0).
    if (isRestTimerVibrationEnabled()) timerHaptics.restAlarm()
    void cancelRestEndNotification()
    void stopRestLiveCountdown()
    playTimerCue('alarm')

    // Recordatorio en loop: refuerzo cada 3s hasta 5 veces.
    alarmIntervalRef.current = setInterval(() => {
      alarmCountRef.current += 1
      if (alarmCountRef.current > 5) {
        stopAlarm()
      } else {
        if (isRestTimerVibrationEnabled()) timerHaptics.restAlarm()
        playTimerCue('alarm')
      }
    }, 3000)
  }, [stopAlarm])

  /**
   * Publica el espejo module-level que consume el puente de acciones de la notificacion
   * (`rest-remote-commands.ts`). Se llama en CADA transicion, nunca en el tick: el handler headless
   * necesita el `endEpochMs` ABSOLUTO, no un contador. `frozenSeconds` cubre la pausa, donde no hay
   * reloj y la verdad son los segundos congelados.
   */
  const publishSnapshot = useCallback(
    (end: number | null, frozenSeconds?: number) => {
      const remainingSeconds =
        end != null
          ? Math.max(0, Math.ceil((end - Date.now()) / 1000))
          : Math.max(0, Math.round(frozenSeconds ?? timeLeftRef.current))
      setRestLiveSnapshot({
        endEpochMs: end,
        remainingSeconds,
        initialSeconds,
        muted: isRestTimerMuted(),
        context: liveContextRef.current,
      })
    },
    [initialSeconds],
  )

  // Cronometro real de fondo: mantiene la notif local de FIN sincronizada con `endTimeRef`.
  const syncEndNotification = useCallback(async () => {
    const end = endTimeRef.current
    if (!end) {
      await cancelRestEndNotification()
      void stopRestLiveCountdown()
      publishSnapshot(null)
      return
    }
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000))
    if (remaining <= 0) {
      await cancelRestEndNotification()
      void stopRestLiveCountdown()
      publishSnapshot(null)
      return
    }
    publishSnapshot(end)
    await scheduleRestEndNotification(remaining)
    void showRestLiveCountdown(end, liveContextRef.current)
  }, [publishSnapshot])

  // Permiso de notificaciones (lazy, cacheado). Barre huerfanas al arrancar un descanso nuevo.
  useEffect(() => {
    void sweepRestNotifications()
    void ensureRestNotifPermission().then(() => {
      if (mountedRef.current) void syncEndNotification()
    })
  }, [syncEndNotification])

  // Cuenta regresiva basada en endTime (resiste throttling de background).
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (isActive && timeLeft > 0) {
      if (!endTimeRef.current) {
        endTimeRef.current = Date.now() + timeLeft * 1000
        void syncEndNotification()
      }
      interval = setInterval(() => {
        if (!endTimeRef.current) return
        const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        timeLeftRef.current = next
        setTimeLeft(next)
        if (next <= 2) void cancelRestEndNotification()
        if (next === 0) triggerAlarm()
      }, 500)
    } else if (timeLeft === 0 && isActive) {
      triggerAlarm()
    } else if (!isActive) {
      endTimeRef.current = null
      void cancelRestEndNotification()
      publishSnapshot(null, timeLeft)
      // Espejo del estado en la bandeja (QA-11 fase 2): en PAUSA la notificacion NO se retira, se
      // convierte en la ficha estatica "Descanso en pausa" con [Reanudar][Saltar]. Es lo que hace
      // operable la pausa desde background y ademas evita que el efecto borre la ficha que acaba de
      // pintar el handler cuando la pausa vino DEL boton de la notificacion. Con el descanso agotado
      // o la alarma sonando no hay nada que reanudar → se retira como siempre.
      if (timeLeft > 0 && !alarmRingingRef.current) {
        void showRestPausedNotice(timeLeft, liveContextRef.current)
      } else {
        void stopRestLiveCountdown()
      }
    }
    return () => clearInterval(interval)
  }, [isActive, timeLeft, triggerAlarm, syncEndNotification, publishSnapshot])

  // Beeps/hapticos 3-2-1 en los ultimos 3s (el 0 lo cubre la alarma). Haptica gateada por vibracion
  // (E3.7); audio auto-gateado por mute dentro de `playTimerCue`.
  useEffect(() => {
    if (!isActive) return
    if (timeLeft > 0 && timeLeft <= 3 && lastBeepRef.current !== timeLeft) {
      lastBeepRef.current = timeLeft
      if (isRestTimerVibrationEnabled()) void haptics.select()
      playTimerCue('tick')
    }
  }, [timeLeft, isActive])

  // AppState: al volver a foreground recomputa desde endTime; al irse a background reafirma la notif.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // PRIMERO los comandos que llegaron desde los botones de la notificacion mientras el JS
        // dormia: si el alumno toco "+15 s" o "Pausar", `endTimeRef` esta desactualizado y recomputar
        // antes de adoptarlos podria disparar la alarma con un fin viejo.
        consumeRemoteRef.current?.()
        void cancelRestEndNotification()
        void dismissRestEndNotification()
        if (!endTimeRef.current) return
        const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        timeLeftRef.current = remaining
        setTimeLeft(remaining)
        if (remaining === 0) triggerAlarm()
      } else {
        void syncEndNotification()
      }
    })
    return () => sub.remove()
  }, [triggerAlarm, syncEndNotification])

  const toggleTimer = useCallback(() => {
    void haptics.tap()
    setIsActive((a) => !a)
  }, [])

  const resetTimer = useCallback(() => {
    stopAlarm()
    void cancelRestEndNotification()
    void stopRestLiveCountdown()
    void haptics.tap()
    setTimeLeft(initialSeconds)
    setTotalSeconds(initialSeconds)
    timeLeftRef.current = initialSeconds
    lastBeepRef.current = null
    endTimeRef.current = null
    setIsActive(true)
  }, [initialSeconds, stopAlarm])

  const adjust = useCallback(
    (delta: number) => {
      void haptics.select()
      const prev = timeLeftRef.current
      const next = Math.max(0, prev + delta)
      timeLeftRef.current = next
      setTimeLeft(next)
      setTotalSeconds((t) => (next > t ? next : t))
      if (next <= 3) lastBeepRef.current = null

      if (next === 0) {
        endTimeRef.current = null
      } else if (prev === 0) {
        stopAlarm()
        setIsActive(true)
        endTimeRef.current = Date.now() + next * 1000
      } else if (isActiveRef.current) {
        endTimeRef.current = Date.now() + next * 1000
      } else {
        endTimeRef.current = null
      }
      void syncEndNotification()
    },
    [stopAlarm, syncEndNotification],
  )

  const toggleMute = useCallback(() => {
    void haptics.tap()
    setRestTimerMuted(!isRestTimerMuted())
  }, [])

  const close = useCallback(() => {
    stopAlarm()
    void cancelRestEndNotification()
    void stopRestLiveCountdown()
    void dismissRestEndNotification()
    clearRestLiveSnapshot()
    onClose()
  }, [onClose, stopAlarm])

  /**
   * Aplica los comandos que dejaron los BOTONES de la notificacion (QA-11 fase 2). Misma semantica que
   * los controles in-app (toggleTimer / adjust / close) con UNA diferencia deliberada:
   *
   *   NO se re-aplica el delta. El handler de la notificacion ya movio el reloj (tenia que hacerlo:
   *   en background el motor puede tardar minutos en correr, y la notificacion y la alerta final se
   *   reprograman ahi mismo). Por eso aca ADOPTAMOS el `endEpochMs` ABSOLUTO del snapshot en vez de
   *   sumar 15 s otra vez — sumar seria el doble-apply clasico (+30 s por un solo toque).
   */
  const consumeRemoteCommands = useCallback(() => {
    const commands = drainRestRemoteCommands()
    if (commands.length === 0) return
    for (const command of commands) {
      if (command.type === 'skip') {
        close()
        continue
      }
      if (command.type === 'pause') {
        const snap = getRestLiveSnapshot()
        const frozen = snap ? Math.max(0, Math.round(snap.remainingSeconds)) : timeLeftRef.current
        timeLeftRef.current = frozen
        setTimeLeft(frozen)
        endTimeRef.current = null
        isActiveRef.current = false
        setIsActive(false)
        continue
      }
      // 'plus15' | 'resume' → adoptar el reloj absoluto del snapshot (ver comentario de arriba).
      const end = getRestLiveSnapshot()?.endEpochMs ?? null
      if (end == null) continue
      const next = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      if (next <= 0) continue
      stopAlarm()
      timeLeftRef.current = next
      setTimeLeft(next)
      setTotalSeconds((t) => (next > t ? next : t))
      if (next <= 3) lastBeepRef.current = null
      endTimeRef.current = end
      isActiveRef.current = true
      setIsActive(true)
    }
  }, [close, stopAlarm])

  useEffect(() => {
    consumeRemoteRef.current = consumeRemoteCommands
    // `subscribeRestRemoteCommands` dispara el callback de inmediato si ya habia pendientes: cubre el
    // press que ocurrio antes de que este motor montara/se suscribiera.
    const unsubscribe = subscribeRestRemoteCommands(consumeRemoteCommands)
    return () => {
      consumeRemoteRef.current = null
      unsubscribe()
    }
  }, [consumeRemoteCommands])

  const done = timeLeft === 0

  return {
    timeLeft,
    totalSeconds,
    isActive,
    isAlarmRinging,
    muted,
    done,
    toggleTimer,
    resetTimer,
    adjust,
    extend: adjust,
    toggleMute,
    stopAlarm,
    close,
  }
}
