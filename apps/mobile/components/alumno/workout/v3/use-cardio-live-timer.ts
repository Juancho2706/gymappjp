/**
 * Espejo del cardio en la bandeja/lockscreen (Android) — un ÚNICO punto donde los tres heroes de
 * `CardioScreenV3` (countdown por duración, runner de intervalos y cronómetro por distancia) publican
 * su estado como notificación ongoing con contador NATIVO, más la alerta puntual de "¡Cardio
 * completo!" para cuando la app está en segundo plano.
 *
 * ── LA NOTIFICACIÓN ES UN ESPEJO, NUNCA LA FUENTE DE VERDAD ────────────────────
 * La cuenta sigue viviendo intacta en `timing.ts` (endTime absoluto, tick de 250 ms, re-sync por
 * `AppState`). Acá NO se cuenta nada: en cada TRANSICIÓN se traduce el estado a un instante absoluto
 * (`endEpochMs` / `startEpochMs`) y el chronometer de Android avanza solo desde ahí, con la pantalla
 * apagada y el JS congelado. Si la notificación fallara (sin lib nativa, sin permiso), el timer de la
 * pantalla funciona exactamente igual.
 *
 * ── POR QUÉ UNA "KEY" DE TRANSICIÓN Y NO reaccionar a los segundos ─────────────
 * Los heroes repintan cada 250 ms. Llamar a `showLiveTimer` en cada tick sería absurdo (una IPC al
 * módulo nativo 4 veces por segundo) y además haría PARPADEAR la notificación. Por eso el consumidor
 * entrega un `key` que cambia SOLO en transiciones reales (arranque, pausa, reanudar, reiniciar,
 * cambio de fase, y `null` al terminar/entrar en una fase manual): el efecto depende del `key` y lee
 * los segundos FRESCOS desde un ref en el instante en que dispara.
 *
 * ── NOTIFICACIÓN OPERABLE (ronda cardio, espejo de QA-11 fase 2 del descanso) ──
 * La notificación ya no sólo mira: lleva botones (Pausar / Fase siguiente / Reanudar) cuyos presses
 * atiende un handler HEADLESS (`timers/cardio-remote-commands.ts`) que puede correr con la app
 * cerrada. De ahí dos responsabilidades NUEVAS de este hook:
 *   1. PUBLICAR el snapshot absoluto del cardio vivo en cada transición (es lo único que el handler
 *      tiene para saber hasta cuándo corre el bloque sin preguntarle a React).
 *   2. DRENAR los comandos que dejó ese handler y aplicarlos con los controles REALES del hero
 *      (`toggle`/`skip` de `timing.ts`), que se reciben en `controls`.
 * El estado PAUSA ya no es "spec null": el hero publica un spec con `paused: true` y acá se pinta la
 * ficha estática "Cardio en pausa · [Reanudar]". Eso no es cosmético — es lo que impide que, al
 * aplicar un "Pausar" que vino de la notificación, el efecto borrara la ficha que el handler acaba de
 * pintar (mismo razonamiento que `useRestTimerEngine` al pausar).
 *
 * ── ADOPCIÓN DEL RELOJ AL DRENAR (deuda CERRADA para los TRES modos) ───────────
 * El handler headless ya actuó antes de encolar (congeló o re-ancló los instantes absolutos), así que
 * la pantalla ADOPTA ese valor en vez de re-aplicar el delta. Qué se adopta lo decide
 * `planCardioAdoption` (puro, testeado) y lo aplica el hero por `controls.adoptExact`:
 *   · COUNTDOWN: `restart(segundos)` (+ `toggle` si el destino es pausa) — `useCountdown` no expone
 *     otra forma de fijar el restante, y es seguro porque `CountdownHero` deriva su anillo de
 *     `durationSec` (prop), no del `target` interno del hook.
 *   · INTERVALOS: `adoptRemaining(segundos, corriendo)` de `useIntervalRunner` — re-ancla el fin de la
 *     fase EN CURSO sin mover `phaseIndex` ni disparar `onPhaseChange`.
 *   · CRONÓMETRO: `adopt(transcurridos, corriendo)` de `useStopwatch` — fija el acumulador.
 * Antes, intervalos y cronómetro sólo hacían `toggle()` y el rato que el bloque estuvo pausado desde
 * el lockscreen se contaba como corrido (deuda consciente del corte anterior). Ya no: la pausa
 * también adopta el valor congelado del snapshot cuando difiere de lo que pinta la pantalla.
 *
 * ── ALERTA FINAL: sólo debe sonar si la app NO está delante ────────────────────
 * Mismo criterio que el descanso (`useRestTimerEngine`): con la app viva el cue lo da la UI
 * (háptica/flash), así que al volver a foreground se cancela la programada y se barren las pintadas;
 * al salir de foreground se REAFIRMA con el estado fresco (el JS todavía está vivo en ese instante).
 * Además se cancela al entrar en los últimos 3 s en foreground, que es donde la programada y el cue
 * in-app competirían por sonar (misma red que `next <= 2` en el motor del descanso).
 *
 * ── largeIcon de marca (UNIFICADO con el descanso) ─────────────────────────────
 * La nota previa decía que se omitía a propósito "porque el descanso tampoco lo usa". Eso quedó
 * OBSOLETO: el cronómetro vivo del descanso SÍ pasa el logo del coach (`RestTimerHost` lo resuelve
 * con `useTheme()`, prefiriendo `logoUrlDark` en tema oscuro) y las dos notificaciones del ejecutor
 * deben verse hermanas. `CardioScreenV3` resuelve el logo con el MISMO criterio y lo baja por
 * `largeIconUrl`; sin branding el campo va `undefined` y la notificación queda como antes.
 *
 * ⚠️ El contador vivo REQUIERE un build EAS que enlace `react-native-notify-kit`; hasta entonces todo
 * el módulo nativo es NO-OP seguro (ver `live-timer-notification.ts`). La alerta final (expo) sí
 * funciona en los binarios actuales.
 */
