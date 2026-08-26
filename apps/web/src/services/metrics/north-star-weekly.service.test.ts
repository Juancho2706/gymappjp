import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    buildNorthStarEmail,
    computeNorthStarWeeklyRow,
    previousIsoWeekWindow,
    SIN_LECTURA,
} from './north-star-weekly.service'

/**
 * North Star semanal — la consulta de cohorte de W0.1 traducida a PostgREST.
 *
 * Lo que se pinnea acá:
 *  · la ventana = semana ISO UTC ANTERIOR completa, con el corte de datos en `now`;
 *  · «invitaron» NS vs. cruda, con el autoinvitado detectado por normalización Y el detectado por
 *    la lista manual (el caso #28, que ninguna normalización puede deducir);
 *  · la purga de cuentas de PRUEBA de coach (y que los alumnos NO se purgan por dominio);
 *  · la madurez a 72 h y a 7 días medida contra el corte, no contra el fin de la ventana;
 *  · la regla dura del piso: bajo n = 20 los guardarraíles van NULL, nunca 0 ni un porcentaje;
 *  · que los DOS defaults históricos de `primary_color` no cuentan como marca propia;
 *  · que el correo imprime «sin lectura» donde la fila trae null.
 */

const MONDAY_13_UTC = new Date('2026-08-24T13:00:00.000Z')

type CoachFixture = {
    id: string
    created_at: string
    persona: string | null
    primary_color: string | null
    logo_url: string | null
    subscription_status: string | null
    registration_ip: string | null
    active_org_id: string | null
}

type ClientFixture = {
    id: string
    coach_id: string
    email: string
    created_at: string
    phone: string | null
    is_demo: boolean
    is_archived: boolean
    org_id: string | null
    team_id: string | null
}

type AuthFixture = {
    email: string | null
    phone?: string | null
    email_confirmed_at?: string | null
    last_sign_in_at?: string | null
}

let coaches: CoachFixture[] = []
let clients: ClientFixture[] = []
let authUsers: Record<string, AuthFixture> = {}

const iso = (s: string) => new Date(s).toISOString()

type Row = Record<string, unknown>

/** Builder de PostgREST de mentira: registra los filtros y los aplica de verdad en el `.range`. */
function makeChain(rows: Row[]) {
    const filters: ((r: Row) => boolean)[] = []
    const chain: Record<string, unknown> = {}
    Object.assign(chain, {
        eq: (col: string, value: unknown) => {
            filters.push((r) => r[col] === value)
            return chain
        },
        is: (col: string, value: unknown) => {
            filters.push((r) => (r[col] ?? null) === value)
            return chain
        },
        in: (col: string, values: unknown[]) => {
            filters.push((r) => values.includes(r[col]))
            return chain
        },
        not: (col: string, _op: string, value: unknown) => {
            filters.push((r) => (r[col] ?? null) !== value)
            return chain
        },
        gte: (col: string, value: string) => {
            filters.push((r) => String(r[col]) >= value)
            return chain
        },
        lt: (col: string, value: string) => {
            filters.push((r) => String(r[col]) < value)
            return chain
        },
        lte: (col: string, value: string) => {
            filters.push((r) => String(r[col]) <= value)
            return chain
        },
        order: () => chain,
        range: async (from: number) => ({
            data: from === 0 ? rows.filter((r) => filters.every((f) => f(r))) : [],
            error: null,
        }),
    })
    return chain
}

function makeAdmin(): SupabaseClient<Database> {
    const admin = {
        auth: {
            admin: {
                getUserById: async (id: string) => {
                    const u = authUsers[id]
                    if (!u) return { data: { user: null }, error: null }
                    return {
                        data: {
                            user: {
                                id,
                                email: u.email,
                                phone: u.phone ?? null,
                                email_confirmed_at: u.email_confirmed_at ?? null,
                                last_sign_in_at: u.last_sign_in_at ?? null,
                            },
                        },
                        error: null,
                    }
                },
            },
        },
        from: (table: string) => ({
            select: () =>
                makeChain(
                    table === 'coaches'
                        ? (coaches as unknown as Row[])
                        : table === 'clients'
                          ? (clients as unknown as Row[])
                          : []
                ),
        }),
    }
    return admin as unknown as SupabaseClient<Database>
}

function seedCoach(
    id: string,
    email: string | null,
    overrides: Partial<CoachFixture> & Partial<AuthFixture> = {}
) {
    coaches.push({
        id,
        created_at: iso(overrides.created_at ?? '2026-08-18T10:00:00Z'),
        persona: overrides.persona ?? null,
        primary_color: overrides.primary_color ?? '#1462DC',
        logo_url: overrides.logo_url ?? null,
        subscription_status: overrides.subscription_status ?? 'free',
        registration_ip: overrides.registration_ip ?? null,
        active_org_id: overrides.active_org_id ?? null,
    })
    authUsers[id] = {
        email,
        phone: overrides.phone ?? null,
        email_confirmed_at: overrides.email_confirmed_at ?? null,
    }
}

