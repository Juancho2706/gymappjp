import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    buildSurfaceFunnelSection,
    computeSurfaceFunnelReport,
    surfaceRowKey,
    type SurfaceFunnel,
} from './surface-funnel.service'

/**
 * Embudo por superficie (B4 del plan «Activación»).
 *
 * Lo que se pinnea acá:
 *  · ventanas: la semana ISO cerrada (misma cohorte que la North Star) y las 4 semanas cerradas;
 *  · cada etapa sale de su tabla: demo = `vive_tu_app_entered`, sumó = alumno real (sin demo, sin
 *    archivados y sin autoinvitados), entró = `first_login_at`, lo usa = entreno o comida;
 *  · las cuentas de prueba y los coaches de organización no entran;
 *  · la superficie desconocida o nula cae en «Sin dato», y las filas opcionales solo aparecen
 *    cuando tienen altas.
 */

const MONDAY_13_UTC = new Date('2026-08-24T13:00:00.000Z')

type Row = Record<string, unknown>

let tables: Record<string, Row[]> = {}
let authEmails: Record<string, string> = {}

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
    return {
        auth: {
            admin: {
                getUserById: async (id: string) => {
                    const email = authEmails[id]
                    if (!email) return { data: { user: null }, error: null }
                    return {
                        data: {
                            user: { id, email, phone: null, email_confirmed_at: null, last_sign_in_at: null },
                        },
                        error: null,
                    }
                },
            },
        },
        from: (table: string) => ({ select: () => makeChain(tables[table] ?? []) }),
    } as unknown as SupabaseClient<Database>
}

const iso = (s: string) => new Date(s).toISOString()

function coach(id: string, createdAt: string, surface: string | null, extra: Row = {}): Row {
    return {
        id,
        created_at: iso(createdAt),
        persona: null,
        primary_color: '#1462DC',
        logo_url: null,
        subscription_status: 'active',
        registration_ip: null,
        signup_surface: surface,
        active_org_id: null,
        ...extra,
    }
}

function client(id: string, coachId: string, email: string, extra: Row = {}): Row {
    return {
        id,
        coach_id: coachId,
        email,
        first_login_at: null,
        created_at: iso('2026-08-20T12:00:00Z'),
        is_demo: false,
        is_archived: false,
        org_id: null,
        team_id: null,
        ...extra,
    }
}

const counts = (f: SurfaceFunnel, key: string) => f.rows.find((r) => r.key === key)?.counts

beforeEach(() => {
    authEmails = {
        c_desk: 'desk@gmail.com',
        c_phone: 'phone@gmail.com',
        c_ios: 'ios@gmail.com',
        c_old: 'old@gmail.com',
        c_null: 'nulo@gmail.com',
        c_test: 'qa@evatest.cl',
        c_org: 'org@gmail.com',
    }
    tables = {
        coaches: [
            // Semana cerrada (17→24-08).
            coach('c_desk', '2026-08-18T10:00:00Z', 'web_desktop'),
            coach('c_phone', '2026-08-19T10:00:00Z', 'web_mobile'),
            coach('c_ios', '2026-08-20T10:00:00Z', 'app_ios'),
            // Dentro de las 4 semanas pero fuera de la semana cerrada.
            coach('c_old', '2026-07-30T10:00:00Z', 'web_mobile'),
            coach('c_null', '2026-08-03T10:00:00Z', null),
            // Fuera de la cohorte: cuenta de prueba y coach de organización.
            coach('c_test', '2026-08-18T11:00:00Z', 'web_desktop'),
            coach('c_org', '2026-08-18T12:00:00Z', 'web_desktop', { active_org_id: 'org-1' }),
        ],
        coach_onboarding_events: [
            { id: 'e1', coach_id: 'c_phone', event_type: 'vive_tu_app_entered', created_at: iso('2026-08-19T11:00:00Z') },
            { id: 'e2', coach_id: 'c_ios', event_type: 'vive_tu_app_opened', created_at: iso('2026-08-20T11:00:00Z') },
            { id: 'e3', coach_id: 'c_old', event_type: 'vive_tu_app_entered', created_at: iso('2026-07-30T11:00:00Z') },
        ],
        clients: [
            // c_phone: alumno real que entró y entrena.
            client('k1', 'c_phone', 'alumna@gmail.com', { first_login_at: iso('2026-08-21T09:00:00Z') }),
            // c_ios: alumno real que nunca entró, más un demo que no cuenta.
            client('k2', 'c_ios', 'alumno@gmail.com'),
            client('k3', 'c_ios', 'demo@evatest.cl', { is_demo: true }),
            // c_desk: solo se autoinvitó (mismo correo con +alias) ⇒ no suma.
            client('k4', 'c_desk', 'desk+alumno@gmail.com', { first_login_at: iso('2026-08-18T12:00:00Z') }),
            // c_old: alumno real que entró y solo registró comida.
            client('k5', 'c_old', 'otro@gmail.com', { first_login_at: iso('2026-08-01T09:00:00Z') }),
            // c_null: alumno archivado ⇒ no suma.
            client('k6', 'c_null', 'arch@gmail.com', { is_archived: true }),
        ],
        workout_logs: [
            { id: 'w1', client_id: 'k1' },
            { id: 'w2', client_id: 'k4' },
        ],
        nutrition_intake_entries: [{ id: 'n1', client_id: 'k5' }],
    }
})

