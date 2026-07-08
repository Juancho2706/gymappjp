/**
 * Flags locales de pantallas/features incompletas (E0-G4). Tipados, con
 * default fail-safe y soporte OPCIONAL de override remoto vía
 * `/api/mobile/config` (campo `flags` del payload).
 *
 * Resolución: si `setRemoteFlags` recibió la key, manda el valor remoto;
 * si no hay red, el fetch falló, o el campo no vino, manda el default
 * local declarado en FLAGS (fail-safe al default — nunca lanza, nunca
 * bloquea el arranque de la app).
 *
 * Coordinación con `apps/mobile/lib/entitlements.ts` (otra tarea de esta
 * misma ola): ese provider es quien debe llamar `setRemoteFlags(payload.flags)`
 * tras resolver `/api/mobile/config`. Este archivo NO hace fetch — solo
 * expone la interfaz de resolución. `entitlements.ts` no debe tocarse desde
 * acá.
 */

/** Flags conocidos y su default local. Única fuente de verdad de las keys. */
export const FLAGS = {
  /**
   * Ejecutor de rutina v2 (pantalla de alto riesgo, E2). Default OFF hasta
   * validar en prod; habilitable por override remoto sin release.
   */
  executorV2: false,
} as const

export type FlagKey = keyof typeof FLAGS

/** Forma esperada del campo `flags` en el payload de /api/mobile/config. */
export type RemoteFlags = Partial<Record<FlagKey, boolean>>

let remoteFlags: RemoteFlags = {}

/**
 * Registra el bloque `flags` recibido de /api/mobile/config. Llamado por el
 * provider de entitlements (apps/mobile/lib/entitlements.ts) tras un fetch
 * exitoso. Pasar `undefined`/`null`/`{}` es válido y equivale a "sin
 * override" (se usan los defaults locales).
 */
export function setRemoteFlags(remote: RemoteFlags | null | undefined): void {
  remoteFlags = remote ?? {}
}

/** Limpia el override remoto (logout, reset de sesión, tests). */
export function clearRemoteFlags(): void {
  remoteFlags = {}
}

/**
 * Resuelve un flag: remoto si vino en el último `setRemoteFlags`, si no el
 * default local. Nunca lanza — key desconocida en runtime (TS ya lo evita)
 * cae también al default local vía `FLAGS[flag]`.
 */
export function isEnabled(flag: FlagKey): boolean {
  const remoteValue = remoteFlags[flag]
  if (typeof remoteValue === 'boolean') {
    return remoteValue
  }
  return FLAGS[flag]
}