function seedClient(
    id: string,
    coachId: string,
    email: string,
    overrides: Partial<ClientFixture> & { last_sign_in_at?: string | null } = {}
) {
    clients.push({
        id,
        coach_id: coachId,
        email,
        created_at: iso(overrides.created_at ?? '2026-08-18T12:00:00Z'),
        phone: overrides.phone ?? null,
        is_demo: overrides.is_demo ?? false,
        is_archived: overrides.is_archived ?? false,
        org_id: overrides.org_id ?? null,
        team_id: overrides.team_id ?? null,
    })
    authUsers[id] = {
        email,
        last_sign_in_at: overrides.last_sign_in_at ? iso(overrides.last_sign_in_at) : null,
    }
}

const run = () => computeNorthStarWeeklyRow(makeAdmin(), { now: MONDAY_13_UTC })

beforeEach(() => {
    coaches = []
    clients = []
    authUsers = {}
})

describe('previousIsoWeekWindow', () => {
    it('un lunes 13:00 UTC reporta la semana ANTERIOR completa (lunes a lunes)', () => {
        const { desde, hasta, corte } = previousIsoWeekWindow(MONDAY_13_UTC)
        expect(desde.toISOString()).toBe('2026-08-17T00:00:00.000Z')
        expect(hasta.toISOString()).toBe('2026-08-24T00:00:00.000Z')
        // El corte de datos es `now`, no el fin de la ventana: «maduró» y «entró» se leen contra hoy.
        expect(corte.toISOString()).toBe('2026-08-24T13:00:00.000Z')
    })

    it('un domingo cae en la semana que empieza el lunes anterior', () => {
        const { desde, hasta } = previousIsoWeekWindow(new Date('2026-08-23T23:59:00.000Z'))
        expect(desde.toISOString()).toBe('2026-08-10T00:00:00.000Z')
        expect(hasta.toISOString()).toBe('2026-08-17T00:00:00.000Z')
    })
})

describe('computeNorthStarWeeklyRow — invitaron NS vs. cruda', () => {
    beforeEach(() => {
        // c1: alumno real que entró.
        seedCoach('c1', 'coach1@empresa.cl', { created_at: '2026-08-17T10:00:00Z' })
        seedClient('cl1', 'c1', 'alumno1@empresa.cl', { last_sign_in_at: '2026-08-18T10:00:00Z' })

        // c2: autoinvitado que SÍ captura `normalizePlatformEmail` (+alias, puntos, googlemail).
        seedCoach('c2', 'coach.two@gmail.com', { created_at: '2026-08-18T10:00:00Z' })
        seedClient('cl2', 'c2', 'coachtwo+alumno@googlemail.com', {
            last_sign_in_at: '2026-08-18T11:00:00Z',
        })

        // c3: el caso #28 — segundo correo sin parentesco textual, solo la lista manual lo caza.
        seedCoach('c3', 'palaciosjob98@gmail.com', { created_at: '2026-08-19T10:00:00Z' })
        seedClient('cl3', 'c3', 'jobpal46@gmail.com', { last_sign_in_at: '2026-08-19T10:05:00Z' })

        // c4: no invitó a nadie.
        seedCoach('c4', 'coach4@empresa.cl', { created_at: '2026-08-20T10:00:00Z' })

        // c5: cuenta de PRUEBA del dueño ⇒ fuera de la cohorte entera.
        seedCoach('c5', 'qa-embudo@evatest.cl', { created_at: '2026-08-20T11:00:00Z' })
        seedClient('cl5', 'c5', 'alumno-qa@evatest.cl', { last_sign_in_at: '2026-08-20T12:00:00Z' })
    })

    it('cuenta la cruda con autoinvitados y la NS sin ellos, y purga las cuentas de prueba', async () => {
        const row = await run()
        expect(row.semana).toBe('2026-08-17')
        expect(row.n).toBe(4) // c5 (@evatest.cl) fuera
        expect(row.invitaron_cruda).toBe(3) // c1 + c2 + c3
        expect(row.invitaron_ns).toBe(1) // solo c1
        expect(row.activados).toBe(1) // los dos autoinvitados entraron y NO cuentan
    })

    it('los alumnos NO se purgan por dominio: is_demo es lo que saca a los demo', async () => {
        // Alumno con dominio de prueba bajo un coach REAL: cuenta, porque no es demo.
        seedClient('cl6', 'c4', 'alumno@evatest.cl', { last_sign_in_at: '2026-08-21T10:00:00Z' })
        // Alumno demo del mismo coach: NO cuenta.
        seedClient('cl7', 'c4', 'demo@evatest.cl', {
            is_demo: true,
            last_sign_in_at: '2026-08-21T10:00:00Z',
        })
        const row = await run()
        expect(row.invitaron_ns).toBe(2) // c1 + c4
        expect(row.activados).toBe(2)
    })

    it('el predicado canónico saca archivados, org y team', async () => {
        seedClient('cl8', 'c4', 'archivado@empresa.cl', { is_archived: true })
        seedClient('cl9', 'c4', 'de-org@empresa.cl', { org_id: 'org-1' })
        seedClient('cl10', 'c4', 'de-team@empresa.cl', { team_id: 'team-1' })
        const row = await run()
        expect(row.invitaron_cruda).toBe(3) // c4 sigue sin alumnos válidos
        expect(row.invitaron_ns).toBe(1)
    })

    it('bajo n = 20 los tres guardarraíles de marca/persona van NULL, no 0', async () => {
        const row = await run()
        expect(row.n).toBeLessThan(20)
        expect(row.pct_marca_color).toBeNull()
        expect(row.pct_marca_logo).toBeNull()
        expect(row.pct_persona).toBeNull()
    })
})

