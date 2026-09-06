import { describe, expect, it } from 'vitest'
import {
    buildCatchupPlan,
    CATCHUP_MIN_CREATED_AT,
    CATCHUP_TEMPLATE_KEY,
    checkSendPreconditions,
    chunk,
    countSkipReasons,
    decideCatchup,
    maskEmail,
    nextDecentSlot,
    parseArgs,
    readSupabaseEnv,
    renderPlanTable,
    resolveScheduledAt,
    shortDate,
    SOURCE_TEMPLATE_KEY,
    truncate,
    type CoachCandidate,
    type CoachFacts,
} from './day2-pro-catchup'

// Reenvío del `day2_pro` (D2 del owner, 05-09). Acá se fija la regla de A QUIÉN se le manda: el
// script solo corre una vez y contra producción, así que el único lugar donde la selección se
// puede probar barata es este, con fixtures.

function coach(overrides: Partial<CoachCandidate> = {}): CoachCandidate {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'movens',
        brandName: 'Movens',
        coachName: 'Gerardo V.',
        createdAt: '2026-08-25T04:12:00.000Z',
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
        ...overrides,
    }
}

/** Coach «típico» de la tanda: Free, activo, alta post 23-08, con el día 2 CANCELADO por la higiene. */
function facts(overrides: Partial<CoachFacts> = {}): CoachFacts {
    return {
        coach: coach(),
        email: 'gerardo@movens.cl',
        realClients: 0,
        ledger: [{ templateKey: SOURCE_TEMPLATE_KEY, status: 'cancelled' }],
        capEmailSent: false,
        ...overrides,
    }
}

describe('decideCatchup', () => {
    it('elige al coach de la tanda: Free activo, alta post 23-08, sin alumnos y con el día 2 cancelado', () => {
        expect(decideCatchup(facts())).toEqual({ eligible: true })
    })

    it('también elige al que nunca tuvo fila de ledger (la higiene ni llegó a escribirla)', () => {
        expect(decideCatchup(facts({ ledger: [] }))).toEqual({ eligible: true })
    })

    it('salta al que ya no es Free', () => {
        const decision = decideCatchup(facts({ coach: coach({ subscriptionTier: 'pro' }) }))
        expect(decision).toEqual({ eligible: false, reason: 'no_es_free' })
    })

    it('salta al que tiene la suscripción en otro estado', () => {
        const decision = decideCatchup(facts({ coach: coach({ subscriptionStatus: 'paused' }) }))
        expect(decision).toEqual({ eligible: false, reason: 'suscripcion_no_activa' })
    })

    it('salta al de alta anterior al corte del 23-08', () => {
        const decision = decideCatchup(facts({ coach: coach({ createdAt: '2026-08-22T23:59:59.999Z' }) }))
        expect(decision).toEqual({ eligible: false, reason: 'alta_anterior_al_corte' })
    })

    it('el borde del corte es inclusivo: el alta exacta del 23-08 a las 00:00Z entra', () => {
        expect(decideCatchup(facts({ coach: coach({ createdAt: CATCHUP_MIN_CREATED_AT }) }))).toEqual({
            eligible: true,
        })
    })

    it('un created_at ilegible cae del lado seguro (no se le manda nada)', () => {
        const decision = decideCatchup(facts({ coach: coach({ createdAt: 'no-es-una-fecha' }) }))
        expect(decision).toEqual({ eligible: false, reason: 'alta_anterior_al_corte' })
    })

    it('salta al que no tiene email en auth', () => {
        expect(decideCatchup(facts({ email: null }))).toEqual({ eligible: false, reason: 'sin_email' })
        expect(decideCatchup(facts({ email: '   ' }))).toEqual({ eligible: false, reason: 'sin_email' })
    })

    it('salta a las cuentas de prueba (dominio evatest.cl y la lista explícita)', () => {
        expect(decideCatchup(facts({ email: 'e2e-solo-coach@evatest.cl' }))).toEqual({
            eligible: false,
            reason: 'email_de_prueba',
        })
        expect(decideCatchup(facts({ email: 'juanmvr2706@gmail.com' }))).toEqual({
            eligible: false,
            reason: 'email_de_prueba',
        })
    })

    it('salta al que ya tiene alumnos reales: a ése le habla el correo de cupo', () => {
        expect(decideCatchup(facts({ realClients: 1 }))).toEqual({
            eligible: false,
            reason: 'ya_tiene_alumnos',
        })
    })

    // `scheduled` también salta: sigue en la cola de Resend y con la higiene por rebote (D1) ya no se
    // lo cancelan por «no verificado» — mandarle el reenvío sería el correo doble que evitamos.
    it.each(['sent', 'delivered', 'scheduled'])('salta si el día 2 original quedó en %s', (status) => {
        const decision = decideCatchup(facts({ ledger: [{ templateKey: SOURCE_TEMPLATE_KEY, status }] }))
        expect(decision).toEqual({ eligible: false, reason: 'day2_ya_enviado' })
    })

    it.each(['cancelled', 'failed'])(
        'un día 2 en %s NO cuenta como enviado: es justo la tanda a rescatar',
        (status) => {
            expect(decideCatchup(facts({ ledger: [{ templateKey: SOURCE_TEMPLATE_KEY, status }] }))).toEqual({
                eligible: true,
            })
        }
    )

    it.each(['scheduled', 'sent', 'delivered', 'cancelled', 'bounced', 'complained'])(
        'salta si el reenvío ya quedó registrado en %s',
        (status) => {
            const decision = decideCatchup(facts({ ledger: [{ templateKey: CATCHUP_TEMPLATE_KEY, status }] }))
            expect(decision).toEqual({ eligible: false, reason: 'reenvio_ya_registrado' })
        }
    )

    it('un reenvío anterior en failed SÍ se reintenta (failed es el único estado reintentable)', () => {
        const decision = decideCatchup(
            facts({ ledger: [{ templateKey: CATCHUP_TEMPLATE_KEY, status: 'failed' }] })
        )
        expect(decision).toEqual({ eligible: true })
    })

    it('salta al que ya recibió el correo de «tope de alumnos»', () => {
        expect(decideCatchup(facts({ capEmailSent: true }))).toEqual({
            eligible: false,
            reason: 'ya_recibio_correo_de_cupo',
        })
    })

    it('con varios cortes ciertos gana el más explicativo (identidad antes que estado del correo)', () => {
        const decision = decideCatchup(
            facts({
                email: 'qa@evatest.cl',
                realClients: 3,
                capEmailSent: true,
                ledger: [{ templateKey: SOURCE_TEMPLATE_KEY, status: 'sent' }],
            })
        )
        expect(decision).toEqual({ eligible: false, reason: 'email_de_prueba' })
    })
})

