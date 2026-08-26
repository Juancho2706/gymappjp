import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '@/infrastructure/db/interfaces'

vi.mock('@/services/billing/capacity.service', () => ({
    countActiveStandaloneClients: vi.fn(async () => 0),
}))

import {
    VIVE_TU_APP_ENTERED_CUTOVER,
    artifactCutoff,
    loadOnboardingSignalsDetailed,
    loadPersonaArtifactScope,
    readDemoPersona,
    readDemoSeededAt,
    resolveFirstArtifact,
    resolveViveTuAppOpened,
} from './onboarding-v2.queries'

/**
 * Paso 3 («tu primer artefacto») y paso 2 («vive tu app») de la guía. Dos reglas, las dos del QA
 * del owner:
 *  - W8.1.1: el alumno de ejemplo NO cuenta (el seed escribe justo esas filas).
 *  - W8.1.3: lo hecho en OTRA especialidad tampoco. El owner armó la rutina de Matías como fuerza,
 *    se pasó a rehabilitación y la guía le tildó «Haz el screening de 7 patrones de Pedro».
 *
 * Lo que se prueba es la REGLA, no Postgres: un cliente falso registra tabla y filtros de cada
 * consulta y devuelve lo que el caso le dice.
 */

const SEEDED_AT = '2026-08-22T12:00:00.000Z'
const CUTOFF = '2026-08-22T12:02:00.000Z'
/** El coach se pasó de rama DESPUÉS de sembrar el demo: ese es el corte que manda. */
const PERSONA_SET_AT = '2026-08-22T18:00:00.000Z'
const COACH = 'coach-1'

type Filter = { op: 'eq' | 'gt' | 'gte' | 'or'; column: string; value: string }
type Call = { table: string; filters: Filter[] }

/** Fila de `coach_onboarding_events` para los casos que distinguen `entered` de `opened`. */
type EventRow = { event_type: string; created_at: string }

/**
 * Qué devuelve cada consulta, según tabla y si lleva corte (`gt`/`gte`).
 *
 * `events` es la vía FINA: cuando está, la consulta se evalúa de verdad contra esas filas usando
 * la expresión `.or(...)` que armó el resolver. Hizo falta desde `vive-tu-app-directo` V1.16: el
 * paso 2 pasó a ser «(`entered` desde la epoch) o (`opened` antes del corte)» y el `total /
 * afterCutoff` de siempre no sabe distinguir un `entered` de un `opened`, así que un `.or()` mal
 * armado habría pasado el test por la razón equivocada.
 */
type Counts = Partial<Record<string, { total: number; afterCutoff?: number; events?: EventRow[] }>>

/** Separa por comas del NIVEL SUPERIOR (las de adentro de `and(...)` no cuentan). */
function splitTopLevel(expr: string): string[] {
    const parts: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < expr.length; i += 1) {
        const ch = expr[i]
        if (ch === '(') depth += 1
        else if (ch === ')') depth -= 1
        else if (ch === ',' && depth === 0) {
            parts.push(expr.slice(start, i))
            start = i + 1
        }
    }
    parts.push(expr.slice(start))
    return parts.filter((part) => part.length > 0)
}

/** Mini evaluador de un término PostgREST: `col.op.valor` o `and(term,term,…)`. */
function matchesTerm(row: EventRow, term: string): boolean {
    if (term.startsWith('and(') && term.endsWith(')')) {
        return splitTopLevel(term.slice(4, -1)).every((inner) => matchesTerm(row, inner))
    }
    const [column, op, ...rest] = term.split('.')
    // Los ISO traen puntos (`.000Z`): el valor se rearma con todo lo que sobró.
    const value = rest.join('.')
    const left = column === 'event_type' ? row.event_type : row.created_at
    if (op === 'eq') return left === value
    if (op === 'gte') return left >= value
    if (op === 'gt') return left > value
    if (op === 'lt') return left < value
    throw new Error(`operador no soportado en el fake: ${term}`)
}

/** `clients` se consulta dos veces con sentidos distintos: alumno real vs alumno de ejemplo. */
function keyFor(call: Call): string {
    if (call.table !== 'clients') return call.table
    const isDemo = call.filters.find((f) => f.op === 'eq' && f.column === 'is_demo')?.value
    return isDemo === 'true' ? 'clients:demo' : 'clients:real'
}

