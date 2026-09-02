import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cron `purge-data` — retención y borrado definitivo.
 *
 * Lo que se pinnea acá:
 *  · fail-closed de la auth (sin `CRON_SECRET` no entra nadie, ni con el header correcto);
 *  · la purga a 30 días de las cuentas dadas de baja en-app (Apple 5.1.1(v) + Ley 21.719): hasta hoy
 *    `/api/mobile/account/delete` dejaba `deletion_requested_at` en `app_metadata` y NADIE lo leía;
 *  · la LISTA DE EXCLUSIÓN DURA de App Review: esas dos cuentas jamás se borran, aunque traigan el
 *    flag vencido — borrarlas deja al revisor de Apple sin credenciales (guideline 2.1(a));
 *  · el orden del borrado de un coach: sus alumnos UNO A UNO antes que él (si no, sus `auth.users`
 *    quedan como logins zombie) y las tablas con FK NO ACTION vaciadas antes del `deleteUser`;
 *  · best-effort: una cuenta rota no puede frenar la cola ni tumbar el resto del cron;
 *  · retención de `coach_leads` a 90 días, solo `new`/`dismissed` (decisión del owner 2026-09-02).
 */

type Result = { data?: unknown; error?: unknown; count?: number }
type Call = { table: string; op: string; args: unknown[] }

const calls: Call[] = []
let tableResults: Record<string, Result> = {}

const CHAIN_METHODS = ['select', 'delete', 'insert', 'update', 'eq', 'in', 'lt', 'lte', 'gt', 'not', 'order', 'limit']

function makeBuilder(table: string) {
    const result = () => tableResults[table] ?? { data: null, error: null, count: 0 }
    /** Builder encadenable de mentira: todo método devuelve `builder` y el `then` resuelve el Result. */
    const builder: Record<string, unknown> = {}
    for (const method of CHAIN_METHODS) {
        builder[method] = (...args: unknown[]) => {
            calls.push({ table, op: method, args })
            return builder
        }
    }
    builder.maybeSingle = async () => result()
    builder.single = async () => result()
    builder.then = (
        onOk?: (v: Result) => unknown,
        onErr?: (e: unknown) => unknown
    ) => Promise.resolve(result()).then(onOk, onErr)
    return builder
}

const listUsers = vi.fn(async (_params: { page: number; perPage: number }) => ({
    data: { users: [] as unknown[] },
    error: null as { message: string } | null,
}))
const deleteUser = vi.fn(async (_id: string) => ({ error: null as { message: string } | null }))
const rpc = vi.fn(async () => ({ error: null }))

const admin = {
    from: (table: string) => makeBuilder(table),
    rpc,
    auth: { admin: { listUsers, deleteUser } },
}

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => admin }))

const deleteClientHard = vi.fn(async (_db: unknown, _id: string) => ({ error: undefined as string | undefined }))
vi.mock('@/services/client/client-deletion.service', () => ({
    deleteClientHard: (...a: unknown[]) => deleteClientHard(a[0], a[1] as string),
}))

import { GET } from './route'

const SECRET = 'cron-sekret'
const NOW = '2026-09-02T03:00:00.000Z'
const authedReq = () =>
    new Request('https://eva/api/cron/purge-data', { headers: { authorization: `Bearer ${SECRET}` } })

/** ISO de hace `days` días respecto de NOW. */
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString()

const authUser = (id: string, requestedAt: string | null, email = `${id}@ejemplo.cl`) => ({
    id,
    email,
    app_metadata: requestedAt ? { deletion_requested_at: requestedAt, provider: 'email' } : { provider: 'email' },
    user_metadata: {},
})

let silenced: Array<{ mockRestore: () => void }> = []

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    vi.stubEnv('CRON_SECRET', SECRET)
    calls.length = 0
    tableResults = {}
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    deleteUser.mockResolvedValue({ error: null })
    deleteClientHard.mockResolvedValue({ error: undefined })
    silenced = [
        vi.spyOn(console, 'info').mockImplementation(() => {}),
        vi.spyOn(console, 'warn').mockImplementation(() => {}),
        vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]
})

afterEach(() => {
    for (const spy of silenced) spy.mockRestore()
    vi.unstubAllEnvs()
    vi.useRealTimers()
})

const callsFor = (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op)

describe('GET /api/cron/purge-data — auth', () => {
    it('sin CRON_SECRET en el env → 401 y no barre nada', async () => {
        vi.stubEnv('CRON_SECRET', '')
        const res = await GET(authedReq())
        expect(res.status).toBe(401)
        expect(listUsers).not.toHaveBeenCalled()
        expect(calls).toHaveLength(0)
    })

    it('Authorization incorrecto → 401', async () => {
        const res = await GET(
            new Request('https://eva/api/cron/purge-data', { headers: { authorization: 'Bearer malo' } })
        )
        expect(res.status).toBe(401)
        expect(listUsers).not.toHaveBeenCalled()
    })

    it('sin header Authorization → 401', async () => {
        expect((await GET(new Request('https://eva/api/cron/purge-data'))).status).toBe(401)
    })
})

