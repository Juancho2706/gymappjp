import { tierMaxClientsFor, type SubscriptionTier } from '@/lib/constants'

/**
 * Cupo EFECTIVO de un tier para UN coach concreto (pura, testeable, sin I/O).
 *
 * Pricing v3 (decisión owner 2026-08-21): el grandfather NO vive en una escalera de fechas, vive
 * en la COLUMNA `coaches.max_clients`. El backfill del día D bajó a 1 solo a los free con 0/1
 * alumnos y dejó intacta la fila de los que ya tenían 2+ (conservan su cupo por USO). Por eso
 * `tierMaxClientsFor(tier, created_at)` describe únicamente lo que el write-path ESCRIBIRÁ al
 * cambiar de tier — jamás lo que el coach tiene HOY.
 *
 * Regla:
 *  - tier === el tier ACTUAL del coach ⇒ manda la columna (si trae un número usable). Un coach
 *    viejo en free con columna 3 debe seguir leyendo «Free: hasta 3 alumnos», no «hasta 1».
 *  - cualquier OTRO tier ⇒ todavía no hay columna para él: se proyecta con la escalera de fecha,
 *    que es exactamente el valor que el write-path grabará si contrata ese plan.
 *
 * `coachMaxClients` no usable (null/undefined/NaN/negativo) ⇒ cae a la escalera (fail-safe: el
 * server revalida el cupo con la misma fuente antes de dejar crear a nadie).
 */
export function effectiveTierLimit({
    tier,
    currentTier,
    coachMaxClients,
    coachCreatedAt,
}: {
    tier: SubscriptionTier
    currentTier: SubscriptionTier
    coachMaxClients?: number | null
    coachCreatedAt?: string | null
}): number {
    if (
        tier === currentTier &&
        typeof coachMaxClients === 'number' &&
        Number.isFinite(coachMaxClients) &&
        coachMaxClients >= 0
    ) {
        return coachMaxClients
    }
    return tierMaxClientsFor(tier, coachCreatedAt)
}