type Update = { table: string; payload: Record<string, unknown> }

function fakeDb(
    counts: Counts,
    coachRow: { onboarding_guide?: unknown; persona_set_at?: string | null },
    calls: Call[] = [],
    updates: Update[] = [],
): DbClient {
    const from = (table: string) => {
        const call: Call = { table, filters: [] }
        calls.push(call)
        const push = (op: Filter['op'], column: string, value: unknown) => {
            call.filters.push({ op, column, value: String(value) })
            return q
        }
        const q: Record<string, unknown> = {
            select: () => q,
            update: (payload: Record<string, unknown>) => {
                updates.push({ table, payload })
                return q
            },
            eq: (column: string, value: unknown) => push('eq', column, value),
            gt: (column: string, value: unknown) => push('gt', column, value),
            gte: (column: string, value: unknown) => push('gte', column, value),
            or: (expr: string) => push('or', expr, ''),
            limit: () => q,
            maybeSingle: async () => ({
                data: table === 'coaches' ? { onboarding_guide: null, persona_set_at: null, ...coachRow } : null,
                error: null,
            }),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
                const spec = counts[keyFor(call)] ?? { total: 0 }
                const or = call.filters.find((f) => f.op === 'or')

                // Vía FINA: filas reales evaluadas contra la expresión `.or(...)` del resolver.
                if (spec.events && or) {
                    const terms = splitTopLevel(or.column)
                    const rows = spec.events.filter((row) => terms.some((term) => matchesTerm(row, term)))
                    const data = rows.map((_, i) => ({ id: `row-${i}` }))
                    return Promise.resolve({ count: rows.length, data, error: null }).then(resolve, reject)
                }

                // Vía GRUESA (el resto de las señales): «¿la consulta lleva corte temporal?». El
                // corte puede venir como `.gte()` suelto o dentro de un `.or(...)`.
                const cut =
                    call.filters.some((f) => f.op === 'gt' || f.op === 'gte') ||
                    (or != null && or.column.includes('created_at.gte.'))
                const count = cut ? (spec.afterCutoff ?? 0) : spec.total
                const data = count > 0 ? Array.from({ length: count }, (_, i) => ({ id: `row-${i}` })) : []
                return Promise.resolve({ count, data, error: null }).then(resolve, reject)
            },
        }
        return q
    }
    return { from } as unknown as DbClient
}

const SEEDED_GUIDE = { demo: { version: 1, seededAt: SEEDED_AT, clientId: 'demo-1' } }

describe('readDemoSeededAt / artifactCutoff', () => {
    it('lee seededAt del inventario y le suma los 2 minutos de margen', () => {
        expect(readDemoSeededAt(SEEDED_GUIDE)).toBe(SEEDED_AT)
        expect(artifactCutoff(SEEDED_AT)).toBe(CUTOFF)
    })

    it('sin inventario (other, demo borrado, coach viejo) no hay corte', () => {
        expect(readDemoSeededAt(null)).toBeNull()
        expect(readDemoSeededAt({})).toBeNull()
        expect(readDemoSeededAt({ demo: null })).toBeNull()
        expect(readDemoSeededAt({ demo: { seededAt: 'no-es-fecha' } })).toBeNull()
        expect(artifactCutoff(null)).toBeNull()
        expect(artifactCutoff('')).toBeNull()
    })
})

describe('loadPersonaArtifactScope — el corte es el MÁS TARDÍO de los dos', () => {
    it('cambiar de especialidad después del seed manda: el corte pasa a ser `persona_set_at`', async () => {
        const scope = await loadPersonaArtifactScope(
            fakeDb({}, { onboarding_guide: SEEDED_GUIDE, persona_set_at: PERSONA_SET_AT }),
            COACH,
        )
        expect(scope.cutoff).toBe(PERSONA_SET_AT)
        expect(scope.personaEpoch).toBe(PERSONA_SET_AT)
    })

    it('coach de siempre en su rama: manda el corte del seed', async () => {
        const scope = await loadPersonaArtifactScope(
            fakeDb({}, { onboarding_guide: SEEDED_GUIDE, persona_set_at: '2026-08-22T11:00:00.000Z' }),
            COACH,
        )
        expect(scope.cutoff).toBe(CUTOFF)
    })

    it('sin demo ni persona (los 48 con persona NULL) no hay corte: se cuenta todo', async () => {
        const scope = await loadPersonaArtifactScope(fakeDb({}, {}), COACH)
        expect(scope.cutoff).toBeNull()
        expect(scope.personaEpoch).toBeNull()
    })

    it('un `persona_set_at` corrupto no recorta nada', async () => {
        const scope = await loadPersonaArtifactScope(fakeDb({}, { persona_set_at: 'ayer' }), COACH)
        expect(scope.personaEpoch).toBeNull()
        expect(scope.cutoff).toBeNull()
    })
})