import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import {
  showCardioLive,
  showCardioPausedNotice,
  stopCardioLive,
  type CardioLiveMode,
} from '../timers/cardio-live-notification'
import {
  cancelCardioEndNotification,
  dismissCardioEndNotification,
  ensureCardioNotifPermission,
  scheduleCardioEndNotification,
  sweepCardioNotifications,
} from '../timers/cardio-notification'
import {
  clearCardioLiveSnapshot,
  drainCardioRemoteCommands,
  getCardioLiveSnapshot,
  setCardioLiveSnapshot,
  subscribeCardioRemoteCommands,
} from '../timers/cardio-remote-commands'
import { planCardioAdoption } from './cardio-adoption'

export interface CardioLiveSpec {
  /**
   * Clave de TRANSICIÓN: sólo cuando cambia (o pasa a/desde `null`) se re-publica la notificación.
   * Debe ser estable durante todo un tramo corriendo — jamás derivarla de los segundos. Sí debe
   * distinguir corriendo de pausado (la pausa es una transición real).
   */
  key: string
  /** Hero que publica (decide botones y copys de la ficha en pausa). */
  mode: CardioLiveMode
  /** `'down'` = cuenta regresiva (countdown/fase de intervalo); `'up'` = cronómetro ascendente. */
  direction: 'down' | 'up'
  /** Segundos que faltan (`down`) o transcurridos (`up`) AHORA. Se lee sólo en las transiciones. */
  seconds: number
  /** Bloque PAUSADO: ficha estática con [Reanudar] en vez del contador nativo. */
  paused?: boolean
  title: string
  body?: string
  /** Acento del ícono/título: color de la zona objetivo o de la fase en curso. */
  color?: string
  /** Logo del coach (branding runtime) para el ícono grande — unificado con el descanso. */
  largeIconUrl?: string
  /** Fase actual y total de la secuencia (sólo intervalos; informativo para el snapshot). */
  phaseIndex?: number
  phaseCount?: number
  /**
   * Segundos hasta el fin del BLOQUE completo para la alerta "¡Cardio completo!". `null` cuando no hay
   * instante de fin conocido (cronómetro por distancia, o una secuencia con fases manuales pendientes).
   */
  endNotifSeconds?: number | null
}