describe('computeNorthStarWeeklyRow — madurez y North Star', () => {
    it('mide 72 h contra el corte y solo cuenta el login DENTRO de esas 72 h', async () => {
        // A: maduró y su alumno entró dentro de 72 h.
        seedCoach('a', 'a@empresa.cl', { created_at: '2026-08-17T10:00:00Z' })
        seedClient('a1', 'a', 'a1@empresa.cl', {
            created_at: '2026-08-17T12:00:00Z',
            last_sign_in_at: '2026-08-18T09:00:00Z',
        })

        // B: maduró pero su alumno entró al cuarto día ⇒ activado sí, activado_72h no.
        seedCoach('b', 'b@empresa.cl', { created_at: '2026-08-18T00:00:00Z' })
        seedClient('b1', 'b', 'b1@empresa.cl', {
            created_at: '2026-08-18T02:00:00Z',
            last_sign_in_at: '2026-08-22T00:00:00Z',
        })

        // C: alta del sábado tarde ⇒ todavía NO maduró a 72 h contra el corte del lunes 13:00.
        seedCoach('c', 'c@empresa.cl', { created_at: '2026-08-22T20:00:00Z' })
        seedClient('c1', 'c', 'c1@empresa.cl', {
            created_at: '2026-08-22T21:00:00Z',
            last_sign_in_at: '2026-08-22T22:00:00Z',
        })

        const row = await run()
        expect(row.n).toBe(3)
        expect(row.activados).toBe(3)
        expect(row.maduras_72h).toBe(2) // a y b; c no
        expect(row.activados_72h).toBe(1) // solo a
        expect(row.north_star_pct).toBe(50)
    })

    it('sin coaches maduros la North Star es null, no 0 %', async () => {
        seedCoach('z', 'z@empresa.cl', { created_at: '2026-08-23T20:00:00Z' })
        const row = await run()
        expect(row.maduras_72h).toBe(0)
        expect(row.north_star_pct).toBeNull()
    })

    it('la base de «active sin verificar a 7 d» es propia y va sin lectura bajo el mínimo', async () => {
        // Maduró a 7 días (17-08 10:00 + 7 d = 24-08 10:00 <= corte 13:00) y está en `active`.
        seedCoach('p', 'p@empresa.cl', {
            created_at: '2026-08-17T10:00:00Z',
            subscription_status: 'active',
            email_confirmed_at: null,
        })
        // `active` pero todavía no cumple 7 días ⇒ fuera de la base.
        seedCoach('q', 'q@empresa.cl', {
            created_at: '2026-08-20T10:00:00Z',
            subscription_status: 'active',
        })
        // Maduró pero no es `active` ⇒ fuera de la base.
        seedCoach('r', 'r@empresa.cl', {
            created_at: '2026-08-17T10:00:00Z',
            subscription_status: 'free',
        })

        const row = await run()
        expect(row.n_active_7d).toBe(1)
        expect(row.pct_active_sin_verificar_7d).toBeNull()
    })

    it('las guardas cuentan el login relámpago y el teléfono repetido del coach', async () => {
        seedCoach('g', 'g@empresa.cl', {
            created_at: '2026-08-18T10:00:00Z',
            phone: '+56 9 8765 4321',
        })
        // Entró 13 s después del alta y con el teléfono del propio coach.
        seedClient('g1', 'g', 'g1@empresa.cl', {
            created_at: '2026-08-18T10:05:00Z',
            last_sign_in_at: '2026-08-18T10:05:13Z',
            phone: '56987654321',
        })
        // Alumno normal: entró al día siguiente, con teléfono propio.
        seedClient('g2', 'g', 'g2@empresa.cl', {
            created_at: '2026-08-18T11:00:00Z',
            last_sign_in_at: '2026-08-19T11:00:00Z',
            phone: '+56 9 1111 2222',
        })

        const row = await run()
        expect(row.logins_bajo_120s).toBe(1)
        expect(row.mismo_fono).toBe(1)
        // La guarda NO filtra la métrica: los dos alumnos siguen contando.
        expect(row.invitaron_ns).toBe(1)
        expect(row.activados).toBe(1)
    })
})