describe('buildCatchupPlan', () => {
    it('separa elegibles de saltados y conserva el motivo de cada salto', () => {
        const plan = buildCatchupPlan(
            [
                facts({ coach: coach({ id: 'a', slug: 'uno' }) }),
                facts({ coach: coach({ id: 'b', slug: 'dos' }), realClients: 2 }),
                facts({ coach: coach({ id: 'c', slug: 'tres' }), email: 'qa@evatest.cl' }),
            ],
            null
        )
        expect(plan.candidates).toBe(3)
        expect(plan.selected.map((f) => f.coach.slug)).toEqual(['uno'])
        expect(plan.skipped.map((s) => s.reason)).toEqual(['ya_tiene_alumnos', 'email_de_prueba'])
        expect(plan.trimmedByLimit).toBe(0)
    })

    it('--limit recorta los elegibles y reporta cuántos quedaron fuera', () => {
        const plan = buildCatchupPlan(
            [
                facts({ coach: coach({ id: 'a', slug: 'uno' }) }),
                facts({ coach: coach({ id: 'b', slug: 'dos' }) }),
                facts({ coach: coach({ id: 'c', slug: 'tres' }) }),
            ],
            2
        )
        expect(plan.selected.map((f) => f.coach.slug)).toEqual(['uno', 'dos'])
        expect(plan.trimmedByLimit).toBe(1)
    })

    it('un --limit mayor que los elegibles no recorta nada', () => {
        const plan = buildCatchupPlan([facts()], 50)
        expect(plan.selected).toHaveLength(1)
        expect(plan.trimmedByLimit).toBe(0)
    })
})

describe('countSkipReasons', () => {
    it('cuenta por motivo, de mayor a menor', () => {
        const plan = buildCatchupPlan(
            [
                facts({ realClients: 1, coach: coach({ id: 'a' }) }),
                facts({ realClients: 4, coach: coach({ id: 'b' }) }),
                facts({ capEmailSent: true, coach: coach({ id: 'c' }) }),
            ],
            null
        )
        expect(countSkipReasons(plan.skipped)).toEqual([
            ['ya_tiene_alumnos', 2],
            ['ya_recibio_correo_de_cupo', 1],
        ])
    })
})