/**
 * Controles REALES del hero (los de `timing.ts`) que el drenaje usa para aplicar lo que se tocó en la
 * notificación. Todo opcional salvo lo que cada modo puede ofrecer honestamente.
 */
export interface CardioLiveControls {
  /** ¿El hero está corriendo AHORA? (valor de render; el drenaje lo lee por ref). */
  running: boolean
  /** Pausa/reanuda (el `toggle` del hook de timing). */
  toggle: () => void
  /**
   * ADOPCIÓN EXACTA: fija el reloj del hero en `seconds` (restantes en los modos `down`, transcurridos
   * en el cronómetro) y lo deja corriendo o detenido de una sola vez. Lo implementa cada hero con el
   * mecanismo de su hook de `timing.ts` — ver la cabecera. Opcional por contrato, pero los tres heroes
   * lo pasan hoy: sin él el drenaje cae al `toggle` aproximado.
   */
  adoptExact?: (seconds: number, running: boolean) => void
  /** Intervalos: avanza a la fase siguiente (`skip` del runner). */
  skipPhase?: () => void
}

/** Publica/actualiza el contador vivo (o la ficha en pausa) con el estado de `spec`. */
function pushCardioLive(spec: CardioLiveSpec): void {
  const now = Date.now()
  const secs = Math.max(0, Math.round(spec.seconds))
  if (spec.paused) {
    void showCardioPausedNotice({
      mode: spec.mode,
      seconds: secs,
      title: spec.title,
      color: spec.color,
      largeIconUrl: spec.largeIconUrl,
    })
    return
  }
  void showCardioLive({
    mode: spec.mode,
    direction: spec.direction,
    // `showLiveTimer` ignora el campo que no corresponde a la dirección (exige el suyo finito).
    endEpochMs: spec.direction === 'down' ? now + secs * 1000 : undefined,
    startEpochMs: spec.direction === 'up' ? now - secs * 1000 : undefined,
    title: spec.title,
    body: spec.body,
    color: spec.color,
    largeIconUrl: spec.largeIconUrl,
  })
}

/**
 * Publica el ESPEJO module-level que consume el handler headless. Traduce los segundos del spec a
 * instantes ABSOLUTOS (un handler que corre minutos después no puede confiar en un contador) y
 * congela lo que corresponda cuando el bloque está en pausa.
 */
function publishCardioSnapshot(spec: CardioLiveSpec): void {
  const now = Date.now()
  const secs = Math.max(0, Math.round(spec.seconds))
  const down = spec.direction === 'down'
  const endNotif = spec.endNotifSeconds != null && spec.endNotifSeconds > 0 ? spec.endNotifSeconds : null
  setCardioLiveSnapshot({
    mode: spec.mode,
    endEpochMs: !spec.paused && down ? now + secs * 1000 : null,
    startEpochMs: !spec.paused && !down ? now - secs * 1000 : null,
    pausedRemainingSec: spec.paused && down ? secs : null,
    pausedElapsedSec: spec.paused && !down ? secs : null,
    endNotifEpochMs: !spec.paused && endNotif != null ? now + endNotif * 1000 : null,
    pausedEndNotifSec: spec.paused ? endNotif : null,
    title: spec.title,
    body: spec.body,
    color: spec.color,
    largeIconUrl: spec.largeIconUrl,
    phaseIndex: spec.phaseIndex,
    phaseCount: spec.phaseCount,
  })
}

