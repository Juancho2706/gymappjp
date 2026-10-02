import { describe, expect, it } from 'vitest'
import {
    BEHAVIOR_TEMPLATE_KEYS,
    BEHAVIOR_TEMPLATE_KEY_PREFIX,
    BEHAVIOR_TEST_ACCOUNT_BYPASS,
    FIRST_ARTIFACT_NUDGE_AFTER_MS,
    FIRST_LOGIN_SIGNAL_CUTOVER,
    NO_CLIENT_AFTER_MS,
    computeBehaviorTriggers,
    evaluateBehaviorEligibility,
    isBehaviorTestBypass,
    pickBehaviorTrigger,
    type BehaviorPolicy,
    type CoachBehaviorSnapshot,
} from './behavior-triggers'

/**
 * Motor de W6 (F6.1) con los momentos del plan «Correos y activación» (01-10). Lo que se pinnea:
 *  · las SEIS reglas con sus ventanas exactas (día 1 = 20 h / día 3 sin rutina / 48 h / aha / 7 d /
 *    corte 90 d);
 *  · el día 3 solo con «armó su primera rutina» LEÍDO en `false` (nunca por `last_active_at`, que
 *    solo escribe la web y daba «no volviste» a los coaches de la app);
 *  · el dedupe por `(coach_id, template_key)`;
 *  · la exclusión de cuentas de prueba CON el bypass explícito de `qa-free-v3@evatest.cl` (W8.4.4);
 *  · «uno por corrida»;
 *  · el corte a 90 d medido contra `created_at`;
 *  · el corte de LANZAMIENTO por env, fail-closed;
 *  · el cupo compartido (24 h / 3 por semana) con el aha como única excepción, el horario de Chile
 *    (sin excepciones), la baja y el historial ilegible.
 */

