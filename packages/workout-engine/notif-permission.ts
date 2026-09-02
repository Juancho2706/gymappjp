/**
 * Permiso de notificaciones del descanso → copy y acción de la fila de ajustes del ejecutor V3
 * (hallazgo D, 2026-09-02: en Android el cronómetro no aparecía en el panel de notificaciones).
 *
 * CAUSA que cubre este módulo: el único punto que pedía/recuperaba el permiso vivía en superficies
 * que el ejecutor V3 ya no monta — el panel web `WorkoutTimerSettingsPanel` (su disparador está en el
 * header legacy, oculto en V3) y el sheet RN `WorkoutSettingsSheet` (sin montaje en V3). Si el alumno
 * nunca concedió POST_NOTIFICATIONS (Android 13+) o lo negó, no se publica nada y nadie se lo vuelve
 * a pedir. La fila que describe este mapa es la vía de recuperación en ambas plataformas.
 *
 * Es PURO a propósito (cero imports): el estado real lo leen `expo-notifications` en RN y
 * `Notification.permission` en web, y esta función sólo traduce ese estado a lo que se pinta y a lo
 * que hace un toque. Así RN y web comparten la máquina de estados y los tests corren sin mocks
 * nativos (los tests de `tests/mobile/**` no pueden importar módulos nativos de RN).
 */

/**
 * Estado del permiso, ya normalizado por cada plataforma.
 * - `granted`: concedido.
 * - `default`: aún no decidido, o negado pero el sistema todavía deja re-preguntar (`canAskAgain`).
 * - `denied`: bloqueo duro — sólo se recupera desde los ajustes del sistema/navegador.
 * - `unsupported`: el dispositivo/navegador no expone notificaciones.
 */
export type NotifPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

/**
 * Superficie que pinta la fila. Android e iOS van SEPARADOS a propósito: lo que la notificación
 * entrega en cada uno es distinto y el copy tiene que decir la verdad.
 * - `android`: el cronómetro VIVO de la bandeja/lockscreen (`live-timer-notification.ts`,
 *   `android.showChronometer` de Notifee) + la alerta final. «No molestar» puede ocultarlo.
 * - `ios`: NO hay cronómetro en la bandeja (el de la pantalla bloqueada lo da la Live Activity,
 *   fuera del stack de notificaciones): lo que este permiso habilita es la ALERTA del fin del
 *   descanso. Sin mención a DND ni a Android.
 * - `web`: web/PWA, sólo la alerta final de `RestTimer` vía service worker.
 */
export type NotifPermissionSurface = 'android' | 'ios' | 'web'

/**
 * Qué hace un toque en la fila.
 * - `request`: pedir el permiso al sistema (prompt).
 * - `open-settings`: abrir los ajustes de la app (sólo RN: la web no puede abrirlos por código).
 * - `none`: nada — ya está concedido, o no hay recuperación posible desde la app.
 */
export type NotifPermissionAction = 'none' | 'request' | 'open-settings'

export interface NotifPermissionRow {
  /** `false` ⇒ no pintar la fila (notificaciones no soportadas: prometer algo sería mentir). */
  visible: boolean
  /** Nombre de la fila. */
  label: string
  /** Subtítulo: estado actual en palabras + qué hacer. */
  status: string
  /** Interruptor encendido. */
  on: boolean
  /** El control acepta toque. */
  interactive: boolean
  /** Acción del toque. */
  action: NotifPermissionAction
  /** Bloqueo duro: la fila se pinta en estado de advertencia. */
  blocked: boolean
}

const LABEL: Record<NotifPermissionSurface, string> = {
  // Android: lo que el alumno ve es el cronómetro vivo (`showChronometer`) en la pantalla bloqueada.
  android: 'Temporizador en la pantalla bloqueada',
  // iOS: el temporizador de la pantalla bloqueada lo da la Live Activity, no este permiso —
  // prometerlo acá sería mentir. Lo que este permiso habilita es el aviso del fin del descanso.
  ios: 'Avisarme al terminar el descanso',
  // Web/PWA: no existe cronómetro vivo (no hay API), sólo la alerta final de `RestTimer`.
  web: 'Avisarme al terminar el descanso',
}

const STATUS: Record<NotifPermissionSurface, Record<NotifPermissionState, string>> = {
  android: {
    // Se nombra «No molestar» porque es la causa nº 1 de que el cronómetro no aparezca aun con
    // permiso: DND puede ocultar la notificación del panel Y de la pantalla bloqueada, y la app no
    // tiene forma de saltárselo (ni debe: sería pasar por encima de una decisión del usuario).
    granted: 'Activado. Con «No molestar» encendido Android puede ocultarlo.',
    // Copy sin verbo de permiso en la CTA (regla de review 5.1.1(iv), ver apps/mobile/AGENTS.md).
    default: 'Sin permiso. Toca el interruptor para continuar.',
    denied: 'Bloqueado en los ajustes del sistema. Ábrelos para permitirlo.',
    unsupported: '',
  },
  ios: {
    // Sin «No molestar» ni Android: en iOS el Modo Concentración silencia el aviso, pero el
    // temporizador de la pantalla bloqueada (Live Activity) sigue vivo — mezclarlo confunde.
    granted: 'Activado. Te avisamos aunque salgas de la app.',
    // Copy sin verbo de permiso en la CTA (regla de review 5.1.1(iv), ver apps/mobile/AGENTS.md).
    default: 'Sin permiso. Toca el interruptor para continuar.',
    denied: 'Bloqueado en los ajustes del sistema. Ábrelos para permitirlo.',
    unsupported: '',
  },
  web: {
    granted: 'Activado. Te avisamos aunque cambies de pestaña.',
    default: 'Sin permiso. Toca para que el navegador te lo pregunte.',
    // La web no puede abrir los ajustes del sitio por código: sólo cabe explicar dónde están.
    denied: 'Bloqueado en el navegador. Actívalo en los ajustes del sitio.',
    unsupported: '',
  },
}

/** Traduce el estado del permiso a la fila de ajustes (copy + acción) de la superficie dada. */
export function describeNotifPermission(
  state: NotifPermissionState,
  surface: NotifPermissionSurface,
): NotifPermissionRow {
  const label = LABEL[surface]
  const status = STATUS[surface][state]

  if (state === 'unsupported') {
    return { visible: false, label, status, on: false, interactive: false, action: 'none', blocked: false }
  }
  if (state === 'granted') {
    // Concedido: el interruptor queda encendido y sin acción — revocar sólo se puede desde el SO.
    return { visible: true, label, status, on: true, interactive: false, action: 'none', blocked: false }
  }
  if (state === 'denied') {
    // La web no puede abrir los ajustes del sitio por código; las dos nativas sí (`Linking`).
    const canRecover = surface !== 'web'
    return {
      visible: true,
      label,
      status,
      on: false,
      interactive: canRecover,
      action: canRecover ? 'open-settings' : 'none',
      blocked: true,
    }
  }
  return { visible: true, label, status, on: false, interactive: true, action: 'request', blocked: false }
}