/** Retira TODO el rastro de cardio: contador vivo + programada + ya entregadas. */
function clearCardioNotifications(): void {
  void stopCardioLive()
  void cancelCardioEndNotification()
  void dismissCardioEndNotification()
}

/**
 * Cablea el espejo del cardio. `spec === null` ⇒ no hay bloque que espejar (nunca arrancó, terminó, o
 * está en una fase manual) y se limpia todo, incluido el puente. El contador vivo es multiplataforma
 * desde la Ola 7A —Android lo dibuja como notificación ONGOING con `chronometer`, iOS como Live
 * Activity en lockscreen + Dynamic Island—, y ambas ramas salen gratis desde `cardio-live-notification`
 * sin tocar este hook. La alerta final también es multiplataforma. Nunca lanza y nunca altera la
 * cuenta de la pantalla.
 */
export function useCardioLiveTimer(spec: CardioLiveSpec | null, controls?: CardioLiveControls): void {
  // Espejo del spec para leer valores FRESCOS dentro de efectos que no dependen de ellos (patrón
  // `onDoneRef` de `timing.ts`). Se declara ANTES que el resto: los efectos corren en orden de
  // declaración, así el ref ya está al día cuando dispara una transición.
  const specRef = useRef(spec)
  const controlsRef = useRef(controls)
  useEffect(() => {
    specRef.current = spec
    controlsRef.current = controls
  })

  const key = spec?.key ?? null
  // Últimos segundos DEL BLOQUE (no de la fase) con la app delante: es donde la programada y el cue
  // in-app competirían por sonar. Booleano ⇒ el efecto dispara UNA vez al entrar en la ventana, no en
  // cada tick. En pausa no hay recta final que vigilar.
  const nearEnd = !spec?.paused && spec?.endNotifSeconds != null && spec.endNotifSeconds <= 3

  // Vivo mientras la pantalla lo esté: corta los `then` del permiso si el alumno cambia de ejercicio
  // mientras el diálogo del SO está abierto (programar tras el desmontaje dejaría una huérfana).
  const mountedRef = useRef(true)
  const permAskedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    // Barrido de programadas huérfanas de un mount previo que murió sin limpiar. No promptea nada.
    void sweepCardioNotifications()
    return () => {
      mountedRef.current = false
    }
  }, [])

  /**
   * Aplica los comandos que dejaron los BOTONES de la notificación. Los comandos se COLAPSAN a una
   * intención final antes de tocar nada: un drenaje puede traer varios presses (pausar → reanudar con
   * la app dormida) y aplicarlos uno a uno leería un `running` viejo entre medio, dejando el hero al
   * revés de lo que el alumno pidió. El salto de fase se aplica primero porque es independiente del
   * estado corriendo/pausado.
   */
  const applyRemoteCommands = useCallback(() => {
    const controlsNow = controlsRef.current
    if (!controlsNow) return
    const commands = drainCardioRemoteCommands()
    if (commands.length === 0) return
    let skipRequested = false
    let desiredRunning: boolean | null = null
    for (const command of commands) {
      if (command.type === 'skip-phase') {
        skipRequested = true
        continue
      }
      desiredRunning = command.type === 'resume'
    }
    try {
      if (skipRequested) controlsNow.skipPhase?.()
      if (desiredRunning == null) return
      // Qué adoptar es aritmética pura sobre el snapshot (`cardio-adoption.ts`): reanudar toma el
      // instante re-anclado por el handler; pausar toma el valor que ese mismo handler CONGELÓ, y sólo
      // si difiere de lo que el hero pinta ahora (`spec.seconds`, restantes o transcurridos según modo).
      const plan = planCardioAdoption(
        getCardioLiveSnapshot(),
        desiredRunning,
        specRef.current?.seconds ?? null,
      )
      if (plan.action === 'adopt' && controlsNow.adoptExact) {
        controlsNow.adoptExact(plan.seconds, plan.running)
        return
      }
      // Sin adopción exacta disponible (o sin valor que fijar): al menos honrar corriendo/pausado.
      if (controlsNow.running !== plan.running) controlsNow.toggle()
    } catch {
      // Un comando que falla no puede tumbar la pantalla.
    }
  }, [])

  // Drenaje: al montar (un press pudo ocurrir antes de que esta pantalla existiera) y ante cada
  // press nuevo. Declarado ANTES del efecto de transición para que el estado remoto se adopte antes
  // de que la transición publique un espejo con datos viejos.
  useEffect(() => {
    applyRemoteCommands()
    return subscribeCardioRemoteCommands(applyRemoteCommands)
  }, [applyRemoteCommands])

  // TRANSICIONES: única vía por la que se publica el contador vivo y el espejo del puente.
  useEffect(() => {
    const current = specRef.current
    if (key == null || current == null) {
      // Sin bloque vivo tampoco puede quedar espejo: un press huérfano no debe encontrar un snapshot
      // fantasma con el que "mover" un reloj que ya no existe (y la cola se descarta con él).
      clearCardioLiveSnapshot()
      clearCardioNotifications()
      return
    }
    publishCardioSnapshot(current)
    pushCardioLive(current)
    if (current.paused) {
      // En pausa no hay instante de fin que programar; la ficha estática ya quedó pintada arriba.
      void cancelCardioEndNotification()
      return
    }
    // Permiso LAZY (el mismo flujo cacheado del descanso): se pide en el PRIMER arranque real, no por
    // el hecho de abrir la pantalla de cardio. Si se concede después, reafirma con el estado de ese
    // instante (el ref siempre trae los segundos frescos).
    if (!permAskedRef.current) {
      permAskedRef.current = true
      void ensureCardioNotifPermission().then((granted) => {
        if (!granted || !mountedRef.current) return
        const fresh = specRef.current
        if (!fresh?.paused && fresh?.endNotifSeconds != null && fresh.endNotifSeconds > 0) {
          void scheduleCardioEndNotification(fresh.endNotifSeconds)
        }
      })
    }
    if (current.endNotifSeconds != null && current.endNotifSeconds > 0) {
      void scheduleCardioEndNotification(current.endNotifSeconds)
    } else {
      void cancelCardioEndNotification()
    }
  }, [key])

  // Recta final en foreground: el cue lo da la pantalla, la programada sobra. Si el alumno vuelve a
  // segundo plano en esos segundos, el handler de `AppState` la re-arma con el resto exacto.
  useEffect(() => {
    if (nearEnd) void cancelCardioEndNotification()
  }, [nearEnd])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        // PRIMERO los comandos que llegaron desde los botones mientras el JS dormía: si el alumno
        // pausó o saltó de fase, adoptar eso antes de tocar las notificaciones evita re-armar una
        // alerta de un reloj que ya no corre.
        applyRemoteCommands()
        // Volvimos delante: nada programado debe sonar y se barren las entregadas mientras la
        // pantalla estuvo apagada.
        void cancelCardioEndNotification()
        void dismissCardioEndNotification()
        return
      }
      // Saliendo de foreground: el JS sigue vivo EN ESTE INSTANTE, así que el spec está fresco.
      // Reafirmar el contador vivo (y el espejo del puente) corrige cualquier deriva y garantiza el
      // aviso final.
      const current = specRef.current
      if (!current) return
      publishCardioSnapshot(current)
      pushCardioLive(current)
      if (!current.paused && current.endNotifSeconds != null && current.endNotifSeconds > 0) {
        void scheduleCardioEndNotification(current.endNotifSeconds)
      }
    })
    return () => sub.remove()
  }, [applyRemoteCommands])

  // Desmontar (cambiar de ejercicio, cerrar el ejecutor): sin pantalla no hay cardio que espejar ni
  // comandos que aplicar.
  useEffect(
    () => () => {
      clearCardioLiveSnapshot()
      clearCardioNotifications()
    },
    [],
  )
}