/** 15:00Z del 10-12 = 12:00 en Chile (verano, UTC−3): dentro de la ventana de 09–20 h. */
const NOW = new Date('2026-12-10T15:00:00.000Z')
/** 02:00Z del 11-12 = 23:00 del 10-12 en Chile: fuera de la ventana. */
const NIGHT = new Date('2026-12-11T02:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const LAUNCH = '2026-09-06T00:00:00Z'
const POLICY: BehaviorPolicy = { launchCutover: LAUNCH }

function iso(msAgo: number, now: Date = NOW): string {
    return new Date(now.getTime() - msAgo).toISOString()
}

/** Coach base: alta hace 1 h, sin alumnos, sin nada. Ninguna ventana cumplida todavía. */
function snapshot(overrides: Partial<CoachBehaviorSnapshot> = {}): CoachBehaviorSnapshot {
    return {
        coachId: '11111111-1111-4111-8111-111111111111',
        email: 'coach@example.com',
        persona: 'strength',
        createdAt: iso(1 * HOUR),
        hasFirstArtifact: null,
        realClientCount: 0,
        anyRealClientLoggedIn: false,
        oldestPendingInviteAt: null,
        hasRealStudentActivity: false,
        alreadySent: [],
        recentAutomatedSentAts: [],
        optedOut: false,
        isTestAccount: false,
        isOrgManaged: false,
        ...overrides,
    }
}

function keys(snap: CoachBehaviorSnapshot, now: Date = NOW, policy: BehaviorPolicy = POLICY): string[] {
    const evaluation = computeBehaviorTriggers(snap, now, policy)
    return evaluation.eligible ? evaluation.triggers.map((t) => t.template_key) : []
}

describe('contrato de las keys', () => {
    it('las 5 keys llevan el prefijo `behavior_` y no colisionan con el drip viejo', () => {
        expect(BEHAVIOR_TEMPLATE_KEYS).toHaveLength(5)
        for (const key of BEHAVIOR_TEMPLATE_KEYS) {
            expect(key.startsWith(BEHAVIOR_TEMPLATE_KEY_PREFIX)).toBe(true)
        }
        const dripKeys = ['day1_value', 'day2_pro', 'day7_nutrition', 'day14_last_call']
        for (const key of BEHAVIOR_TEMPLATE_KEYS) expect(dripKeys).not.toContain(key)
    })
})

describe('señal del día 1 — cuenta creada, sin alumno real', () => {
    it('el piso es de 20 h (ya no 2 h)', () => {
        expect(NO_CLIENT_AFTER_MS).toBe(20 * HOUR)
    })

    it('a las 19 h todavía NO dispara', () => {
        expect(keys(snapshot({ createdAt: iso(19 * HOUR) }))).not.toContain('behavior_no_client_2h')
    })

    it('a las 20 h dispara', () => {
        const evaluation = computeBehaviorTriggers(snapshot({ createdAt: iso(20 * HOUR) }), NOW, POLICY)
        expect(pickBehaviorTrigger(evaluation)).toEqual({
            template_key: 'behavior_no_client_2h',
            reason: 'no_real_client_day1',
        })
    })

    it('con un alumno REAL cargado no dispara nunca', () => {
        const snap = snapshot({ createdAt: iso(30 * HOUR), realClientCount: 1 })
        expect(keys(snap)).not.toContain('behavior_no_client_2h')
    })
})

describe('señal del día 3 — todavía no armó su primera rutina', () => {
    it('el piso es de 3 días', () => {
        expect(FIRST_ARTIFACT_NUDGE_AFTER_MS).toBe(3 * DAY)
    })

    it('a los 3 días con la lectura en `false`, dispara', () => {
        const snap = snapshot({ createdAt: iso(3 * DAY), realClientCount: 1, hasFirstArtifact: false })
        const evaluation = computeBehaviorTriggers(snap, NOW, POLICY)
        expect(pickBehaviorTrigger(evaluation)).toEqual({
            template_key: 'behavior_no_return_24h',
            reason: 'no_first_artifact_day3',
        })
    })

    it('a las 71 h todavía no', () => {
        const snap = snapshot({ createdAt: iso(71 * HOUR), realClientCount: 1, hasFirstArtifact: false })
        expect(keys(snap)).not.toContain('behavior_no_return_24h')
    })

    it('si ya armó su primera rutina, no dispara', () => {
        const snap = snapshot({ createdAt: iso(4 * DAY), realClientCount: 1, hasFirstArtifact: true })
        expect(keys(snap)).not.toContain('behavior_no_return_24h')
    })

    // `null` = no se leyó o la lectura falló: decirle «todavía no armaste nada» sin saberlo es mentir.
    it('sin la lectura (`null`) no dispara', () => {
        const snap = snapshot({ createdAt: iso(4 * DAY), realClientCount: 1, hasFirstArtifact: null })
        expect(keys(snap)).not.toContain('behavior_no_return_24h')
    })
})

describe('señal +48 h — alumno invitado que no entró', () => {
    const created = iso(3 * DAY)

    it('con una invitación pendiente de 48 h dispara', () => {
        const snap = snapshot({
            createdAt: created,
            realClientCount: 1,
            oldestPendingInviteAt: iso(49 * HOUR),
        })
        expect(keys(snap)).toContain('behavior_client_not_entered_48h')
    })

    it('a las 47 h todavía no', () => {
        const snap = snapshot({
            createdAt: created,
            realClientCount: 1,
            oldestPendingInviteAt: iso(47 * HOUR),
        })
        expect(keys(snap)).not.toContain('behavior_client_not_entered_48h')
    })

    it('si algún alumno real YA entró, no dispara aunque otro siga pendiente', () => {
        const snap = snapshot({
            createdAt: created,
            realClientCount: 2,
            anyRealClientLoggedIn: true,
            oldestPendingInviteAt: iso(72 * HOUR),
        })
        expect(keys(snap)).not.toContain('behavior_client_not_entered_48h')
    })

    it('sin invitación pendiente medible (filas anteriores al corte) no dispara', () => {
        const snap = snapshot({ createdAt: created, realClientCount: 1, oldestPendingInviteAt: null })
        expect(keys(snap)).not.toContain('behavior_client_not_entered_48h')
        expect(FIRST_LOGIN_SIGNAL_CUTOVER).toBe('2026-08-26T06:00:00Z')
    })
})

describe('señal aha — actividad de un alumno real', () => {
    it('dispara sin esperar ninguna ventana', () => {
        const snap = snapshot({ createdAt: iso(10 * 60 * 1000), hasRealStudentActivity: true })
        expect(keys(snap)).toContain('behavior_aha')
    })

    it('gana a todas las demás: es lo primero de la lista', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            realClientCount: 1,
            hasRealStudentActivity: true,
            hasFirstArtifact: false,
            oldestPendingInviteAt: iso(7 * DAY),
        })
        const trigger = pickBehaviorTrigger(computeBehaviorTriggers(snap, NOW, POLICY))
        expect(trigger).toEqual({ template_key: 'behavior_aha', reason: 'real_student_activity' })
    })
})

