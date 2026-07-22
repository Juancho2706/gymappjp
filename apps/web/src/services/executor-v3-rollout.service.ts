import 'server-only'

import { cache } from 'react'

/**
 * Ejecutor V3 (E2.1) — flag de rollout leído desde Edge Config `eva-config`, mismo mecanismo
 * que el flip de nutrición V2 pero con la polaridad invertida (decisión CEO 2026-07-22):
 * el V3 va ENCENDIDO por default en esta rama; Edge Config es el KILL-SWITCH, no el encendido.
 *
 * Formas que APAGAN la key `executor_v3` (equivalentes a "mode=off"):
 *   - boolean `false`
 *   - `{ enabled: false }`
 *   - `{ mode: 'off' }`
 * Ausencia de la key, env sin EDGE_CONFIG o error de lectura ⇒ ON (el rollback en prod es
 * setear `executor_v3: false` en eva-config — instantáneo, sin build).
 *
 * El override de dev/QA por `localStorage` (`eva:executor-v3`) NO vive aquí: es client-side y
 * lo resuelve el ejecutor tras montar (hidratación-safe), pisando este default.
 */
const EDGE_CONFIG_KEY = 'executor_v3'

function parseExecutorV3Off(raw: unknown): boolean {
    if (raw === false) return true
    if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>
        if (obj.enabled === false) return true
        if (obj.mode === 'off') return true
    }
    return false
}

// Memoizada por request (React.cache): el ejecutor sólo lo lee una vez por render, pero
// mantenemos el patrón de nutrición por consistencia y por si otra superficie lo consulta.
// server-only garantiza cache por request de servidor, jamás compartido entre usuarios.
export const isExecutorV3Enabled = cache(async (): Promise<boolean> => {
    if (!process.env.EDGE_CONFIG) return true

    try {
        const { get } = await import('@vercel/edge-config')
        const raw = await get<unknown>(EDGE_CONFIG_KEY)
        return !parseExecutorV3Off(raw)
    } catch {
        return true
    }
})