describe('computeNorthStarWeeklyRow — guardarrailes con lectura', () => {
    /** 20 coaches: 5 con color propio, 4 con logo, 8 con persona, y 5 altas desde la misma IP. */
    function seedTwenty() {
        // Los DOS defaults históricos se reparten entre los 15 restantes: ninguno cuenta como marca.
        const defaults = ['#1462DC', '#10B981']
        for (let i = 0; i < 20; i++) {
            seedCoach(`k${i}`, `k${i}@empresa.cl`, {
                created_at: '2026-08-18T10:00:00Z',
                primary_color: i < 5 ? '#FF7A00' : defaults[i % 2],
                logo_url: i < 4 ? `https://cdn/logo-${i}.png` : null,
                persona: i < 8 ? 'entrenador' : null,
                registration_ip: i < 5 ? '190.0.0.1' : null,
            })
        }
    }

    it('con n = 20 los guardarraíles se leen; los dos colores default NO son marca propia', async () => {
        seedTwenty()
        const row = await run()
        expect(row.n).toBe(20)
        expect(row.pct_marca_color).toBe(25) // 5/20 — #1462DC y #10B981 excluidos
        expect(row.pct_marca_logo).toBe(20) // 4/20
        expect(row.pct_persona).toBe(40) // 8/20
        // 5 altas desde la misma IP con tope 3 ⇒ exceso 2.
        expect(row.altas_sobre_tope_ip).toBe(2)
    })

    it('con n = 19 vuelven a NULL: el piso es duro, no una sugerencia', async () => {
        seedTwenty()
        const dropped = coaches.pop()!
        delete authUsers[dropped.id]
        const row = await run()
        expect(row.n).toBe(19)
        expect(row.pct_marca_color).toBeNull()
        expect(row.pct_marca_logo).toBeNull()
        expect(row.pct_persona).toBeNull()
        // El exceso por IP no tiene piso: es un conteo, no un porcentaje.
        expect(row.altas_sobre_tope_ip).toBe(2)
    })
})

describe('buildNorthStarEmail', () => {
    const baseRow = {
        semana: '2026-08-17',
        desde: '2026-08-17T00:00:00.000Z',
        hasta: '2026-08-24T00:00:00.000Z',
        corte: '2026-08-24T13:00:00.000Z',
        n: 9,
        invitaron_ns: 3,
        invitaron_cruda: 4,
        activados: 2,
        maduras_72h: 8,
        activados_72h: 2,
        north_star_pct: 25,
        pct_marca_color: null,
        pct_marca_logo: null,
        pct_persona: null,
        altas_sobre_tope_ip: 0,
        pct_active_sin_verificar_7d: null,
        n_active_7d: 0,
        logins_bajo_120s: 1,
        mismo_fono: 0,
    }

    it('las celdas null se imprimen «sin lectura», nunca vacías ni 0 %', () => {
        const { subject, html } = buildNorthStarEmail(baseRow)
        expect(subject).toBe('North Star semanal — semana del 2026-08-17: 25,0 %')
        // Cuatro guardarraíles sin lectura + la nota al pie que explica el término.
        expect(html.split(SIN_LECTURA).length - 1).toBe(5)
        expect(html).not.toContain('0,0 %')
        // El `n` de cada indicador viaja con el indicador: sin él un porcentaje no se puede juzgar.
        expect(html).toContain('>n</th>')
        expect(html).toContain('>Indicador</th>')
    })

    it('con lectura imprime porcentajes en formato es-latam y el n de cada base', () => {
        const { html } = buildNorthStarEmail({
            ...baseRow,
            n: 24,
            pct_marca_color: 44.4,
            pct_marca_logo: 20,
            pct_persona: 40,
            pct_active_sin_verificar_7d: 12.5,
            n_active_7d: 24,
        })
        expect(html).toContain('44,4 %')
        expect(html).toContain('20,0 %')
        expect(html).toContain('12,5 %')
        expect(html).not.toContain(SIN_LECTURA + '</strong>')
    })
})
