import type { ClientActionWorkspace } from './client-actions'

export type ProfileAnalyticsLoadMode = 'rpc' | 'fallback' | 'error'

/** Decision pura: nunca confunde error critico con analytics genuinamente vacia. */
export function resolveProfileAnalyticsLoadMode(
  workspaceKind: ClientActionWorkspace['kind'] | undefined,
  hasCriticalError: boolean,
  aggregateRowCounts: readonly number[],
): ProfileAnalyticsLoadMode {
  if (workspaceKind === 'enterprise') {
    return hasCriticalError || aggregateRowCounts.every((count) => count === 0) ? 'fallback' : 'rpc'
  }
  return hasCriticalError ? 'error' : 'rpc'
}