describe('resolveFirstArtifact — el alumno de ejemplo no cuenta', () => {
    it('fuerza: solo el programa sembrado ⇒ el paso 3 sigue pendiente', async () => {
        const calls: Call[] = []
        const db = fakeDb({ workout_programs: { total: 1, afterCutoff: 0 } }, { onboarding_guide: SEEDED_GUIDE }, calls)
        expect(await resolveFirstArtifact(db, COACH, 'strength')).toBe(false)

        const programs = calls.find((c) => c.table === 'workout_programs')
        expect(programs?.filters).toEqual(
            expect.arrayContaining([
                { op: 'eq', column: 'coach_id', value: COACH },
                { op: 'gt', column: 'updated_at', value: CUTOFF },
            ]),
        )
    })

    it('fuerza: un programa nuevo (aunque sea para el demo: la tarea guiada) ⇒ hecho', async () => {
        const db = fakeDb({ workout_programs: { total: 2, afterCutoff: 1 } }, { onboarding_guide: SEEDED_GUIDE })
        expect(await resolveFirstArtifact(db, COACH, 'strength')).toBe(true)
    })

    it('nutrición: la pauta sembrada EDITADA ⇒ hecho; intacta ⇒ pendiente', async () => {
        expect(
            await resolveFirstArtifact(
                fakeDb({ nutrition_plans_v2: { total: 1, afterCutoff: 1 } }, { onboarding_guide: SEEDED_GUIDE }),
                COACH,
                'nutrition',
            ),
        ).toBe(true)
        expect(
            await resolveFirstArtifact(
                fakeDb({ nutrition_plans_v2: { total: 1, afterCutoff: 0 } }, { onboarding_guide: SEEDED_GUIDE }),
                COACH,
                'nutrition',
            ),
        ).toBe(false)
    })

    it('sin demo sembrado (other / persona null) se cuenta todo, como siempre', async () => {
        const calls: Call[] = []
        const db = fakeDb({ workout_programs: { total: 1 }, nutrition_plans_v2: { total: 0 } }, {}, calls)
        expect(await resolveFirstArtifact(db, COACH, 'other')).toBe(true)
        expect(calls.some((c) => c.filters.some((f) => f.op === 'gt'))).toBe(false)

        expect(
            await resolveFirstArtifact(
                fakeDb({ workout_programs: { total: 0 }, nutrition_plans_v2: { total: 1 } }, {}),
                COACH,
                null,
            ),
        ).toBe(true)
        expect(
            await resolveFirstArtifact(
                fakeDb({ workout_programs: { total: 0 }, nutrition_plans_v2: { total: 0 } }, {}),
                COACH,
                null,
            ),
        ).toBe(false)
    })
})

