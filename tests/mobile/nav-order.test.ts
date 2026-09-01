import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Orden de la barra + switch de dominios del POOL (QA del owner 01-09), capa de datos en
 * `apps/mobile/lib/mi-panel.ts`.
 *
 * Lo que este test pinnea:
 *  - la fila del orden es la RESERVADA `_nav` con `sections = { order: [...] }`, sin migración y sin
 *    pisar ningún dominio real (los demás lectores mapean por dominio y la ignoran);
 *  - el orden se guarda COMPLETO (los 5) y con `onConflict: 'coach_id,domain'`: un upsert sin
 *    conflicto declarado duplicaría la fila en cuanto el coach mueva dos veces;
 *  - «Ordenar mi panel según mi especialidad» BORRA la fila (si sobreviviera, el coach pediría el
 *    orden de su especialidad y la barra seguiría mostrando el que armó a mano);
 *  - el master switch del POOL preserva preset y toggles finos: apagar Cardio del equipo no puede
 *    borrarle las secciones de Nutrición a nadie;
 *  - ningún fallo de red/RLS rompe la pantalla: leer degrada a «sin orden», escribir devuelve un
 *    mensaje humano.
 *
 * GOTCHA de resolución (mismo patrón que `mi-panel.test.ts`): los ids bare resuelven distinto desde
 * `tests/` que desde `apps/mobile/`, así que `lib/supabase` se mockea por PATH ABSOLUTO con
 * `vi.doMock` + `import()` dinámico.
 */

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)

type Call = { table: string; op: string; args: unknown[] }

let calls: Call[] = []
/** Lo que devuelve `.maybeSingle()` (lectura de UNA fila). */
let singleRow: unknown = null
/** Lo que devuelve la cadena awaiteada sin `.maybeSingle()` (listados). */
let listRows: unknown[] = []
/** `error` que devuelve PostgREST en los writes. */
let writeError: { message: string } | null = null
let throwOnRead = false
let throwOnWrite = false

function opsFor(table: string, op: string): Call[] {
    return calls.filter((call) => call.table === table && call.op === op)
}

/** Filtros `.eq(col, value)` aplicados sobre una tabla, en orden. */
function eqFilters(table: string): [string, unknown][] {
    return opsFor(table, 'eq').map((call) => call.args as [string, unknown])
}

async function loadModule() {
    vi.resetModules()
    vi.doMock(mobileLib('api'), () => ({ apiFetch: async () => ({ ok: true }) }))
    vi.doMock(mobileLib('supabase'), () => ({
        supabase: {
            from: (table: string) => {
                const chain: Record<string, unknown> = {}
                const record = (op: string, args: unknown[]) => {
                    calls.push({ table, op, args })
                    return chain
                }
                Object.assign(chain, {
                    select: (columns?: string) => record('select', [columns]),
                    eq: (column: string, value: unknown) => record('eq', [column, value]),
                    in: (column: string, values: unknown) => record('in', [column, values]),
                    delete: () => record('delete', []),
                    upsert: (payload: unknown, options?: unknown) => record('upsert', [payload, options]),
                    maybeSingle: async () => {
                        if (throwOnRead) throw new Error('rls')
                        return { data: singleRow, error: null }
                    },
                    // La cadena es THENABLE como el builder de PostgREST: `await from().select().in()`
                    // y `await from().delete().eq()` resuelven acá.
                    then: (
                        resolve: (v: { data: unknown[]; error: { message: string } | null }) => unknown,
                        reject: (e: unknown) => unknown,
                    ) => {
                        if (throwOnRead || throwOnWrite) {
                            return Promise.reject(new Error('boom')).then(resolve, reject)
                        }
                        return Promise.resolve({ data: listRows, error: writeError }).then(resolve, reject)
                    },
                })
                return chain
            },
        },
    }))
    return import(mobileLib('mi-panel'))
}

beforeEach(() => {
    calls = []
    singleRow = null
    listRows = []
    writeError = null
    throwOnRead = false
    throwOnWrite = false
})

describe('navOrderFromRow', () => {
    it('lee `order` de la fila y valida', async () => {
        const { navOrderFromRow } = await loadModule()
        expect(navOrderFromRow({ order: ['cardio', 'nutrition', 'training', 'movement', 'bodycomp'] })).toEqual([
            'cardio',
            'nutrition',
            'training',
            'movement',
            'bodycomp',
        ])
    })

    it('completa los dominios que falten y descarta la basura', async () => {
        const { navOrderFromRow } = await loadModule()
        expect(navOrderFromRow({ order: ['bodycomp', 'nope', 'bodycomp'] })).toEqual([
            'bodycomp',
            'nutrition',
            'training',
            'cardio',
            'movement',
        ])
    })

    it('sin `order` (o con la fila rota) => null, nunca un orden a medias', async () => {
        const { navOrderFromRow } = await loadModule()
        for (const raw of [null, undefined, {}, { order: [] }, { order: 'cardio' }, ['cardio'], 7]) {
            expect(navOrderFromRow(raw)).toBeNull()
        }
    })
})

