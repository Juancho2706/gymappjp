import { describe, expect, it } from 'vitest'
import { hasEffectiveAccess, resolveCoachSubscriptionRedirect } from '@/lib/coach-subscription-gate'

/** ISO futuro: `trialing` / `canceled` solo tienen acceso si `current_period_end` > ahora */
const periodEndFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

describe('resolveCoachSubscriptionRedirect', () => {
    it('sends blocked coaches to reactivate', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/dashboard', 'pending_payment')).toBe('/coach/reactivate')
        expect(resolveCoachSubscriptionRedirect('/coach/clients', 'expired')).toBe('/coach/reactivate')
    })

    it('allows blocked coaches on gate pages', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/reactivate', 'pending_payment')).toBeNull()
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/processing', 'pending_payment')).toBeNull()
    })

    it('sends active coaches away from reactivate (la pantalla del bloqueo)', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/reactivate', 'active')).toBe('/coach/dashboard')
    })

    // A1 (ola checkout 25-08): /coach/subscription/processing es TRANSACCIONAL, no es la pantalla del
    // bloqueo. Desde A1 el alta con tier pago nace free+active y el registro la manda derecho ahí a
    // arrancar su checkout; rebotarla al dashboard mataba el checkout antes de empezar. La vuelta de
    // MercadoPago (back_url) también aterriza ahí, con el coach todavía free+active.
    it('deja a un coach CON acceso entrar a /coach/subscription/processing', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/processing', 'active')).toBeNull()
        expect(
            resolveCoachSubscriptionRedirect('/coach/subscription/processing', 'trialing', periodEndFuture)
        ).toBeNull()
    })

    it('un coach BLOQUEADO sigue pudiendo entrar a las dos pantallas del gate', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/reactivate', 'expired')).toBeNull()
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/processing', 'expired')).toBeNull()
    })

    // Incidente 2026-09-01: la vuelta de Flow (urlReturn → /flow/retorno → flow-processing) de una coach
    // EXPIRADA reactivando por Flow rebotaba a /coach/reactivate?reason=subscription_blocked y la Fase 2
    // (confirm-enrollment) nunca corría: tarjeta enrolada en Flow, suscripción jamás creada, loop
    // infinito de checkout. flow-processing es tan transaccional como processing (MP) y debe pasar
    // el gate para cualquier estado bloqueado (pending_payment / expired).
    it('deja pasar la vuelta de Flow (/coach/subscription/flow-processing) a un coach BLOQUEADO', () => {
        expect(
            resolveCoachSubscriptionRedirect('/coach/subscription/flow-processing?tier=pro&cycle=monthly', 'pending_payment')
        ).toBeNull()
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/flow-processing', 'expired')).toBeNull()
    })

    it('deja a un coach CON acceso entrar a /coach/subscription/flow-processing (alta free→pago por Flow)', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/flow-processing', 'active')).toBeNull()
    })

    // Callejón del dunning (pricing 05-09): /coach/subscription/update-card es la ÚNICA salida barata
    // de un cobro rechazado — `changeCardForCoach` permite el swap en paused/past_due a propósito
    // (change-card.service.ts:63) y MP sigue reintentando sobre el MISMO preapproval. La pantalla
    // vivía detrás del gate: el coach en 'paused' con `current_period_end` null —el caso NORMAL, el
    // webhook de preapproval lo nulea (subscription-state.ts:32 vía webhook-pipeline.ts:1098)— salía
    // rebotado a /coach/reactivate, que solo ofrece checkout NUEVO o bajar a Free.
    it('deja entrar a /coach/subscription/update-card a un coach en dunning YA bloqueado', () => {
        // paused sin período (lo que escribe el webhook): bloqueado en todo el resto del panel…
        expect(resolveCoachSubscriptionRedirect('/coach/dashboard', 'paused', null)).toBe('/coach/reactivate')
        expect(resolveCoachSubscriptionRedirect('/coach/subscription', 'paused', null)).toBe('/coach/reactivate')
        // …pero la pantalla del cambio de tarjeta pasa.
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/update-card', 'paused', null)).toBeNull()
        // past_due con el período YA vencido (MP todavía reintenta): mismo trato.
        const periodEndPast = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/update-card', 'past_due', periodEndPast)).toBeNull()
    })

    it('update-card también pasa para el resto de los estados bloqueados (el POST los filtra)', () => {
        // La página es inerte: el gate de dinero real vive en `changeCardForCoach`
        // (TERMINAL_STATUSES → PREAPPROVAL_TERMINAL; sin subscription_mp_id → NO_ACTIVE_SUBSCRIPTION),
        // que devuelve al coach a /coach/reactivate con un mensaje, no un rebote mudo del proxy.
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/update-card', 'expired')).toBeNull()
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/update-card', 'pending_payment')).toBeNull()
    })

    it('un coach CON acceso entra a update-card sin ser echado al dashboard', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/subscription/update-card', 'active')).toBeNull()
        expect(
            resolveCoachSubscriptionRedirect('/coach/subscription/update-card', 'paused', periodEndFuture)
        ).toBeNull()
    })

    it('does not redirect active coaches on normal pages', () => {
        expect(resolveCoachSubscriptionRedirect('/coach/dashboard', 'active')).toBeNull()
        expect(resolveCoachSubscriptionRedirect('/coach/clients', 'trialing', periodEndFuture)).toBeNull()
    })

    it('blocks an over-capacity Free standalone workspace', () => {
        const context = {
            subscriptionTier: 'free',
            activeStandaloneClientCount: 4,
            workspaceType: 'coach_standalone',
        }
        expect(resolveCoachSubscriptionRedirect('/coach/dashboard', 'active', null, Date.now(), context)).toBe(
            '/coach/reactivate',
        )
        expect(resolveCoachSubscriptionRedirect('/coach/reactivate', 'active', null, Date.now(), context)).toBeNull()
    })

    it('does not count Team capacity against standalone Free', () => {
        expect(
            resolveCoachSubscriptionRedirect('/coach/dashboard', 'active', null, Date.now(), {
                subscriptionTier: 'free',
                activeStandaloneClientCount: 4,
                workspaceType: 'coach_team',
            }),
        ).toBeNull()
    })

    // Pricing v2 (P2, wave B): el cupo free se mide contra el límite EFECTIVO del coach
    // (freeClientLimit = columna max_clients / helper con created_at). Un free VIEJO con sus 3 de
    // siempre NO puede quedar expulsado por el catálogo nuevo (free 2).
    describe('freeClientLimit (grandfather pricing v2)', () => {
        it('free viejo (límite efectivo 3) con 3 activos: NO bloquea', () => {
            expect(
                resolveCoachSubscriptionRedirect('/coach/dashboard', 'active', null, Date.now(), {
                    subscriptionTier: 'free',
                    activeStandaloneClientCount: 3,
                    workspaceType: 'coach_standalone',
                    freeClientLimit: 3,
                }),
            ).toBeNull()
        })

        it('free viejo (límite efectivo 3) con 4 activos: bloquea', () => {
            expect(
                resolveCoachSubscriptionRedirect('/coach/dashboard', 'active', null, Date.now(), {
                    subscriptionTier: 'free',
                    activeStandaloneClientCount: 4,
                    workspaceType: 'coach_standalone',
                    freeClientLimit: 3,
                }),
            ).toBe('/coach/reactivate')
        })

        it('sin freeClientLimit cae al catálogo de venta (free 2): 3 activos bloquean', () => {
            expect(
                resolveCoachSubscriptionRedirect('/coach/dashboard', 'active', null, Date.now(), {
                    subscriptionTier: 'free',
                    activeStandaloneClientCount: 3,
                    workspaceType: 'coach_standalone',
                }),
            ).toBe('/coach/reactivate')
        })
    })
})

