/**
 * Flags locales de pantallas/features incompletas. Tipados, con default
 * fail-safe y soporte OPCIONAL de override remoto vía `/api/mobile/config`.
 */

/** Flags conocidos y su default local. Única fuente de verdad de las keys. */
export const FLAGS = {
  /**
   * Ejecutor de rutina v2. ON en la rama rnmobiledenuevo para QA en device.
   * El override remoto puede apagarlo sin release.
   */
  executorV2: true,

  /**
   * Ejecutor de rutina v3 (E2.1) — shell de PRESENTACION V3 sobre el mismo motor headless que V2.
   * Default ON (decisión CEO 2026-07-22): esta rama ES la del rediseño; las builds de QA salen
   * con V3 encendido. El KILL-SWITCH sigue vivo sin release: `/api/mobile/config` puede devolver
   * `flags.executorV3: false` (lo aplica `setRemoteFlags(config.flags)` en entitlements.ts) y el
   * switch cae a executorV2 al instante. La rama, no el flag, es el aislamiento pre-merge; el flag
   * es el rollback post-build.
   */
  executorV3: true,

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