describe('maskEmail', () => {
    it('deja la inicial y el dominio', () => {
        expect(maskEmail('gerardo@movens.cl')).toBe('g***@movens.cl')
        expect(maskEmail('a@b.cl')).toBe('a***@b.cl')
    })

    it('sin email devuelve una etiqueta, no una cadena vacía', () => {
        expect(maskEmail(null)).toBe('(sin email)')
        expect(maskEmail('   ')).toBe('(sin email)')
    })

    it('un valor sin @ se enmascara entero antes que arriesgar un volcado', () => {
        expect(maskEmail('gerardo')).toBe('***')
    })

    it('parte por el ÚLTIMO @ (los locales con @ escapado no rompen el dominio)', () => {
        expect(maskEmail('raro@cosa@movens.cl')).toBe('r***@movens.cl')
    })
})

describe('renderPlanTable', () => {
    it('nunca imprime el email completo, ni de los elegibles ni de los saltados', () => {
        const plan = buildCatchupPlan(
            [
                facts({ coach: coach({ id: 'a', slug: 'uno' }), email: 'gerardo@movens.cl' }),
                facts({ coach: coach({ id: 'b', slug: 'dos' }), email: 'ani@anifit.cl', realClients: 1 }),
            ],
            null
        )
        const table = renderPlanTable(plan)
        expect(table).not.toContain('gerardo@movens.cl')
        expect(table).not.toContain('ani@anifit.cl')
        expect(table).toContain('g***@movens.cl')
        expect(table).toContain('a***@anifit.cl')
        expect(table).toContain('SE AGENDA')
        expect(table).toContain('ya tiene alumnos')
    })
})

describe('truncate / shortDate', () => {
    it('recorta con elipsis sin pasarse del ancho de la columna', () => {
        expect(truncate('Movens', 10)).toBe('Movens')
        // La elipsis ocupa uno de los 10: si no, la columna se corre y la tabla se desalinea.
        expect(truncate('Marca larguísima de coach', 10)).toBe('Marca lar…')
        expect(truncate('Marca larguísima de coach', 10)).toHaveLength(10)
    })

    it('una fecha ilegible no imprime «Invalid Date»', () => {
        expect(shortDate('2026-08-25T04:12:00.000Z')).toBe('2026-08-25')
        expect(shortDate('vaya uno a saber')).toBe('????-??-??')
    })
})

describe('parseArgs', () => {
    it('sin flags es dry-run', () => {
        expect(parseArgs([])).toEqual({ ok: true, args: { send: false, at: null, limit: null } })
    })

    it('acepta --send, --at y --limit juntos', () => {
        expect(parseArgs(['--send', '--at', '2026-09-08T13:00:00Z', '--limit', '5'])).toEqual({
            ok: true,
            args: { send: true, at: '2026-09-08T13:00:00Z', limit: 5 },
        })
    })

    it('--dry y --send juntos abortan en vez de que gane el último', () => {
        const result = parseArgs(['--dry', '--send'])
        expect(result.ok).toBe(false)
        expect(result.ok === false && result.error).toContain('elegí uno')
    })

    it('--at sin valor (o seguido de otra flag) es un error claro', () => {
        expect(parseArgs(['--at']).ok).toBe(false)
        expect(parseArgs(['--at', '--send']).ok).toBe(false)
    })

    it.each([['--limit'], ['--limit', '0'], ['--limit', '-3'], ['--limit', '2.5'], ['--limit', 'ocho']])(
        'rechaza un --limit que no sea entero positivo (%s)',
        (...argv) => {
            expect(parseArgs(argv).ok).toBe(false)
        }
    )

    it('una flag desconocida no se ignora en silencio', () => {
        const result = parseArgs(['--sennd'])
        expect(result.ok).toBe(false)
        expect(result.ok === false && result.error).toContain('--sennd')
    })
})

