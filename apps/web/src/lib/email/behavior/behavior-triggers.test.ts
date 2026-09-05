import { describe, expect, it } from 'vitest'
import {
    BEHAVIOR_TEMPLATE_KEYS,
    BEHAVIOR_TEMPLATE_KEY_PREFIX,
    BEHAVIOR_TEST_ACCOUNT_BYPASS,
    FIRST_LOGIN_SIGNAL_CUTOVER,
    computeBehaviorTriggers,
    evaluateBehaviorEligibility,
    hasReturnedToPanel,
    isBehaviorTestBypass,
    pickBehaviorTrigger,
    type CoachBehaviorSnapshot,
} from './behavior-triggers'

/**
 * Motor de W6 (F6.1). Lo que estos tests pinnean, señal por señal:
 *  · las SEIS reglas de SPEC §8 con sus ventanas exactas (2 h / 24 h / 48 h / aha / 7 d / corte 90 d);
 *  · el dedupe por `(coach_id, template_key)` — sin él, un coach del día 3 recibe el mismo correo
 *    cada hora hasta el día 90, que es lo que un cron HORARIO convierte en desastre;
 *  · la exclusión de cuentas de prueba CON el bypass explícito de `qa-free-v3@evatest.cl` (W8.4.4):
 *    sin ese bypass W6 no se puede probar de punta a punta ni una sola vez;
 *  · «uno por corrida»: un coach de 8 días sin alumnos matchea tres señales y sale UN correo;
 *  · el corte a 90 d medido contra `created_at`, no contra `persona_set_at`.
 */

const NOW = new Date('2026-09-05T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function iso(msAgo: number): string {
    return new Date(NOW.getTime() - msAgo).toISOString()
}

/** Coach base: alta hace 1 h, sin alumnos, sin nada. Ninguna ventana cumplida todavía. */
function snapshot(overrides: Partial<CoachBehaviorSnapshot> = {}): CoachBehaviorSnapshot {
    return {
        coachId: '11111111-1111-4111-8111-111111111111',
        email: 'coach@example.com',
        persona: 'strength',
        createdAt: iso(1 * HOUR),
        lastActiveAt: iso(1 * HOUR),
        realClientCount: 0,
        anyRealClientLoggedIn: false,
        oldestPendingInviteAt: null,
        hasRealStudentActivity: false,
        alreadySent: [],
        isTestAccount: false,
        isOrgManaged: false,
        ...overrides,
    }
}

function keys(snap: CoachBehaviorSnapshot, now: Date = NOW): string[] {
    const evaluation = computeBehaviorTriggers(snap, now)
    return evaluation.eligible ? evaluation.triggers.map((t) => t.template_key) : []
}

describe('contrato de las keys', () => {
    it('las 5 keys llevan el prefijo `behavior_` y no colisionan con el drip viejo', () => {
        expect(BEHAVIOR_TEMPLATE_KEYS).toHaveLength(5)
        for (const key of BEHAVIOR_TEMPLATE_KEYS) {
            expect(key.startsWith(BEHAVIOR_TEMPLATE_KEY_PREFIX)).toBe(true)
        }
        // El dedupe del ledger es por `(coach_id, template_key)`: una colisión con `day1_value` y
        // familia haría que un correo de comportamiento se coma el dedupe del drip (o al revés).
        const dripKeys = ['day1_value', 'day2_pro', 'day7_nutrition', 'day14_last_call']
        for (const key of BEHAVIOR_TEMPLATE_KEYS) expect(dripKeys).not.toContain(key)
    })
})

describe('señal +2 h — cuenta creada, sin alumno real', () => {
    it('a la hora todavía NO dispara', () => {
        expect(keys(snapshot({ createdAt: iso(1 * HOUR) }))).not.toContain('behavior_no_client_2h')
    })

    it('a las 2 h exactas dispara', () => {
        expect(keys(snapshot({ createdAt: iso(2 * HOUR) }))).toContain('behavior_no_client_2h')
    })

    it('con un alumno REAL cargado no dispara nunca', () => {
        const snap = snapshot({ createdAt: iso(5 * HOUR), realClientCount: 1 })
        expect(keys(snap)).not.toContain('behavior_no_client_2h')
    })
})

