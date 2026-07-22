import 'server-only'

import { cache } from 'react'

/**
 * Ejecutor V3 (E2.1) — flag de rollout leído desde Edge Config `eva-config`, mismo mecanismo
 * que el flip de nutrición V2 (`readNutritionV2RolloutConfig`): env `EDGE_CONFIG` ausente,
 * error de Edge Config o payload malformado ⇒ SIEMPRE OFF (fail-safe).
 *
 * Formas aceptadas para la key `executor_v3` (equivalentes a "mode=on"):
 *   - boolean `true`
 *   - `{ enabled: true }`
 *   - `{ mode: 'on' }`
 * Cualquier otra cosa (incluida la ausencia de la key) resuelve OFF.
 *
 * El override de dev/QA por `localStorage` (`eva:executor-v3`) NO vive aquí: es client-side y
 * lo resuelve el ejecutor tras montar (hidratación-safe), pisando este default.
 */
const EDGE_CONFIG_KEY = 'executor_v3'

function parseExecutorV3(raw: unknown): boolean {
    if (raw === true) return true
    if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>
        if (obj.enabled === true) return true
        if (obj.mode === 'on') return true
    }
    return false
}

// Memoizada por request (React.cache): el ejecutor sólo lo lee una vez por render, pero
// mantenemos el patrón de nutrición por consistencia y por si otra superficie lo consulta.
// server-only garantiza cache por request de servidor, jamás compartido entre usuarios.
export const isExecutorV3Enabled = cache(async (): Promise<boolean> => {
    if (!process.env.EDGE_CONFIG) return false

    try {
        const { get } = await import('@vercel/edge-config')
        const raw = await get<unknown>(EDGE_CONFIG_KEY)
        return parseExecutorV3(raw)
    } catch {
        return false
    }
})