describe('resolveFirstArtifact — cada rama mira SU artefacto (bug del owner 22-08)', () => {
    const guiaDelOwner = { onboarding_guide: SEEDED_GUIDE, persona_set_at: PERSONA_SET_AT }

    it('rehabilitación: la rutina que armó como fuerza NO tilda el screening de Pedro', async () => {
        const calls: Call[] = []
        const db = fakeDb(
            { workout_programs: { total: 5, afterCutoff: 3 }, movement_assessments: { total: 1, afterCutoff: 0 } },
            guiaDelOwner,
            calls,
        )
        expect(await resolveFirstArtifact(db, COACH, 'rehab')).toBe(false)
        // Ni siquiera se pregunta por programas: la rama de rehabilitación es el screening.
        expect(calls.some((c) => c.table === 'workout_programs')).toBe(false)
    })

    it('rehabilitación: el screening hecho (posterior al corte) ⇒ hecho', async () => {
        const db = fakeDb({ movement_assessments: { total: 2, afterCutoff: 1 } }, guiaDelOwner)
        expect(await resolveFirstArtifact(db, COACH, 'rehab')).toBe(true)
    })

    it('resistencia: un programa de otra rama no cuenta; el perfil cardio del demo intacto tampoco', async () => {
        const calls: Call[] = []
        const db = fakeDb(
            {
                workout_programs: { total: 5, afterCutoff: 3 },
                'clients:real': { total: 0 },
                'clients:demo': { total: 1, afterCutoff: 0 },
            },
            guiaDelOwner,
            calls,
        )
        expect(await resolveFirstArtifact(db, COACH, 'endurance')).toBe(false)
        expect(calls.some((c) => c.table === 'workout_programs')).toBe(false)

        const real = calls.find((c) => keyFor(c) === 'clients:real')
        expect(real?.filters).toEqual(
            expect.arrayContaining([
                { op: 'eq', column: 'is_archived', value: 'false' },
                { op: 'eq', column: 'is_demo', value: 'false' },
            ]),
        )
    })

    it('resistencia: las zonas de Javiera REVISADAS después del corte ⇒ hecho (es la tarea guiada)', async () => {
        const db = fakeDb(
            { 'clients:real': { total: 0 }, 'clients:demo': { total: 1, afterCutoff: 1 } },
            guiaDelOwner,
        )
        expect(await resolveFirstArtifact(db, COACH, 'endurance')).toBe(true)
    })

    it('resistencia: un alumno real con FC de reposo o marca de 5K ⇒ hecho', async () => {
        const db = fakeDb({ 'clients:real': { total: 1 }, 'clients:demo': { total: 0 } }, guiaDelOwner)
        expect(await resolveFirstArtifact(db, COACH, 'endurance')).toBe(true)
    })

    it('resistencia sin corte alguno: no se inventa la rama del demo', async () => {
        const calls: Call[] = []
        const db = fakeDb({ 'clients:real': { total: 0 }, 'clients:demo': { total: 9 } }, {}, calls)
        expect(await resolveFirstArtifact(db, COACH, 'endurance')).toBe(false)
        expect(calls.some((c) => keyFor(c) === 'clients:demo')).toBe(false)
    })
})