describe('señal +7 d — sin activar, ayuda humana', () => {
    it('a los 7 d sin aha dispara', () => {
        expect(keys(snapshot({ createdAt: iso(7 * DAY), realClientCount: 1 }))).toContain('behavior_help_7d')
    })

    it('a los 6 d todavía no', () => {
        expect(keys(snapshot({ createdAt: iso(6 * DAY) }))).not.toContain('behavior_help_7d')
    })

    it('con el aha ya ocurrido no dispara', () => {
        const snap = snapshot({
            createdAt: iso(10 * DAY),
            realClientCount: 1,
            anyRealClientLoggedIn: true,
            hasRealStudentActivity: true,
        })
        expect(keys(snap)).not.toContain('behavior_help_7d')
    })
})

describe('corte a 90 d', () => {
    it('a los 89 d todavía hay onboarding', () => {
        expect(computeBehaviorTriggers(snapshot({ createdAt: iso(89 * DAY) }), NOW, POLICY).eligible).toBe(true)
    })

    it('a los 90 d se corta y no sale ningún correo más', () => {
        expect(computeBehaviorTriggers(snapshot({ createdAt: iso(90 * DAY) }), NOW, POLICY)).toEqual({
            eligible: false,
            skipped: 'past_cutoff',
        })
    })

    it('ni siquiera el aha atraviesa el corte', () => {
        const snap = snapshot({ createdAt: iso(91 * DAY), hasRealStudentActivity: true })
        expect(keys(snap)).toEqual([])
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({ eligible: false, skipped: 'past_cutoff' })
    })

    it('sin `created_at` legible no se manda nada (fail-closed)', () => {
        expect(computeBehaviorTriggers(snapshot({ createdAt: null }), NOW, POLICY)).toEqual({
            eligible: false,
            skipped: 'no_created_at',
        })
        expect(computeBehaviorTriggers(snapshot({ createdAt: 'no-es-una-fecha' }), NOW, POLICY)).toEqual({
            eligible: false,
            skipped: 'no_created_at',
        })
    })
})