describe('readSupabaseEnv', () => {
    it('con las dos variables devuelve la config', () => {
        const result = readSupabaseEnv({
            NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'service-role-falsa',
        })
        expect(result.ok).toBe(true)
        expect(result.ok === true && result.url).toBe('https://proyecto.supabase.co')
    })

    it('con env ausente aborta y NOMBRA las dos variables que faltan', () => {
        const result = readSupabaseEnv({})
        expect(result.ok).toBe(false)
        expect(result.ok === false && result.error).toContain('NEXT_PUBLIC_SUPABASE_URL')
        expect(result.ok === false && result.error).toContain('SUPABASE_SERVICE_ROLE_KEY')
    })

    it('una variable en blanco cuenta como ausente (un .env con la clave vacía no pasa)', () => {
        const result = readSupabaseEnv({
            NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: '   ',
        })
        expect(result.ok).toBe(false)
        expect(result.ok === false && result.error).toContain('SUPABASE_SERVICE_ROLE_KEY')
    })
})

describe('checkSendPreconditions', () => {
    const completo = {
        CATCHUP_CONFIRM: 'yes',
        RESEND_API_KEY: 're_falsa',
        EMAIL_FROM: 'EVA <hola@eva-app.cl>',
    }

    it('con la confirmación y las llaves de Resend pasa', () => {
        expect(checkSendPreconditions(completo)).toEqual({ ok: true })
    })

    it('sin CATCHUP_CONFIRM=yes no se agenda nada', () => {
        expect(checkSendPreconditions({ ...completo, CATCHUP_CONFIRM: undefined }).ok).toBe(false)
        expect(checkSendPreconditions({ ...completo, CATCHUP_CONFIRM: 'si' }).ok).toBe(false)
    })

    it('acepta la confirmación con mayúsculas y espacios', () => {
        expect(checkSendPreconditions({ ...completo, CATCHUP_CONFIRM: ' YES ' })).toEqual({ ok: true })
    })

    it('sin RESEND_API_KEY ni EMAIL_FROM aborta antes de ensuciar el ledger con filas failed', () => {
        const result = checkSendPreconditions({ CATCHUP_CONFIRM: 'yes' })
        expect(result.ok).toBe(false)
        expect(result.ok === false && result.error).toContain('RESEND_API_KEY')
        expect(result.ok === false && result.error).toContain('EMAIL_FROM')
    })
})

describe('nextDecentSlot / resolveScheduledAt', () => {
    it('de madrugada agenda para las 13:00Z del mismo día', () => {
        expect(nextDecentSlot(new Date('2026-09-05T03:20:00.000Z')).toISOString()).toBe(
            '2026-09-05T13:00:00.000Z'
        )
    })

    it('pasadas las 13:00Z se va al día siguiente', () => {
        expect(nextDecentSlot(new Date('2026-09-05T18:00:00.000Z')).toISOString()).toBe(
            '2026-09-06T13:00:00.000Z'
        )
    })

    it('el borde exacto de las 13:00Z también salta al día siguiente (tiene que ser futuro)', () => {
        expect(nextDecentSlot(new Date('2026-09-05T13:00:00.000Z')).toISOString()).toBe(
            '2026-09-06T13:00:00.000Z'
        )
    })

    it('cruza el fin de mes sin romperse', () => {
        expect(nextDecentSlot(new Date('2026-09-30T22:00:00.000Z')).toISOString()).toBe(
            '2026-10-01T13:00:00.000Z'
        )
    })

    it('sin --at usa el próximo horario decente', () => {
        const result = resolveScheduledAt(null, new Date('2026-09-05T03:20:00.000Z'))
        expect(result).toEqual({ ok: true, iso: '2026-09-05T13:00:00.000Z' })
    })

    it('con --at futuro lo normaliza a ISO', () => {
        const result = resolveScheduledAt('2026-09-08T13:00:00Z', new Date('2026-09-05T03:20:00.000Z'))
        expect(result).toEqual({ ok: true, iso: '2026-09-08T13:00:00.000Z' })
    })

    it('un --at pasado aborta: Resend rechazaría el agendado', () => {
        const result = resolveScheduledAt('2026-09-01T13:00:00Z', new Date('2026-09-05T03:20:00.000Z'))
        expect(result.ok).toBe(false)
        expect(result.ok === false && result.error).toContain('ya pasó')
    })

    it('un --at ilegible aborta con el valor recibido en el mensaje', () => {
        const result = resolveScheduledAt('mañana', new Date('2026-09-05T03:20:00.000Z'))
        expect(result.ok).toBe(false)
        expect(result.ok === false && result.error).toContain('mañana')
    })
})

describe('chunk', () => {
    it('parte en lotes del tamaño pedido y deja el resto en el último', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
        expect(chunk([], 10)).toEqual([])
        expect(chunk([1, 2], 10)).toEqual([[1, 2]])
    })
})