describe('resolveViveTuAppOpened — el paso 2 se tilda cuando el coach ENTRÓ', () => {
    /** Un instante después del corte: lo que el resolver ya no acepta como `opened`. */
    const DESPUES_DEL_CORTE = new Date(Date.parse(VIVE_TU_APP_ENTERED_CUTOVER) + 60_000).toISOString()
    const ANTES_DEL_CORTE = '2026-08-22T19:00:00.000Z'
    const events = (...rows: EventRow[]) => ({ coach_onboarding_events: { total: 0, events: rows } })

    it('la consulta es un `.or()` con las dos ramas, no dos `.eq` imposibles', async () => {
        const calls: Call[] = []
        const db = fakeDb(events(), {}, calls)
        await resolveViveTuAppOpened(db, COACH, PERSONA_SET_AT)

        const or = calls[0].filters.find((f) => f.op === 'or')
        expect(or).toBeDefined()
        expect(or?.column).toContain(`and(event_type.eq.vive_tu_app_entered,created_at.gte.${PERSONA_SET_AT})`)
        expect(or?.column).toContain(
            `and(event_type.eq.vive_tu_app_opened,created_at.lt.${VIVE_TU_APP_ENTERED_CUTOVER},created_at.gte.${PERSONA_SET_AT})`,
        )
        // Un `.eq('event_type', …)` suelto convertiría el `.or()` en una conjunción imposible.
        expect(calls[0].filters.some((f) => f.op === 'eq' && f.column === 'event_type')).toBe(false)
    })

    it('con especialidad nueva, el evento viejo no cuenta', async () => {
        const db = fakeDb(events({ event_type: 'vive_tu_app_opened', created_at: '2026-08-22T13:00:00.000Z' }), {})
        expect(await resolveViveTuAppOpened(db, COACH, PERSONA_SET_AT)).toBe(false)
    })

    it('sin especialidad fechada se cuenta todo (coach viejo)', async () => {
        const db = fakeDb(events({ event_type: 'vive_tu_app_opened', created_at: ANTES_DEL_CORTE }), {})
        expect(await resolveViveTuAppOpened(db, COACH, null)).toBe(true)
    })

    it('grandfather: el `opened` de la rama nueva ANTERIOR al corte sigue tildando', async () => {
        // Los 6 coaches que ya tenían el paso 2 tildado con el significado viejo no lo pierden.
        const db = fakeDb(events({ event_type: 'vive_tu_app_opened', created_at: ANTES_DEL_CORTE }), {})
        expect(await resolveViveTuAppOpened(db, COACH, PERSONA_SET_AT)).toBe(true)
    })

    it('un `opened` POSTERIOR al corte ya no tilda: desde ahí existe la señal honesta', async () => {
        const db = fakeDb(events({ event_type: 'vive_tu_app_opened', created_at: DESPUES_DEL_CORTE }), {})
        expect(await resolveViveTuAppOpened(db, COACH, PERSONA_SET_AT)).toBe(false)
    })

    it('`vive_tu_app_entered` tilda, sin importar el corte', async () => {
        const db = fakeDb(events({ event_type: 'vive_tu_app_entered', created_at: DESPUES_DEL_CORTE }), {})
        expect(await resolveViveTuAppOpened(db, COACH, PERSONA_SET_AT)).toBe(true)
    })

    it('un `entered` ANTERIOR a la especialidad actual no cuenta (entró como Matías, no como Pedro)', async () => {
        const db = fakeDb(events({ event_type: 'vive_tu_app_entered', created_at: '2026-08-22T13:00:00.000Z' }), {})
        expect(await resolveViveTuAppOpened(db, COACH, PERSONA_SET_AT)).toBe(false)
    })

    it('otro evento del onboarding nunca tilda el paso 2', async () => {
        const db = fakeDb(events({ event_type: 'demo_seeded', created_at: DESPUES_DEL_CORTE }), {})
        expect(await resolveViveTuAppOpened(db, COACH, null)).toBe(false)
    })
})

describe('loadOnboardingSignalsDetailed — memoria por especialidad', () => {
    const brand = { logo_url: null, theme_preset_key: null, primary_color: null }

    beforeEach(() => vi.clearAllMocks())

    it('el owner se pasa a rehabilitación: los pasos 2 y 3 vuelven a estar pendientes', async () => {
        const db = fakeDb(
            {
                coach_onboarding_events: { total: 4, afterCutoff: 0 },
                movement_assessments: { total: 1, afterCutoff: 0 },
            },
            {
                onboarding_guide: {
                    ...SEEDED_GUIDE,
                    completed: { profile_branding: true, vive_tu_app: true, first_artifact: true },
                    progress: { strength: { vive_tu_app: true, first_artifact: true } },
                },
                persona_set_at: PERSONA_SET_AT,
            },
        )

        const { signals, personaProgress } = await loadOnboardingSignalsDetailed(db, COACH, 'rehab', brand)
        expect(signals.viveTuAppOpened).toBe(false)
        expect(signals.hasFirstArtifact).toBe(false)
        expect(personaProgress).toEqual({})
    })

    it('y al volver a fuerza recupera lo que hizo en fuerza sin re-consultar nada', async () => {
        const db = fakeDb(
            {
                coach_onboarding_events: { total: 4, afterCutoff: 0 },
                workout_programs: { total: 3, afterCutoff: 0 },
            },
            {
                onboarding_guide: {
                    ...SEEDED_GUIDE,
                    progress: { strength: { vive_tu_app: true, first_artifact: true } },
                },
                persona_set_at: PERSONA_SET_AT,
            },
        )

        const { signals, personaProgress } = await loadOnboardingSignalsDetailed(db, COACH, 'strength', brand)
        expect(signals.viveTuAppOpened).toBe(true)
        expect(signals.hasFirstArtifact).toBe(true)
        expect(personaProgress).toEqual({ vive_tu_app: true, first_artifact: true })
    })

    it('la memoria de una rama no se filtra a la otra', async () => {
        const guide = {
            ...SEEDED_GUIDE,
            progress: { strength: { first_artifact: true }, nutrition: { vive_tu_app: true } },
        }
        const db = fakeDb({}, { onboarding_guide: guide, persona_set_at: PERSONA_SET_AT })

        const nutricion = await loadOnboardingSignalsDetailed(db, COACH, 'nutrition', brand)
        expect(nutricion.signals.viveTuAppOpened).toBe(true)
        expect(nutricion.signals.hasFirstArtifact).toBe(false)

        const fuerza = await loadOnboardingSignalsDetailed(db, COACH, 'strength', brand)
        expect(fuerza.signals.viveTuAppOpened).toBe(false)
        expect(fuerza.signals.hasFirstArtifact).toBe(true)
    })
})

