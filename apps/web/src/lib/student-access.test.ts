import { describe, expect, it } from 'vitest'
import {
    resolveStudentAccessState,
    resolveStudentGraceEndsAt,
    STUDENT_ACCESS_GRACE_DAYS,
    type CoachAccessColumns,
} from '@/lib/student-access'
import {
    resolveStudentAccessForCoach,
    resolveStudentAccessForClient,
} from '@/lib/student-access.server'

const NOW = Date.parse('2026-07-18T12:00:00.000Z')
const DAY = 86_400_000
const daysFromNow = (n: number) => new Date(NOW + n * DAY).toISOString()

function coach(partial: Partial<CoachAccessColumns>): CoachAccessColumns {
    return {
        subscription_status: null,
        current_period_end: null,
        paid_access_ended_at: null,
        ...partial,
    }
}

describe('resolveStudentAccessState (pura)', () => {
    it('coach activo → ok', () => {
        const r = resolveStudentAccessState(coach({ subscription_status: 'active' }), NOW)
        expect(r).toEqual({ state: 'ok', graceEndsAt: null })
    })

    it('coach free vigente (status active, sin period_end) → ok', () => {
        // Free es un plan válido: hasEffectiveAccess('active', null) = true → alumno normal.
        const r = resolveStudentAccessState(coach({ subscription_status: 'active', current_period_end: null }), NOW)
        expect(r.state).toBe('ok')
    })

    it('coach org_managed → ok', () => {
        expect(resolveStudentAccessState(coach({ subscription_status: 'org_managed' }), NOW).state).toBe('ok')
    })

    it('coach team_managed → ok', () => {
        expect(resolveStudentAccessState(coach({ subscription_status: 'team_managed' }), NOW).state).toBe('ok')
    })

    it('coach canceled con período vigente (gracia propia del coach) → ok', () => {
        const r = resolveStudentAccessState(
            coach({ subscription_status: 'canceled', current_period_end: daysFromNow(5) }),
            NOW,
        )
        expect(r.state).toBe('ok')
    })

    it('coach expired dentro de la gracia (ancla current_period_end, hace 3 días) → grace', () => {
        const r = resolveStudentAccessState(
            coach({ subscription_status: 'expired', current_period_end: daysFromNow(-3) }),
            NOW,
        )
        expect(r.state).toBe('grace')
        expect(r.graceEndsAt).toBe(new Date(NOW - 3 * DAY + STUDENT_ACCESS_GRACE_DAYS * DAY).toISOString())
    })

    it('coach expired post-gracia (ancla hace 8 días) → readonly', () => {
        const r = resolveStudentAccessState(
            coach({ subscription_status: 'expired', current_period_end: daysFromNow(-8) }),
            NOW,
        )
        expect(r.state).toBe('readonly')
        expect(r.graceEndsAt).not.toBeNull()
    })

    it('period_end NULL pero CON ancla paid_access_ended_at (backfill joaquin) → grace/readonly por fecha', () => {
        // Espejo del caso joaquinamr7: current_period_end NULLeado por el flujo de expiración, pero
        // paid_access_ended_at conserva el fin del período pagado (2026-07-16). La gracia ancla ahí.
        const grace = resolveStudentAccessState(
            coach({ subscription_status: 'expired', current_period_end: null, paid_access_ended_at: daysFromNow(-2) }),
            NOW,
        )
        expect(grace.state).toBe('grace')

        const readonly = resolveStudentAccessState(
            coach({ subscription_status: 'expired', current_period_end: null, paid_access_ended_at: daysFromNow(-9) }),
            NOW,
        )
        expect(readonly.state).toBe('readonly')
    })

    it('paid_access_ended_at tiene PRIORIDAD sobre current_period_end en el ancla', () => {
        // current_period_end viejo (readonly) pero paid_access_ended_at reciente → grace por prioridad.
        const r = resolveStudentAccessState(
            coach({
                subscription_status: 'expired',
                current_period_end: daysFromNow(-30),
                paid_access_ended_at: daysFromNow(-1),
            }),
            NOW,
        )
        expect(r.state).toBe('grace')
    })

    it('period_end NULL y SIN ancla → readonly inmediato, graceEndsAt null', () => {
        const r = resolveStudentAccessState(
            coach({ subscription_status: 'expired', current_period_end: null, paid_access_ended_at: null }),
            NOW,
        )
        expect(r).toEqual({ state: 'readonly', graceEndsAt: null })
    })

    it('pending_payment (bloqueo duro) con ancla vencida → readonly', () => {
        const r = resolveStudentAccessState(
            coach({ subscription_status: 'pending_payment', paid_access_ended_at: daysFromNow(-10) }),
            NOW,
        )
        expect(r.state).toBe('readonly')
    })

    it('borde exacto: now == graceEnds → readonly (ventana estricta con <)', () => {
        const anchor = daysFromNow(-STUDENT_ACCESS_GRACE_DAYS) // graceEnds === NOW
        const r = resolveStudentAccessState(
            coach({ subscription_status: 'expired', paid_access_ended_at: anchor }),
            NOW,
        )
        expect(r.state).toBe('readonly')
    })
})