describe('señal +24 h — no volvió al panel', () => {
    it('a las 24 h sin actividad posterior a la sesión del alta, dispara', () => {
        const snap = snapshot({ createdAt: iso(25 * HOUR), lastActiveAt: iso(25 * HOUR) })
        expect(keys(snap)).toContain('behavior_no_return_24h')
    })

    // `last_active_at` nace escrita en la PRIMERA navegación (proxy con throttle de 5 min): un
    // `!= null` daría por «volvió» a alguien que solo miró el panel el día del alta.
    it('actividad DENTRO de la ventana de la sesión del alta no cuenta como volver', () => {
        const created = iso(25 * HOUR)
        const snap = snapshot({ createdAt: created, lastActiveAt: iso(24 * HOUR) })
        expect(hasReturnedToPanel(snap)).toBe(false)
        expect(keys(snap)).toContain('behavior_no_return_24h')
    })

    it('actividad FUERA de esa ventana sí cuenta: no dispara', () => {
        const snap = snapshot({ createdAt: iso(48 * HOUR), lastActiveAt: iso(3 * HOUR) })
        expect(hasReturnedToPanel(snap)).toBe(true)
        expect(keys(snap)).not.toContain('behavior_no_return_24h')
    })

    it('sin `last_active_at` (nunca navegó) dispara', () => {
        const snap = snapshot({ createdAt: iso(30 * HOUR), lastActiveAt: null })
        expect(hasReturnedToPanel(snap)).toBe(false)
        expect(keys(snap)).toContain('behavior_no_return_24h')
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

    // Con un alumno adentro el coach ya vio el producto funcionando: el correo pasa a ser ruido.
    it('si algún alumno real YA entró, no dispara aunque otro siga pendiente', () => {
        const snap = snapshot({
            createdAt: created,
            realClientCount: 2,
            anyRealClientLoggedIn: true,
            oldestPendingInviteAt: iso(72 * HOUR),
        })
        expect(keys(snap)).not.toContain('behavior_client_not_entered_48h')
    })

    // El corte de la señal lo aplica el loader (`oldestPendingInviteAt` sale null para filas
    // anteriores): acá se pinnea que el motor no inventa la señal sin ese dato.
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
            lastActiveAt: null,
            realClientCount: 1,
            hasRealStudentActivity: true,
            oldestPendingInviteAt: iso(7 * DAY),
        })
        const trigger = pickBehaviorTrigger(computeBehaviorTriggers(snap, NOW))
        expect(trigger).toEqual({ template_key: 'behavior_aha', reason: 'real_student_activity' })
    })
})

describe('señal +7 d — sin activar, ayuda humana', () => {
    it('a los 7 d sin aha dispara', () => {
        const snap = snapshot({ createdAt: iso(7 * DAY), lastActiveAt: iso(1 * HOUR) })
        expect(keys(snap)).toContain('behavior_help_7d')
    })

    it('a los 6 d todavía no', () => {
        expect(keys(snapshot({ createdAt: iso(6 * DAY) }))).not.toContain('behavior_help_7d')
    })

    // «Activado» = un alumno real hizo algo. Un coach con alumnos que ya entrenan no necesita ayuda.
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
        const snap = snapshot({ createdAt: iso(89 * DAY), lastActiveAt: null })
        expect(computeBehaviorTriggers(snap, NOW).eligible).toBe(true)
    })

    it('a los 90 d se corta y no sale ningún correo más', () => {
        const snap = snapshot({ createdAt: iso(90 * DAY), lastActiveAt: null })
        expect(computeBehaviorTriggers(snap, NOW)).toEqual({ eligible: false, skipped: 'past_cutoff' })
    })

    // El corte mide la EDAD DE LA CUENTA. Anclarlo a `persona_set_at` haría que un coach de dos años
    // que elige especialidad hoy reciba «invitá a tu primer alumno»: el peor correo posible.
    it('ni siquiera el aha atraviesa el corte', () => {
        const snap = snapshot({ createdAt: iso(120 * DAY), hasRealStudentActivity: true })
        expect(keys(snap)).toEqual([])
    })

    it('sin `created_at` legible no se manda nada (fail-closed)', () => {
        expect(computeBehaviorTriggers(snapshot({ createdAt: null }), NOW)).toEqual({
            eligible: false,
            skipped: 'no_created_at',
        })
        expect(computeBehaviorTriggers(snapshot({ createdAt: 'no-es-una-fecha' }), NOW)).toEqual({
            eligible: false,
            skipped: 'no_created_at',
        })
    })
})