describe('backfill de una sola vez (coaches que ya se habían cambiado de rama)', () => {
    const brand = { logo_url: null, theme_preset_key: null, primary_color: null }

    beforeEach(() => vi.clearAllMocks())

    it('lee la rama del alumno de ejemplo del inventario', () => {
        expect(readDemoPersona({ demo: { persona: 'strength', clientId: 'x' } })).toBe('strength')
        expect(readDemoPersona({ demo: { clientId: 'x' } })).toBeNull()
        expect(readDemoPersona({ demo: { persona: 'marciano' } })).toBeNull()
        expect(readDemoPersona(null)).toBeNull()
    })

    it('el caso del owner: lo tildado se archiva en fuerza (la rama del demo) y rehab arranca limpia', async () => {
        const updates: Update[] = []
        const db = fakeDb(
            {},
            {
                onboarding_guide: {
                    demo: { version: 1, persona: 'strength', seededAt: SEEDED_AT, clientId: 'matias-1' },
                    completed: { profile_branding: true, vive_tu_app: true, first_artifact: true },
                },
                persona_set_at: PERSONA_SET_AT,
            },
            [],
            updates,
        )

        const { signals, personaProgress } = await loadOnboardingSignalsDetailed(db, COACH, 'rehab', brand)

        expect(signals.viveTuAppOpened).toBe(false)
        expect(signals.hasFirstArtifact).toBe(false)
        expect(personaProgress).toEqual({})

        const guide = updates[0].payload.onboarding_guide as Record<string, unknown>
        expect(guide.progress).toEqual({ strength: { vive_tu_app: true, first_artifact: true } })
        expect(guide.completed).toEqual({
            profile_branding: true,
            vive_tu_app: false,
            first_artifact: false,
        })
    })

    it('con `progress` ya escrito no se vuelve a migrar nunca', async () => {
        const updates: Update[] = []
        const db = fakeDb(
            {},
            {
                onboarding_guide: {
                    demo: { persona: 'strength', clientId: 'matias-1' },
                    completed: { vive_tu_app: true, first_artifact: true },
                    progress: {},
                },
            },
            [],
            updates,
        )

        await loadOnboardingSignalsDetailed(db, COACH, 'rehab', brand)
        expect(updates).toHaveLength(0)
    })

    it('sin demo al que atribuir (o sin nada tildado) no se escribe nada', async () => {
        const sinDemo: Update[] = []
        await loadOnboardingSignalsDetailed(
            fakeDb({}, { onboarding_guide: { completed: { first_artifact: true } } }, [], sinDemo),
            COACH,
            'rehab',
            brand,
        )
        expect(sinDemo).toHaveLength(0)

        const sinTildes: Update[] = []
        await loadOnboardingSignalsDetailed(
            fakeDb({}, { onboarding_guide: { demo: { persona: 'strength', clientId: 'm' } } }, [], sinTildes),
            COACH,
            'rehab',
            brand,
        )
        expect(sinTildes).toHaveLength(0)
    })

    it('coach sin especialidad: no se le toca nada', async () => {
        const updates: Update[] = []
        await loadOnboardingSignalsDetailed(
            fakeDb(
                {},
                { onboarding_guide: { demo: { persona: 'strength', clientId: 'm' }, completed: { vive_tu_app: true } } },
                [],
                updates,
            ),
            COACH,
            null,
            brand,
        )
        expect(updates).toHaveLength(0)
    })
})