describe('buildNavOrderPayload', () => {
    it('escribe la fila RESERVADA `_nav`, no un dominio real', async () => {
        const { buildNavOrderPayload } = await loadModule()
        expect(buildNavOrderPayload('coach-1', ['cardio', 'nutrition'])).toEqual({
            coach_id: 'coach-1',
            domain: '_nav',
            sections: { order: ['cardio', 'nutrition'] },
        })
    })

    it('copia el array (mover otra vez no muta lo ya guardado)', async () => {
        const { buildNavOrderPayload } = await loadModule()
        const order: string[] = ['cardio', 'nutrition']
        const payload = buildNavOrderPayload('coach-1', order)
        order.push('training')
        expect(payload.sections.order).toEqual(['cardio', 'nutrition'])
    })
})

describe('readNavOrder', () => {
    it('consulta la fila `_nav` del coach y devuelve el orden guardado', async () => {
        const { readNavOrder } = await loadModule()
        singleRow = { sections: { order: ['movement', 'cardio', 'nutrition', 'training', 'bodycomp'] } }
        expect(await readNavOrder('coach-1')).toEqual([
            'movement',
            'cardio',
            'nutrition',
            'training',
            'bodycomp',
        ])
        expect(eqFilters('coach_feature_prefs')).toEqual([
            ['coach_id', 'coach-1'],
            ['domain', '_nav'],
        ])
    })

    it('sin fila guardada => null (el caller cae en el orden de la especialidad)', async () => {
        const { readNavOrder } = await loadModule()
        singleRow = null
        expect(await readNavOrder('coach-1')).toBeNull()
    })

    it('sin coachId no consulta nada', async () => {
        const { readNavOrder } = await loadModule()
        expect(await readNavOrder(null)).toBeNull()
        expect(calls).toHaveLength(0)
    })

    it('un fallo de RLS/red degrada a null, no rompe la pantalla', async () => {
        const { readNavOrder } = await loadModule()
        throwOnRead = true
        expect(await readNavOrder('coach-1')).toBeNull()
    })
})

describe('writeNavOrder', () => {
    it('upsertea la fila `_nav` con onConflict compuesto', async () => {
        const { writeNavOrder } = await loadModule()
        const result = await writeNavOrder('coach-1', ['cardio', 'nutrition', 'training', 'movement', 'bodycomp'])
        expect(result).toEqual({ ok: true })

        const [call] = opsFor('coach_feature_prefs', 'upsert')
        const payload = call.args[0] as Record<string, unknown>
        expect(payload.coach_id).toBe('coach-1')
        expect(payload.domain).toBe('_nav')
        expect(payload.sections).toEqual({
            order: ['cardio', 'nutrition', 'training', 'movement', 'bodycomp'],
        })
        expect(typeof payload.updated_at).toBe('string')
        expect(call.args[1]).toEqual({ onConflict: 'coach_id,domain' })
    })

    it('sin coachId no escribe', async () => {
        const { writeNavOrder } = await loadModule()
        expect(await writeNavOrder(null, ['cardio'])).toEqual({ error: 'No autenticado.' })
        expect(calls).toHaveLength(0)
    })

    it('un error de la base vuelve como mensaje humano, sin filtrar PostgREST', async () => {
        const { writeNavOrder } = await loadModule()
        writeError = { message: 'new row violates row-level security policy' }
        const result = await writeNavOrder('coach-1', ['cardio'])
        expect(result).toEqual({ error: 'No pudimos guardar el orden de tu panel. Inténtalo de nuevo.' })
    })

    it('un fallo de red tampoco se celebra', async () => {
        const { writeNavOrder } = await loadModule()
        throwOnWrite = true
        expect('ok' in (await writeNavOrder('coach-1', ['cardio']))).toBe(false)
    })
})

