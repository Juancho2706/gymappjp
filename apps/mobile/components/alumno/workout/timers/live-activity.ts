/**
 * PUENTE JS del cronómetro VIVO de iOS — Live Activity en el lockscreen + Dynamic Island (Ola 7A).
 *
 * Es el gemelo exacto de `live-timer-notification.ts` (Android): mismo rol, misma disciplina de
 * seguridad, distinta tecnología. Allá el contador lo dibuja Android con el `chronometer` de
 * notify-kit; acá lo dibuja iOS con `Text(timerInterval:)` dentro de una Widget Extension. En AMBOS
 * casos el conteo lo hace el SISTEMA a partir de un instante ABSOLUTO, así que sigue corriendo con la
 * pantalla apagada y el JS congelado. Ese es el punto de toda la ola.
 *
 * ── POR QUÉ UN MÓDULO NATIVO PROPIO ────────────────────────────────────────────
 * `expo-live-activity` fue DEPRECADA (jun-2026) y no hay reemplazo mantenido. ActivityKit exige
 * además una Widget Extension como target adicional del proyecto iOS, que ninguna librería de RN
 * puede aportar por sí sola. Por eso la Ola 7A trae dos piezas nativas propias:
 *   · `apps/mobile/modules/eva-live-activity/`        → módulo Expo local (start/update/end/drain).
 *   · `apps/mobile/targets/eva-timer-activity/`       → la extensión que dibuja la actividad y los
 *                                                        App Intents de los botones.
 *
 * ── NO-OP SEGURO (patrón exacto de `live-timer-notification.ts`) ───────────────
 * `require` GUARDADO + `Platform.OS === 'ios'` + `isSupported()`. Sin binario nuevo, en Android, en
 * iOS < 16.2 o con las Live Activities apagadas en Ajustes, TODO acá es NO-OP y nada lanza. Android no
 * cambia de comportamiento en absolutamente nada: sus wrappers siguen llamando a Notifee igual que
 * antes y este módulo ni siquiera se toca.
 *
 * ── QUÉ **NO** HACE ESTE ARCHIVO ──────────────────────────────────────────────
 * No conoce los copys del descanso ni de cardio (los resuelven sus wrappers y se los pasan ya
 * armados), y no toca las colas de comandos: eso vive en `live-activity-commands.ts`, separado a
 * propósito para no crear un ciclo de imports (`rest-live-notification` → este archivo →
 * `rest-remote-commands` → `rest-live-notification`).
 *
 * ⚠️ REQUIERE UN BUILD EAS NUEVO: el módulo y la extensión son código nativo, no viajan por OTA.
 */
import { Platform } from 'react-native'

/** Los dos cronómetros largos del ejecutor. Espeja el `kind` de `EvaTimerAttributes` en Swift. */
export type LiveActivityKind = 'rest' | 'cardio'

/** Copys ya resueltos por el wrapper dueño de la identidad (descanso o cardio). */
export interface LiveActivityView {
  title: string
  subtitle?: string
  /** Acento de marca en hex; el Swift cae al azul EVA si no es válido. */
  accentHex?: string
  /** Fase/serie en curso ("Serie 2 de 4"). */
  stageText?: string
}

/** Comando que un botón de la Live Activity dejó en el App Group mientras la app no corría. */
export interface LiveActivityCommand {
  /** Mismo id de acción que Android: `rest-pause`, `cardio-resume`, … */
  id: string
  /** `Date.now()` del PRESS (no del drenaje): es la verdad temporal del comando. */
  atMs: number
}

interface EvaLiveActivityNativeModule {
  isSupported: () => boolean
  start: (kind: string, params: Record<string, unknown>) => string | null
  update: (kind: string, params: Record<string, unknown>) => void
  end: (kind: string) => void
  drainCommands: () => string
}

// require GUARDADO: sin el módulo nativo enlazado (todos los binarios anteriores al EAS #3) queda
// `null` y cada función de acá es un NO-OP. Se pide por `expo`, que reexporta
// `requireOptionalNativeModule` de `expo-modules-core` — pedirlo directo a `expo-modules-core` NO
// resuelve desde `apps/mobile` en este monorepo pnpm (no es dependencia directa del paquete).
let nativeModule: EvaLiveActivityNativeModule | null = null
if (Platform.OS === 'ios') {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const expo = require('expo') as {
      requireOptionalNativeModule?: <T>(name: string) => T | null
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
    nativeModule = expo.requireOptionalNativeModule?.<EvaLiveActivityNativeModule>('EvaLiveActivity') ?? null
  } catch {
    nativeModule = null
  }
}

// `isSupported()` cruza el puente nativo y su respuesta no cambia durante la sesión (depende de la
// versión de iOS y del switch de Ajustes), así que se resuelve UNA vez y se cachea.
let supported: boolean | null = null

/**
 * `true` sólo si hay módulo nativo enlazado, la plataforma es iOS y el sistema acepta Live
 * Activities (iOS 16.2+ y el permiso encendido). Nunca lanza.
 */