describe('corte de lanzamiento (env ONBOARDING_BEHAVIOR_EMAILS_SINCE)', () => {
    const LAUNCH_MS = new Date(LAUNCH).getTime()
    /** Un día después del encendido, a las 12:00 de Chile: la ventana del día 1 ya se cumple. */
    const DAY_AFTER_LAUNCH = new Date(LAUNCH_MS + 21 * HOUR)

    // Sin corte legible no entra NADIE: escribirle de golpe a un padrón entero es el error caro.
    it('sin corte (`null`) nadie entra', () => {
        const snap = snapshot({ createdAt: iso(3 * DAY), hasRealStudentActivity: true })
        expect(computeBehaviorTriggers(snap, NOW, { launchCutover: null })).toEqual({
            eligible: false,
            skipped: 'before_launch',
        })
    })

    it('un corte ilegible tampoco deja entrar a nadie', () => {
        const snap = snapshot({ createdAt: iso(3 * DAY) })
        expect(evaluateBehaviorEligibility(snap, NOW, { launchCutover: 'mañana' })).toBe('before_launch')
    })

    it('una cuenta anterior al corte queda fuera, incluso con el aha ya ocurrido', () => {
        const snap = snapshot({ createdAt: '2026-09-05T10:00:00.000Z', hasRealStudentActivity: true })
        expect(computeBehaviorTriggers(snap, new Date('2026-09-20T15:00:00Z'), POLICY)).toEqual({
            eligible: false,
            skipped: 'before_launch',
        })
    })

    it('un minuto antes del corte todavía es padrón viejo', () => {
        const snap = snapshot({ createdAt: new Date(LAUNCH_MS - 60_000).toISOString() })
        expect(evaluateBehaviorEligibility(snap, DAY_AFTER_LAUNCH, POLICY)).toBe('before_launch')
    })

    it('creada JUSTO en el corte ya entra (es «en o después»)', () => {
        const snap = snapshot({ createdAt: LAUNCH })
        expect(evaluateBehaviorEligibility(snap, DAY_AFTER_LAUNCH, POLICY)).toBeNull()
        expect(keys(snap, DAY_AFTER_LAUNCH)).toEqual(['behavior_no_client_2h'])
    })
})

describe('dedupe por (coach_id, template_key)', () => {
    it('una key ya viva en el ledger no se vuelve a proponer', () => {
        const snap = snapshot({ createdAt: iso(30 * HOUR), alreadySent: ['behavior_no_client_2h'] })
        expect(keys(snap)).not.toContain('behavior_no_client_2h')
    })

    it('deduplicada la primera, sale la que sigue en prioridad', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            hasFirstArtifact: false,
            alreadySent: ['behavior_no_client_2h'],
        })
        const trigger = pickBehaviorTrigger(computeBehaviorTriggers(snap, NOW, POLICY))
        expect(trigger?.template_key).toBe('behavior_no_return_24h')
    })

    it('con las 5 keys en el ledger la lista queda vacía y el coach no recibe nada', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            hasFirstArtifact: false,
            hasRealStudentActivity: true,
            alreadySent: [...BEHAVIOR_TEMPLATE_KEYS],
        })
        expect(keys(snap)).toEqual([])
        expect(pickBehaviorTrigger(computeBehaviorTriggers(snap, NOW, POLICY))).toBeNull()
    })
})

describe('cupo compartido (1 cada 24 h, 3 por semana, los dos registros)', () => {
    // El dedupe es por CORREO, no por persona: sin este piso el mismo coach juntaba tres correos
    // DISTINTOS en tres corridas horarias seguidas.
    it('con un correo automático de hace 3 h no sale nada y se cuenta como `cooldown`', () => {
        const snap = snapshot({ createdAt: iso(8 * DAY), recentAutomatedSentAts: [iso(3 * HOUR)] })
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({ eligible: false, skipped: 'cooldown' })
    })

    it('con 3 correos en la semana (ninguno de las últimas 24 h) se cuenta como `weekly_max`', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            recentAutomatedSentAts: [iso(2 * DAY), iso(4 * DAY), iso(6 * DAY)],
        })
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({ eligible: false, skipped: 'weekly_max' })
    })

    it('2 en la semana todavía dejan pasar el tercero', () => {
        const snap = snapshot({ createdAt: iso(8 * DAY), recentAutomatedSentAts: [iso(2 * DAY), iso(4 * DAY)] })
        expect(keys(snap)).toContain('behavior_help_7d')
    })

    it('el aha ATRAVIESA el cupo; el resto de las señales no', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            hasRealStudentActivity: true,
            recentAutomatedSentAts: [iso(3 * HOUR)],
        })
        expect(keys(snap)).toEqual(['behavior_aha'])
    })

    it('a las 25 h el motor vuelve a proponer todo', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            hasFirstArtifact: false,
            recentAutomatedSentAts: [iso(25 * HOUR)],
        })
        expect(keys(snap)).toEqual(['behavior_no_client_2h', 'behavior_no_return_24h', 'behavior_help_7d'])
    })

    it('un correo agendado a futuro también frena la corrida', () => {
        const snap = snapshot({
            createdAt: iso(30 * HOUR),
            recentAutomatedSentAts: [new Date(NOW.getTime() + 2 * HOUR).toISOString()],
        })
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({ eligible: false, skipped: 'cooldown' })
    })

    it('un coach sin ninguna señal sigue siendo «sin trigger», no `cooldown`', () => {
        const snap = snapshot({ createdAt: iso(1 * HOUR), recentAutomatedSentAts: [iso(50 * 60 * 1000)] })
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({ eligible: true, triggers: [] })
    })

    // Sin historial no se sabe si ya le escribimos hoy (por ejemplo, el aviso de cupo).
    it('historial ilegible (`null`): no sale nada, ni el aha', () => {
        const snap = snapshot({
            createdAt: iso(2 * DAY),
            hasRealStudentActivity: true,
            recentAutomatedSentAts: null,
        })
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({
            eligible: false,
            skipped: 'history_unreadable',
        })
    })
})