describe('clearNavOrder', () => {
    it('borra SOLO la fila `_nav` del coach', async () => {
        const { clearNavOrder } = await loadModule()
        expect(await clearNavOrder('coach-1')).toEqual({ ok: true })
        expect(opsFor('coach_feature_prefs', 'delete')).toHaveLength(1)
        expect(eqFilters('coach_feature_prefs')).toEqual([
            ['coach_id', 'coach-1'],
            ['domain', '_nav'],
        ])
    })

    it('sin coachId no hay nada que borrar (y no se llama a la base)', async () => {
        const { clearNavOrder } = await loadModule()
        expect(await clearNavOrder(null)).toEqual({ ok: true })
        expect(calls).toHaveLength(0)
    })

    it('un fallo al borrar se avisa (no se promete un reinicio que no pasó)', async () => {
        const { clearNavOrder } = await loadModule()
        throwOnWrite = true
        expect('ok' in (await clearNavOrder('coach-1'))).toBe(false)
    })
})

describe('writeTeamDomainEnabled', () => {
    it('pisa SOLO `_enabled` de la fila del POOL: preset y toggles finos sobreviven', async () => {
        const { writeTeamDomainEnabled } = await loadModule()
        singleRow = { preset: 'profesional', sections: { _enabled: true, micros_base: true } }

        expect(await writeTeamDomainEnabled('team-1', 'nutrition', false)).toEqual({ ok: true })

        const [upsert] = opsFor('team_feature_prefs', 'upsert')
        const payload = upsert.args[0] as Record<string, unknown>
        expect(payload.team_id).toBe('team-1')
        expect(payload.domain).toBe('nutrition')
        expect(payload.preset).toBe('profesional')
        expect(payload.sections).toEqual({ _enabled: false, micros_base: true })
        expect(upsert.args[1]).toEqual({ onConflict: 'team_id,domain' })
    })

    it('lee la fila del dominio antes de escribir (no adivina lo guardado)', async () => {
        const { writeTeamDomainEnabled } = await loadModule()
        await writeTeamDomainEnabled('team-1', 'cardio', true)
        expect(eqFilters('team_feature_prefs').slice(0, 2)).toEqual([
            ['team_id', 'team-1'],
            ['domain', 'cardio'],
        ])
    })

    it('sin fila previa arranca con el preset seguro y solo la key del master switch', async () => {
        const { writeTeamDomainEnabled } = await loadModule()
        singleRow = null
        await writeTeamDomainEnabled('team-1', 'movement', false)
        const payload = opsFor('team_feature_prefs', 'upsert')[0].args[0] as Record<string, unknown>
        expect(payload.preset).toBe('basico')
        expect(payload.sections).toEqual({ _enabled: false })
    })

    it('sin teamId no escribe nada', async () => {
        const { writeTeamDomainEnabled } = await loadModule()
        expect(await writeTeamDomainEnabled(null, 'cardio', true)).toEqual({
            error: 'Contexto de equipo inválido.',
        })
        expect(calls).toHaveLength(0)
    })

    it('el rechazo de la RLS de gestores llega como permiso, no como jerga', async () => {
        const { writeTeamDomainEnabled } = await loadModule()
        writeError = { message: 'new row violates row-level security policy for table "team_feature_prefs"' }
        expect(await writeTeamDomainEnabled('team-1', 'cardio', true)).toEqual({
            error: 'No tienes permiso para editar estas funciones.',
        })
    })
})

describe('loadTeamPanelDomains', () => {
    it('cruza las 5 filas del POOL con el catálogo', async () => {
        const { loadTeamPanelDomains } = await loadModule()
        listRows = [{ domain: 'cardio', preset: 'basico', sections: { _enabled: false } }]

        const rows = await loadTeamPanelDomains('team-1')

        expect(rows.map((row: { domain: string }) => row.domain)).toEqual([
            'nutrition',
            'training',
            'cardio',
            'movement',
            'bodycomp',
        ])
        expect(rows.find((row: { domain: string }) => row.domain === 'cardio')!.enabled).toBe(false)
        expect(rows.find((row: { domain: string }) => row.domain === 'nutrition')!.enabled).toBe(true)
        expect(eqFilters('team_feature_prefs')).toEqual([['team_id', 'team-1']])
        // La fila `_nav` no es un dominio: el listado pide explícitamente los 5.
        expect(opsFor('team_feature_prefs', 'in')[0].args[1]).toEqual([
            'nutrition',
            'training',
            'cardio',
            'movement',
            'bodycomp',
        ])
    })

    it('sin teamId (o con la lectura caída) degrada a panel completo', async () => {
        const { loadTeamPanelDomains } = await loadModule()
        expect((await loadTeamPanelDomains(null)).every((row: { enabled: boolean }) => row.enabled)).toBe(true)
        throwOnRead = true
        expect((await loadTeamPanelDomains('team-1')).every((row: { enabled: boolean }) => row.enabled)).toBe(
            true,
        )
    })
})
