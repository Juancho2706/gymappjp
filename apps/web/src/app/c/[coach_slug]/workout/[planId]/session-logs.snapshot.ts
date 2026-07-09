import type { ReconciledSessionLog } from './session-logs.reconcile'

/**
 * Snapshot LOCAL de las series CONFIRMADAS de la sesión (BUG 2 — "la página se cae y aparece vacía").
 *
 * Causa raíz (forense RC3/RC4, 2026-07-07): al reentrar con red mala, Next puede remontar el ejecutor
 * con `logs = []` (snapshot stale del client Router Cache, o el SW sirviendo stale-while-revalidate) y
 * `router.refresh()` puede fallar; si la cola offline ya se drenó, `reconcileSessionLogs(server=[],
 * cola=[])` daba `[]` → la alumna veía TODO VACÍO aunque la DB tenía las series íntegras.
 *
 * Fix: cada vez que `sessionLogs` cambia, persistimos las filas CONFIRMADAS (las `_pending:false`) en
 * localStorage por (plan, día calendario Santiago). Al reconciliar, esas filas se re-inyectan como
 * confirmadas SÓLO donde ni el server ni la cola aportan nada → la UI nunca colapsa a vacío por un
 * server stale. La reconciliación es MONOTÓNICA: el server fresco siempre gana sobre el snapshot.
 *
 * Best-effort (try/catch) como `session-clock.ts`: en modo privado / cuota llena degrada a "sin
 * snapshot" (el comportamiento previo al fix) sin romper la pantalla.
 *
 * GOTCHA documentado: el snapshot NO distingue una serie borrada legítimamente por el coach mid-sesión
 * de una serie que el server stale aún no reporta → una serie borrada puede persistir en la UI hasta el
 * próximo reload con red buena (que trae el server autoritativo y sobrescribe el snapshot). Caso raro;
 * se acepta a cambio de nunca perder series confirmadas por un fetch stale.
 */

const PREFIX = 'eva:workout-snapshot:'

/** Fila mínima persistida: el shape de `sessionLogs` SIN la marca volátil `_pending`. */
export type SessionSnapshotRow = Omit<ReconciledSessionLog, '_pending'>

/** Clave de localStorage del snapshot para un plan y día calendario (ISO `YYYY-MM-DD`). */
export function sessionSnapshotKey(planId: string, dayIso: string): string {
    return `${PREFIX}${planId}:${dayIso}`
}

/** Lee el snapshot persistido. `[]` ante ausencia / basura / excepción. */
export function readSessionSnapshot(planId: string, dayIso: string): SessionSnapshotRow[] {
    try {
        const raw = localStorage.getItem(sessionSnapshotKey(planId, dayIso))
        if (raw == null) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as SessionSnapshotRow[]) : []
    } catch {
        return []
    }
}

/**
 * Persiste SÓLO las filas confirmadas (filtra `_pending:true` — lo en-cola vive en la cola offline, no
 * acá) y descarta la marca `_pending` al serializar. Si no queda ninguna confirmada, borra la clave.
 * Best-effort → devuelve si se pudo escribir.
 */
export function writeSessionSnapshot(
    planId: string,
    dayIso: string,
    rows: readonly ReconciledSessionLog[],
): boolean {
    try {
        const confirmed = rows
            .filter((r) => r._pending !== true)
            .map(({ _pending: _drop, ...rest }) => rest)
        if (confirmed.length === 0) {
            localStorage.removeItem(sessionSnapshotKey(planId, dayIso))
            return true
        }
        localStorage.setItem(sessionSnapshotKey(planId, dayIso), JSON.stringify(confirmed))
        return true
    } catch {
        return false
    }
}

/** Borra el snapshot del plan/día (al finalizar la sesión). Best-effort. */
export function clearSessionSnapshot(planId: string, dayIso: string): void {
    try {
        localStorage.removeItem(sessionSnapshotKey(planId, dayIso))
    } catch {
        /* best-effort */
    }
}

/**
 * Higiene: borra los snapshots de OTROS días (sesiones abandonadas que nunca se finalizaron). Conserva
 * sólo los de `dayIso`. Mismo patrón inequívoco que `sweepOtherDaySessionStarts` (ni el UUID del plan
 * ni el ISO del día contienen `:` ni el sufijo del día → el match por sufijo es exacto). Best-effort.
 */
export function sweepOtherDaySnapshots(dayIso: string): void {
    try {
        const suffix = `:${dayIso}`
        const stale: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key == null || !key.startsWith(PREFIX)) continue
            if (!key.endsWith(suffix)) stale.push(key)
        }
        for (const key of stale) localStorage.removeItem(key)
    } catch {
        /* best-effort */
    }
}