describe('horario de Chile (09–20 h)', () => {
    it('de noche no sale nada, ni el aha', () => {
        const snap = snapshot({ createdAt: iso(2 * DAY, NIGHT), hasRealStudentActivity: true })
        expect(computeBehaviorTriggers(snap, NIGHT, POLICY)).toEqual({ eligible: false, skipped: 'outside_hours' })
    })

    it('de noche, un coach sin señales sigue siendo «sin trigger»', () => {
        const snap = snapshot({ createdAt: iso(1 * HOUR, NIGHT) })
        expect(computeBehaviorTriggers(snap, NIGHT, POLICY)).toEqual({ eligible: true, triggers: [] })
    })
})

describe('uno por corrida', () => {
    it('un coach de 8 días sin alumnos ni rutina matchea 3 señales y sale UNA sola', () => {
        const snap = snapshot({ createdAt: iso(8 * DAY), hasFirstArtifact: false })
        expect(keys(snap)).toEqual(['behavior_no_client_2h', 'behavior_no_return_24h', 'behavior_help_7d'])
        expect(pickBehaviorTrigger(computeBehaviorTriggers(snap, NOW, POLICY))?.template_key).toBe(
            'behavior_no_client_2h'
        )
    })
})

describe('exclusiones', () => {
    it('cuenta de prueba: fuera', () => {
        const snap = snapshot({ createdAt: iso(30 * HOUR), email: 'otro@evatest.cl', isTestAccount: true })
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({ eligible: false, skipped: 'test_account' })
    })

    it('`qa-free-v3@evatest.cl` ATRAVIESA la exclusión (bypass explícito de QA)', () => {
        const snap = snapshot({
            createdAt: iso(30 * HOUR),
            email: BEHAVIOR_TEST_ACCOUNT_BYPASS,
            isTestAccount: true,
        })
        expect(isBehaviorTestBypass(BEHAVIOR_TEST_ACCOUNT_BYPASS)).toBe(true)
        expect(isBehaviorTestBypass(' QA-Free-V3@EvaTest.CL ')).toBe(true)
        expect(keys(snap)).toContain('behavior_no_client_2h')
    })

    it('sin email no hay a quién escribirle', () => {
        expect(evaluateBehaviorEligibility(snapshot({ email: null }), NOW, POLICY)).toBe('no_recipient')
    })

    it('coach dentro de una organización: fuera', () => {
        const snap = snapshot({ createdAt: iso(30 * HOUR), isOrgManaged: true })
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({ eligible: false, skipped: 'org_managed' })
    })

    // «Responde y los cortamos» tiene que cumplirse: con la marca de baja no sale nada, ni el aha.
    it('con la marca de baja no sale nada', () => {
        const snap = snapshot({ createdAt: iso(2 * DAY), hasRealStudentActivity: true, optedOut: true })
        expect(computeBehaviorTriggers(snap, NOW, POLICY)).toEqual({ eligible: false, skipped: 'opted_out' })
    })
})