// P0-3a: dunning involuntario (paused/past_due) conserva acceso hasta current_period_end (gracia,
// como el cancel voluntario). pending_payment/expired siguen siendo bloqueo duro sin gracia.
const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

describe('hasEffectiveAccess — gracia de dunning (P0-3a)', () => {
    it('paused con período vigente → acceso (gracia)', () => {
        expect(hasEffectiveAccess('paused', future)).toBe(true)
    })
    it('past_due con período vigente → acceso (gracia)', () => {
        expect(hasEffectiveAccess('past_due', future)).toBe(true)
    })
    it('paused con período vencido → bloqueado', () => {
        expect(hasEffectiveAccess('paused', past)).toBe(false)
    })
    it('paused sin período → bloqueado', () => {
        expect(hasEffectiveAccess('paused', null)).toBe(false)
    })
    it('expired SIEMPRE bloqueado (sin gracia, aún con período futuro)', () => {
        expect(hasEffectiveAccess('expired', future)).toBe(false)
    })
    it('pending_payment SIEMPRE bloqueado', () => {
        expect(hasEffectiveAccess('pending_payment', future)).toBe(false)
    })
    it('canceled con período vigente → acceso (sin regresión)', () => {
        expect(hasEffectiveAccess('canceled', future)).toBe(true)
    })
    it('active → acceso', () => {
        expect(hasEffectiveAccess('active', null)).toBe(true)
    })
    it('managed (org_managed) → acceso', () => {
        expect(hasEffectiveAccess('org_managed', null)).toBe(true)
    })
})