describe('computeSurfaceFunnelReport', () => {
    it('semana cerrada: una fila por superficie con sus etapas', async () => {
        const report = await computeSurfaceFunnelReport(makeAdmin(), { now: MONDAY_13_UTC })

        expect(report.semana.desde).toBe('2026-08-17T00:00:00.000Z')
        expect(report.semana.hasta).toBe('2026-08-24T00:00:00.000Z')
        expect(report.semana.total).toEqual({ registros: 3, demo: 1, sumo: 2, entro: 1, usa: 1 })
        expect(counts(report.semana, 'web_desktop')).toEqual({ registros: 1, demo: 0, sumo: 0, entro: 0, usa: 0 })
        expect(counts(report.semana, 'web_mobile')).toEqual({ registros: 1, demo: 1, sumo: 1, entro: 1, usa: 1 })
        expect(counts(report.semana, 'app_ios')).toEqual({ registros: 1, demo: 0, sumo: 1, entro: 0, usa: 0 })
        expect(counts(report.semana, 'app_android')).toEqual({ registros: 0, demo: 0, sumo: 0, entro: 0, usa: 0 })
        // Filas opcionales sin altas: no se imprimen.
        expect(counts(report.semana, 'sin_dato')).toBeUndefined()
        expect(counts(report.semana, 'app_unknown')).toBeUndefined()
    })

    it('4 semanas: suma la cohorte anterior y muestra «Sin dato» cuando hay altas sin superficie', async () => {
        const report = await computeSurfaceFunnelReport(makeAdmin(), { now: MONDAY_13_UTC })

        expect(report.cuatroSemanas.desde).toBe('2026-07-27T00:00:00.000Z')
        expect(report.cuatroSemanas.total).toEqual({ registros: 5, demo: 2, sumo: 3, entro: 2, usa: 2 })
        expect(counts(report.cuatroSemanas, 'web_mobile')).toEqual({ registros: 2, demo: 2, sumo: 2, entro: 2, usa: 2 })
        expect(counts(report.cuatroSemanas, 'sin_dato')).toEqual({ registros: 1, demo: 0, sumo: 0, entro: 0, usa: 0 })
    })
})

describe('surfaceRowKey', () => {
    it('valores conocidos pasan; nulo o desconocido ⇒ sin_dato', () => {
        expect(surfaceRowKey('app_android')).toBe('app_android')
        expect(surfaceRowKey(null)).toBe('sin_dato')
        expect(surfaceRowKey('pwa')).toBe('sin_dato')
        expect(surfaceRowKey('sin_dato')).toBe('sin_dato')
    })
})

describe('buildSurfaceFunnelSection', () => {
    it('imprime los dos cuadros con porcentajes sobre los registros de la fila', async () => {
        const report = await computeSurfaceFunnelReport(makeAdmin(), { now: MONDAY_13_UTC })
        const html = buildSurfaceFunnelSection(report)

        expect(html).toContain('Embudo por superficie')
        expect(html).toContain('Semana cerrada')
        expect(html).toContain('Últimas 4 semanas')
        expect(html).toContain('Teléfono (navegador / PWA)')
        // Total de la semana: 2 de 3 sumaron alumno.
        expect(html).toContain('2 <span style="color:#71717a">(67 %)</span>')
    })

    it('sin reporte avisa que no se pudo calcular', () => {
        expect(buildSurfaceFunnelSection(null)).toContain('No se pudo calcular')
    })
})