describe('GET /api/cron/purge-data — coach_leads (retención 90 días)', () => {
    it('borra solo `new`/`dismissed` con created_at anterior al corte de 90 días', async () => {
        tableResults['coach_leads'] = { count: 7, error: null }

        const res = await GET(authedReq())
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.leadsPurged).toBe(7)

        expect(callsFor('coach_leads', 'delete')).toHaveLength(1)
        expect(callsFor('coach_leads', 'in')[0].args).toEqual(['status', ['new', 'dismissed']])
        expect(callsFor('coach_leads', 'lt')[0].args).toEqual(['created_at', daysAgo(90)])
    })

    it('`converted`/`contacted` nunca entran en el filtro (se conservan)', async () => {
        await GET(authedReq())
        const statuses = callsFor('coach_leads', 'in')[0].args[1] as string[]
        expect(statuses).not.toContain('converted')
        expect(statuses).not.toContain('contacted')
    })

    it('si el borrado de leads falla, suma a `errors` pero el cron sigue y responde 200', async () => {
        tableResults['coach_leads'] = { error: { message: 'permission denied' } }
        listUsers.mockResolvedValue({ data: { users: [authUser('u1', daysAgo(40))] }, error: null })

        const res = await GET(authedReq())
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.errors).toBeGreaterThanOrEqual(1)
        expect(json.leadsPurged).toBe(0)
        // El barrido de bajas corre igual: un fallo de leads no puede tapar la purga de Apple.
        expect(json.accounts.deleted).toBe(1)
    })
})

describe('GET /api/cron/purge-data — purga de cuentas a 30 días', () => {
    it('alumno con pedido de baja de hace 40 días → se borra duro', async () => {
        listUsers.mockResolvedValue({ data: { users: [authUser('alumno-1', daysAgo(40))] }, error: null })

        const res = await GET(authedReq())
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(deleteClientHard).toHaveBeenCalledTimes(1)
        expect(deleteClientHard.mock.calls[0][1]).toBe('alumno-1')
        expect(json.accounts).toMatchObject({ due: 1, deleted: 1, failed: 0, protectedSkipped: 0 })
    })

    it('pedido de hace 10 días → todavía NO se toca', async () => {
        listUsers.mockResolvedValue({ data: { users: [authUser('alumno-2', daysAgo(10))] }, error: null })

        const json = await (await GET(authedReq())).json()

        expect(deleteClientHard).not.toHaveBeenCalled()
        expect(deleteUser).not.toHaveBeenCalled()
        expect(json.accounts).toMatchObject({ scanned: 1, due: 0, deleted: 0 })
    })

    it('usuario sin `deletion_requested_at` nunca entra a la cola', async () => {
        listUsers.mockResolvedValue({ data: { users: [authUser('activo', null)] }, error: null })

        const json = await (await GET(authedReq())).json()

        expect(deleteClientHard).not.toHaveBeenCalled()
        expect(deleteUser).not.toHaveBeenCalled()
        expect(json.accounts).toMatchObject({ scanned: 1, due: 0, deleted: 0 })
    })

    it('`deletion_requested_at` basura se ignora en vez de borrar por las dudas', async () => {
        listUsers.mockResolvedValue({
            data: { users: [authUser('raro', 'no-es-una-fecha')] },
            error: null,
        })

        const json = await (await GET(authedReq())).json()

        expect(deleteClientHard).not.toHaveBeenCalled()
        expect(json.accounts).toMatchObject({ due: 0, deleted: 0 })
    })

    it('coach: alumnos primero, tablas NO ACTION después, deleteUser al final', async () => {
        listUsers.mockResolvedValue({ data: { users: [authUser('coach-1', daysAgo(31))] }, error: null })
        tableResults['coaches'] = { data: { id: 'coach-1' }, error: null }
        tableResults['clients'] = { data: [{ id: 'al-1' }, { id: 'al-2' }], error: null }

        const json = await (await GET(authedReq())).json()

        expect(deleteClientHard.mock.calls.map((c) => c[1])).toEqual(['al-1', 'al-2'])
        // Las tres tablas cuyo FK a coaches(id) es NO ACTION: sin vaciarlas el deleteUser explota.
        for (const table of ['nutrition_plans', 'saved_meals', 'foods']) {
            expect(callsFor(table, 'delete')).toHaveLength(1)
            expect(callsFor(table, 'eq')[0].args).toEqual(['coach_id', 'coach-1'])
        }
        // Y en ESE orden (`purgeCoachOwnedRows`): `nutrition_plans` cascadea `nutrition_meals` →
        // `food_items`, cuyo FK a `foods` también es NO ACTION. Al revés se rompe con cualquier
        // coach que haya usado su alimento propio en una comida.
        const purgeOrder = calls
            .filter((c) => c.op === 'delete' && ['nutrition_plans', 'saved_meals', 'foods'].includes(c.table))
            .map((c) => c.table)
        expect(purgeOrder).toEqual(['nutrition_plans', 'saved_meals', 'foods'])
        expect(deleteUser).toHaveBeenCalledWith('coach-1')
        expect(json.accounts).toMatchObject({ deleted: 1, failed: 0 })
    })

    it('coach cuyo alumno no se pudo borrar: NO se borra al coach (evita alumnos huérfanos)', async () => {
        listUsers.mockResolvedValue({ data: { users: [authUser('coach-2', daysAgo(45))] }, error: null })
        tableResults['coaches'] = { data: { id: 'coach-2' }, error: null }
        tableResults['clients'] = { data: [{ id: 'al-9' }], error: null }
        deleteClientHard.mockResolvedValue({ error: 'storage caido' })

        const json = await (await GET(authedReq())).json()

        expect(deleteUser).not.toHaveBeenCalled()
        expect(json.accounts).toMatchObject({ due: 1, deleted: 0, failed: 1 })
    })

    it('una cuenta rota no frena la cola: la siguiente se purga igual', async () => {
        listUsers.mockResolvedValue({
            data: { users: [authUser('roto', daysAgo(60)), authUser('sano', daysAgo(60))] },
            error: null,
        })
        deleteClientHard.mockImplementation(async (_db: unknown, id: string) =>
            id === 'roto' ? { error: 'AUTH_DELETE_FAILED' } : { error: undefined }
        )

        const json = await (await GET(authedReq())).json()

        expect(deleteClientHard.mock.calls.map((c) => c[1])).toEqual(['roto', 'sano'])
        expect(json.accounts).toMatchObject({ due: 2, deleted: 1, failed: 1 })
    })

    it('listUsers caído: se cuenta el fallo y no se borra nada', async () => {
        listUsers.mockResolvedValue({ data: { users: [] }, error: { message: 'gotrue 500' } })

        const res = await GET(authedReq())
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(deleteClientHard).not.toHaveBeenCalled()
        expect(deleteUser).not.toHaveBeenCalled()
        expect(json.accounts).toMatchObject({ deleted: 0, failed: 1 })
    })
})