describe('dedupe por (coach_id, template_key)', () => {
    it('una key ya viva en el ledger no se vuelve a proponer', () => {
        const snap = snapshot({ createdAt: iso(3 * HOUR), alreadySent: ['behavior_no_client_2h'] })
        expect(keys(snap)).not.toContain('behavior_no_client_2h')
    })

    it('deduplicada la primera, sale la que sigue en prioridad', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            lastActiveAt: null,
            alreadySent: ['behavior_no_client_2h'],
        })
        const trigger = pickBehaviorTrigger(computeBehaviorTriggers(snap, NOW))
        expect(trigger?.template_key).toBe('behavior_no_return_24h')
    })

    it('con las 5 keys en el ledger la lista queda vacía y el coach no recibe nada', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            lastActiveAt: null,
            hasRealStudentActivity: true,
            alreadySent: [...BEHAVIOR_TEMPLATE_KEYS],
        })
        expect(keys(snap)).toEqual([])
        expect(pickBehaviorTrigger(computeBehaviorTriggers(snap, NOW))).toBeNull()
    })
})

describe('uno por corrida', () => {
    it('un coach de 8 días sin alumnos matchea 3 señales y sale UNA sola', () => {
        const snap = snapshot({ createdAt: iso(8 * DAY), lastActiveAt: null })
        expect(keys(snap)).toEqual([
            'behavior_no_client_2h',
            'behavior_no_return_24h',
            'behavior_help_7d',
        ])
        expect(pickBehaviorTrigger(computeBehaviorTriggers(snap, NOW))?.template_key).toBe(
            'behavior_no_client_2h'
        )
    })
})

describe('exclusiones', () => {
    it('cuenta de prueba: fuera', () => {
        const snap = snapshot({
            createdAt: iso(3 * HOUR),
            email: 'otro@evatest.cl',
            isTestAccount: true,
        })
        expect(computeBehaviorTriggers(snap, NOW)).toEqual({ eligible: false, skipped: 'test_account' })
    })

    // W8.4.4: sin este bypass, la única cuenta con la que el owner recorre las 5 personas queda
    // excluida por el dominio `evatest.cl` y W6 no se puede probar jamás con un correo real.
    it('`qa-free-v3@evatest.cl` ATRAVIESA la exclusión (bypass explícito de QA)', () => {
        const snap = snapshot({
            createdAt: iso(3 * HOUR),
            email: BEHAVIOR_TEST_ACCOUNT_BYPASS,
            isTestAccount: true,
        })
        expect(isBehaviorTestBypass(BEHAVIOR_TEST_ACCOUNT_BYPASS)).toBe(true)
        expect(isBehaviorTestBypass(' QA-Free-V3@EvaTest.CL ')).toBe(true)
        expect(keys(snap)).toContain('behavior_no_client_2h')
    })

    it('sin email no hay a quién escribirle', () => {
        expect(evaluateBehaviorEligibility(snapshot({ email: null }), NOW)).toBe('no_recipient')
    })

    it('coach dentro de una organización: fuera (su alta y su cupo los manda la org)', () => {
        const snap = snapshot({ createdAt: iso(3 * HOUR), isOrgManaged: true })
        expect(computeBehaviorTriggers(snap, NOW)).toEqual({ eligible: false, skipped: 'org_managed' })
    })
})
