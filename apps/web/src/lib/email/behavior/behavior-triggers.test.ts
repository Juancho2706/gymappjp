import { describe, expect, it } from 'vitest'
import {
    BEHAVIOR_LAUNCH_CUTOVER,
    BEHAVIOR_MIN_GAP_MS,
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
 *  · el corte a 90 d medido contra `created_at`, no contra `persona_set_at`;
 *  · el corte de LANZAMIENTO: el padrón anterior al 06-09 no entra a W6;
 *  · el espaciado de 24 h por coach, con el aha como única excepción.
 */

/**
 * `NOW` está DESPUÉS del corte de lanzamiento + 90 d a propósito (era el 05-09, o sea el día
 * anterior al cutover, y con eso todos los coaches de estos tests eran `before_launch`). Corrido al
 * 10-12, un coach de 89 d nace el 12-09 —ya adentro de W6— y las pruebas del corte de 90 d siguen
 * midiendo lo que dicen medir.
 */
const NOW = new Date('2026-12-10T12:00:00.000Z')
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
        lastBehaviorSentAt: null,
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
    // 95 d y no 120: con el corte de lanzamiento una cuenta de 120 d sale por `before_launch` y el
    // test dejaría de probar el corte de 90 d (que es lo que le importa a este bloque).
    it('ni siquiera el aha atraviesa el corte', () => {
        const snap = snapshot({ createdAt: iso(95 * DAY), hasRealStudentActivity: true })
        expect(keys(snap)).toEqual([])
        expect(computeBehaviorTriggers(snap, NOW)).toEqual({ eligible: false, skipped: 'past_cutoff' })
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

describe('corte de lanzamiento (W6 arranca el 06-09)', () => {
    const LAUNCH_MS = new Date(BEHAVIOR_LAUNCH_CUTOVER).getTime()
    /** Tres horas después del encendido: la ventana de +2 h ya se cumple para quien nació ahí. */
    const JUST_AFTER_LAUNCH = new Date(LAUNCH_MS + 3 * HOUR)

    it('el corte es el 06-09 a las 00:00Z', () => {
        expect(BEHAVIOR_LAUNCH_CUTOVER).toBe('2026-09-06T00:00:00Z')
    })

    // El ensayo del 06-09 03:00Z dio `candidates=85 wouldSend=83`: el barrido cubre a TODOS los
    // coaches de los últimos 90 d, así que encenderlo sin este corte le escribía a coaches de julio
    // con un aha o una «ayuda a los 7 d» dos meses tarde. Ese padrón ya recibió el drip por
    // calendario y no hay nada nuevo que decirle.
    it('una cuenta anterior al corte queda fuera, incluso con el aha ya ocurrido', () => {
        const snap = snapshot({
            createdAt: '2026-07-20T10:00:00.000Z',
            hasRealStudentActivity: true,
        })
        expect(computeBehaviorTriggers(snap, NOW)).toEqual({
            eligible: false,
            skipped: 'before_launch',
        })
    })

    it('un minuto antes del corte todavía es padrón viejo', () => {
        const snap = snapshot({ createdAt: new Date(LAUNCH_MS - 60_000).toISOString() })
        expect(evaluateBehaviorEligibility(snap, JUST_AFTER_LAUNCH)).toBe('before_launch')
    })

    it('creada JUSTO en el corte ya entra (es «en o después»)', () => {
        const snap = snapshot({
            createdAt: BEHAVIOR_LAUNCH_CUTOVER,
            lastActiveAt: BEHAVIOR_LAUNCH_CUTOVER,
        })
        expect(evaluateBehaviorEligibility(snap, JUST_AFTER_LAUNCH)).toBeNull()
        expect(keys(snap, JUST_AFTER_LAUNCH)).toEqual(['behavior_no_client_2h'])
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

describe('espaciado por coach (24 h entre correos)', () => {
    it('el piso es de 24 h', () => {
        expect(BEHAVIOR_MIN_GAP_MS).toBe(24 * HOUR)
    })

    // El dedupe es por CORREO, no por persona: sin este piso el mismo coach recibía
    // `no_client_2h` en la hora 1, `no_return_24h` en la hora 2 y `help_7d` en la hora 3.
    it('con un correo de hace 3 h no sale nada y se cuenta como `cooldown`', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            lastActiveAt: null,
            lastBehaviorSentAt: iso(3 * HOUR),
        })
        expect(computeBehaviorTriggers(snap, NOW)).toEqual({ eligible: false, skipped: 'cooldown' })
    })

    // La felicitación la dispara el ALUMNO y no el reloj: llegar un día tarde la vuelve ruido.
    it('el aha ATRAVIESA el espaciado; el resto de las señales no', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            lastActiveAt: null,
            hasRealStudentActivity: true,
            lastBehaviorSentAt: iso(3 * HOUR),
        })
        expect(keys(snap)).toEqual(['behavior_aha'])
    })

    it('a las 25 h el motor vuelve a proponer todo', () => {
        const snap = snapshot({
            createdAt: iso(8 * DAY),
            lastActiveAt: null,
            lastBehaviorSentAt: iso(25 * HOUR),
        })
        expect(keys(snap)).toEqual([
            'behavior_no_client_2h',
            'behavior_no_return_24h',
            'behavior_help_7d',
        ])
    })

    it('a las 24 h exactas el piso ya se cumplió', () => {
        const snap = snapshot({
            createdAt: iso(3 * DAY),
            lastActiveAt: iso(3 * DAY),
            lastBehaviorSentAt: iso(24 * HOUR),
        })
        expect(keys(snap)).toContain('behavior_no_client_2h')
    })

    // Una fila `scheduled` a futuro es un correo que TODAVÍA no llegó a la casilla: amontonarle otro
    // encima es justo lo que el piso viene a evitar.
    it('un correo agendado a futuro también frena la corrida', () => {
        const snap = snapshot({
            createdAt: iso(3 * HOUR),
            lastBehaviorSentAt: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
        })
        expect(computeBehaviorTriggers(snap, NOW)).toEqual({ eligible: false, skipped: 'cooldown' })
    })

    // `cooldown` y `no_trigger` no son lo mismo en el resumen del cron: el primero vuelve a
    // intentarse solo en la corrida siguiente, el segundo no tenía nada que mandar.
    it('un coach sin ninguna señal sigue siendo `no_trigger`, no `cooldown`', () => {
        // Cuenta de 1 h que ya recibió el aha (disparo en línea): ninguna otra ventana se cumple.
        const snap = snapshot({ createdAt: iso(1 * HOUR), lastBehaviorSentAt: iso(50 * 60 * 1000) })
        expect(computeBehaviorTriggers(snap, NOW)).toEqual({ eligible: true, triggers: [] })
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