describe('GET /api/cron/purge-data — lista de exclusión de App Review', () => {
    const APP_REVIEW = ['appreview-coach@evatest.cl', 'appreview-alumno@evatest.cl']

    it.each(APP_REVIEW)('%s con el flag vencido NUNCA se borra', async (email) => {
        listUsers.mockResolvedValue({
            data: { users: [authUser('rev', daysAgo(400), email)] },
            error: null,
        })
        tableResults['coaches'] = { data: { id: 'rev' }, error: null }

        const json = await (await GET(authedReq())).json()

        expect(deleteUser).not.toHaveBeenCalled()
        expect(deleteClientHard).not.toHaveBeenCalled()
        expect(json.accounts).toMatchObject({ due: 1, deleted: 0, protectedSkipped: 1 })
    })

    it('el guard no depende de mayúsculas ni de espacios en el email', async () => {
        listUsers.mockResolvedValue({
            data: { users: [authUser('rev', daysAgo(400), '  AppReview-Coach@EvaTest.CL ')] },
            error: null,
        })

        const json = await (await GET(authedReq())).json()

        expect(deleteUser).not.toHaveBeenCalled()
        expect(deleteClientHard).not.toHaveBeenCalled()
        expect(json.accounts).toMatchObject({ protectedSkipped: 1, deleted: 0 })
    })

    it('protege solo a esas dos: un vecino con email parecido sí se purga', async () => {
        listUsers.mockResolvedValue({
            data: { users: [authUser('otro', daysAgo(40), 'appreview-coach@evatest.cl.attacker.io')] },
            error: null,
        })

        const json = await (await GET(authedReq())).json()

        expect(deleteClientHard).toHaveBeenCalledTimes(1)
        expect(json.accounts).toMatchObject({ deleted: 1, protectedSkipped: 0 })
    })
})

describe('GET /api/cron/purge-data — traza', () => {
    it('la corrida queda en admin_audit_logs con los conteos de las dos purgas nuevas', async () => {
        tableResults['coach_leads'] = { count: 3, error: null }
        listUsers.mockResolvedValue({ data: { users: [authUser('alumno-x', daysAgo(31))] }, error: null })

        await GET(authedReq())

        const insert = callsFor('admin_audit_logs', 'insert')
        expect(insert).toHaveLength(1)
        const payload = (insert[0].args[0] as { action: string; payload: Record<string, unknown> })
        expect(payload.action).toBe('cron.purge_data_ran')
        expect(payload.payload).toMatchObject({
            leads_purged: 3,
            leads_cutoff_date: daysAgo(90),
            cutoff_date: daysAgo(30),
        })
        expect(payload.payload.accounts).toMatchObject({ deleted: 1 })
    })
})