describe('resolveStudentGraceEndsAt (ancla)', () => {
    it('coalesce: prioriza paid_access_ended_at', () => {
        const end = resolveStudentGraceEndsAt(daysFromNow(0), daysFromNow(-100))
        expect(end?.toISOString()).toBe(new Date(NOW + STUDENT_ACCESS_GRACE_DAYS * DAY).toISOString())
    })
    it('sin ninguna fecha → null', () => {
        expect(resolveStudentGraceEndsAt(null, null)).toBeNull()
    })
})

// ── Resolvers server (guards) ─────────────────────────────────────────────────
// Fake PostgREST reader: from(rel).select().eq().maybeSingle() → { data, error }.
function fakeDb(rows: Record<string, unknown>) {
    return {
        from(rel: string) {
            return {
                select() {
                    return {
                        eq() {
                            return {
                                async maybeSingle() {
                                    return { data: rows[rel] ?? null, error: null }
                                },
                            }
                        },
                    }
                },
            }
        },
    } as never
}

describe('resolveStudentAccessForCoach (guard server)', () => {
    it('kill-switch apagado (gateEnabled=false) → ok siempre', async () => {
        const db = fakeDb({ coaches: { subscription_status: 'expired', current_period_end: daysFromNow(-100), paid_access_ended_at: null } })
        const r = await resolveStudentAccessForCoach(db, 'coach-1', { gateEnabled: false, now: NOW })
        expect(r.state).toBe('ok')
    })

    it('coachId ausente → ok (standalone/pool/org sin coach directo)', async () => {
        const r = await resolveStudentAccessForCoach(fakeDb({}), null, { gateEnabled: true, now: NOW })
        expect(r.state).toBe('ok')
    })

    it('fila de coach no legible (data null) → ok (fail-open)', async () => {
        const r = await resolveStudentAccessForCoach(fakeDb({ coaches: null }), 'coach-1', { gateEnabled: true, now: NOW })
        expect(r.state).toBe('ok')
    })

    it('coach expired post-gracia → readonly', async () => {
        const db = fakeDb({ coaches: { subscription_status: 'expired', current_period_end: daysFromNow(-30), paid_access_ended_at: null } })
        const r = await resolveStudentAccessForCoach(db, 'coach-1', { gateEnabled: true, now: NOW })
        expect(r.state).toBe('readonly')
    })

    it('coach expired en gracia → grace', async () => {
        const db = fakeDb({ coaches: { subscription_status: 'expired', current_period_end: null, paid_access_ended_at: daysFromNow(-1) } })
        const r = await resolveStudentAccessForCoach(db, 'coach-1', { gateEnabled: true, now: NOW })
        expect(r.state).toBe('grace')
    })
})

describe('resolveStudentAccessForClient (guard server)', () => {
    it('deriva coach_id del alumno y resuelve readonly', async () => {
        const db = fakeDb({
            clients: { coach_id: 'coach-1' },
            coaches: { subscription_status: 'expired', current_period_end: daysFromNow(-30), paid_access_ended_at: null },
        })
        const r = await resolveStudentAccessForClient(db, 'client-1', { gateEnabled: true, now: NOW })
        expect(r.state).toBe('readonly')
    })

    it('alumno sin coach_id → ok (fail-open)', async () => {
        const db = fakeDb({ clients: { coach_id: null } })
        const r = await resolveStudentAccessForClient(db, 'client-1', { gateEnabled: true, now: NOW })
        expect(r.state).toBe('ok')
    })

    it('kill-switch apagado → ok sin leer coach', async () => {
        const db = fakeDb({ clients: { coach_id: 'coach-1' }, coaches: { subscription_status: 'expired', current_period_end: daysFromNow(-100), paid_access_ended_at: null } })
        const r = await resolveStudentAccessForClient(db, 'client-1', { gateEnabled: false, now: NOW })
        expect(r.state).toBe('ok')
    })
})