export function laIsSupported(): boolean {
  if (Platform.OS !== 'ios' || !nativeModule) return false
  if (supported === null) {
    try {
      supported = nativeModule.isSupported() === true
    } catch {
      supported = false
    }
  }
  return supported
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const mm = Math.floor(safe / 60)
  const ss = safe % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

interface LiveActivityParams extends Record<string, unknown> {
  title: string
  subtitle?: string
  accentHex?: string
  stageText?: string
  endEpochMs?: number
  startEpochMs?: number
  paused: boolean
  pausedSecondsText?: string
  countsUp: boolean
}

function buildParams(
  view: LiveActivityView,
  extra: Partial<LiveActivityParams>,
): LiveActivityParams {
  return {
    title: view.title,
    subtitle: view.subtitle,
    accentHex: view.accentHex,
    stageText: view.stageText,
    paused: false,
    countsUp: false,
    ...extra,
  }
}

/**
 * Publica o actualiza la actividad de un `kind`. El módulo nativo mantiene UNA por kind (descanso y
 * cardio pueden coexistir) y trata un `start` sobre un kind vivo como `update`, así que acá no hace
 * falta llevar registro de nada: es el mismo contrato que reusar el id de notificación en Android.
 */
function show(kind: LiveActivityKind, params: LiveActivityParams): void {
  if (!laIsSupported() || !nativeModule) return
  try {
    nativeModule.start(kind, params)
  } catch {
    // Una falla de la Live Activity jamás puede romper el cronómetro in-app.
  }
}

/** Retira la actividad de un `kind`. NO-OP si no aplica. Nunca lanza. */
function stop(kind: LiveActivityKind): void {
  if (!laIsSupported() || !nativeModule) return
  try {
    nativeModule.end(kind)
  } catch {
    // no-op
  }
}

// ── Descanso ──────────────────────────────────────────────────────────────────

/** Cuenta REGRESIVA del descanso hasta `endEpochMs` (`Date.now()` del fin absoluto). */
export function laShowRest(endEpochMs: number, view: LiveActivityView): void {
  if (!Number.isFinite(endEpochMs)) return
  show('rest', buildParams(view, { endEpochMs }))
}

/**
 * Estado EN PAUSA del descanso. Igual que en Android, el contador no se congela: se manda el texto
 * ya formateado y la extensión lo dibuja estático bajo el rótulo "En pausa".
 */
export function laShowRestPaused(remainingSeconds: number, view: LiveActivityView): void {
  show('rest', buildParams(view, { paused: true, pausedSecondsText: formatClock(remainingSeconds) }))
}

/** Cierra la Live Activity del descanso (saltar/terminar/desmontar). */
export function laStopRest(): void {
  stop('rest')
}

// ── Cardio ────────────────────────────────────────────────────────────────────

/**
 * Contador vivo de cardio. `direction: 'down'` usa `endEpochMs` (countdown por duración e intervalos
 * por tiempo) y `'up'` usa `startEpochMs` (cronómetro por distancia). El flag ascendente se persiste
 * del lado nativo porque el intent de "Reanudar" no puede deducirlo de un estado en pausa.
 */
export function laShowCardio(opts: {
  direction: 'down' | 'up'
  endEpochMs?: number
  startEpochMs?: number
  view: LiveActivityView
}): void {
  if (opts.direction === 'down') {
    if (!Number.isFinite(opts.endEpochMs)) return
    show('cardio', buildParams(opts.view, { endEpochMs: opts.endEpochMs }))
    return
  }
  if (!Number.isFinite(opts.startEpochMs)) return
  show('cardio', buildParams(opts.view, { startEpochMs: opts.startEpochMs, countsUp: true }))
}

/** Estado EN PAUSA de cardio: restantes (countdown/intervalos) o transcurridos (cronómetro). */
export function laShowCardioPaused(opts: {
  seconds: number
  countsUp: boolean
  view: LiveActivityView
}): void {
  show(
    'cardio',
    buildParams(opts.view, {
      paused: true,
      pausedSecondsText: formatClock(opts.seconds),
      countsUp: opts.countsUp,
    }),
  )
}

/** Cierra la Live Activity de cardio. */
export function laStopCardio(): void {
  stop('cardio')
}

// ── Buzón de comandos ─────────────────────────────────────────────────────────

/**
 * Vacía el buzón del App Group donde los App Intents dejaron los botones que el alumno tocó con la
 * app cerrada, y devuelve los comandos parseados. Devuelve `[]` ante cualquier problema (módulo
 * ausente, JSON corrupto): un buzón ilegible nunca puede tumbar el arranque de la app.
 *
 * Quien los APLICA es `live-activity-commands.ts`; acá sólo se leen.
 */
export function laDrainCommands(): LiveActivityCommand[] {
  if (!laIsSupported() || !nativeModule) return []
  let raw: string
  try {
    raw = nativeModule.drainCommands()
  } catch {
    return []
  }
  if (!raw || raw === '[]') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const { id, atMs } = entry as { id?: unknown; atMs?: unknown }
      if (typeof id !== 'string' || !id) return []
      return [{ id, atMs: typeof atMs === 'number' && Number.isFinite(atMs) ? atMs : Date.now() }]
    })
  } catch {
    return []
  }
}

/** Sólo para tests: olvida el `isSupported()` cacheado. */
export function __resetLiveActivitySupportCache(): void {
  supported = null
}
