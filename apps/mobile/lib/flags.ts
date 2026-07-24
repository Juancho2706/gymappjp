/**
 * Flags locales de pantallas/features incompletas. Tipados, con default
 * fail-safe y soporte OPCIONAL de override remoto vía `/api/mobile/config`.
 */

/** Flags conocidos y su default local. Única fuente de verdad de las keys. */
export const FLAGS = {
  // Los flags `executorV2` y `executorV3` se eliminaron (decisión CEO 2026-07-23): el ejecutor V3
  // es el único camino, así que dejaron de tener consumidor. La pantalla monta ExecutorV3 directo.

  /**
   * Nutrición V2 jamás se habilita por el bundle. Solo Edge Config puede abrir
   * una superficie y un scope canary después de que el servidor lo autorice.
   */
  nutritionV2Student: false,
  nutritionV2Coach: false,
} as const

export type FlagKey = keyof typeof FLAGS
export type RemoteFlags = Partial<Record<FlagKey, boolean>>

let remoteFlags: RemoteFlags = {}

export function setRemoteFlags(remote: RemoteFlags | null | undefined): void {
  remoteFlags = remote ?? {}
}

export function clearRemoteFlags(): void {
  remoteFlags = {}
}

export function isEnabled(flag: FlagKey): boolean {
  const remoteValue = remoteFlags[flag]
  if (typeof remoteValue === 'boolean') return remoteValue
  return FLAGS[flag]
}
