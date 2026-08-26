import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    capture: vi.fn(),
    afterTasks: [] as Array<() => unknown>,
}))

// El capture va por `after()` (SPEC §5 regla 3). En test lo encolamos y lo drenamos a mano:
// así se verifica que el evento NO se emite dentro del await del UPDATE.
vi.mock('next/server', () => ({
    after: (task: () => unknown) => {
        mocks.afterTasks.push(task)
    },
}))

vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: (...args: unknown[]) => mocks.capture(...args),
}))

import { recordStudentFirstLogin } from './student-login-signal.service'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const COACH_ID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-08-26T12:00:00.000Z')
const CREATED_AT = '2026-08-26T11:58:30.000Z' // 90 s antes

type UpdateOutcome =
    | { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
    | Error

function createAdmin(queue: UpdateOutcome[]) {
    const ops: Array<[string, unknown, unknown]> = []
    const getUserById = vi.fn()

    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
        update: (payload: unknown) => {
            ops.push(['update', payload, null])
            return builder
        },
        eq: (column: string, value: unknown) => {
            ops.push(['eq', column, value])
            return builder
        },
        is: (column: string, value: unknown) => {
            ops.push(['is', column, value])
            return builder
        },
        select: (columns: string) => {
            ops.push(['select', columns, null])
            const outcome = queue.shift()
            if (outcome instanceof Error) return Promise.reject(outcome)
            return Promise.resolve(outcome ?? { data: [], error: null })
        },
    })

    const from = vi.fn(() => builder)
    const admin = { from, auth: { admin: { getUserById } } }

    return { admin: admin as never, ops, from, getUserById }
}

function writtenRow(overrides: Record<string, unknown> = {}) {
    return {
        data: [{
            coach_id: COACH_ID,
            created_at: CREATED_AT,
            email: 'alumna@correo.cl',
            ...overrides,
        }],
        error: null,
    }
}

async function flushAfter() {
    const tasks = [...mocks.afterTasks]
    mocks.afterTasks.length = 0
    for (const task of tasks) await task()
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.afterTasks.length = 0
    // Solo `Date`: los timers reales siguen vivos para no colgar los await del servicio.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('recordStudentFirstLogin', () => {
    it('sella la columna una sola vez y emite un único student_first_login', async () => {
        const { admin, ops, from, getUserById } = createAdmin([
            writtenRow(),
            { data: [], error: null },
        ])
        getUserById.mockResolvedValue({ data: { user: { email: 'coach@correo.cl' } }, error: null })

        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(true)

        expect(from).toHaveBeenCalledWith('clients')
        expect(ops).toEqual([
            ['update', { first_login_at: NOW.toISOString() }, null],
            ['eq', 'id', CLIENT_ID],
            ['is', 'first_login_at', null],
            ['select', 'coach_id, created_at, email', null],
        ])
        // El capture NO salió todavía: está agendado en `after()`.
        expect(mocks.capture).not.toHaveBeenCalled()

        await flushAfter()
        expect(mocks.capture).toHaveBeenCalledTimes(1)
        expect(mocks.capture).toHaveBeenCalledWith({
            event: 'student_first_login',
            distinctId: COACH_ID,
            properties: { seconds_since_created: 90, self_invited: false },
        })

        // Segunda llamada: el UPDATE no devuelve filas porque la columna ya está sellada.
        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(false)
        await flushAfter()
        expect(mocks.capture).toHaveBeenCalledTimes(1)
    })

    it('no emite nada cuando el UPDATE no escribió ninguna fila', async () => {
        const { admin } = createAdmin([{ data: [], error: null }])

        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(false)
        await flushAfter()
        expect(mocks.capture).not.toHaveBeenCalled()
    })

    it('devuelve false sin lanzar cuando el UPDATE explota', async () => {
        const { admin } = createAdmin([new Error('db unavailable')])

        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(false)
        await flushAfter()
        expect(mocks.capture).not.toHaveBeenCalled()
    })

    it('devuelve false sin lanzar cuando el UPDATE responde con error', async () => {
        const { admin } = createAdmin([{ data: null, error: { message: 'permission denied' } }])

        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(false)
        await flushAfter()
        expect(mocks.capture).not.toHaveBeenCalled()
    })

    it('marca self_invited cuando los correos normalizados coinciden', async () => {
        const { admin, getUserById } = createAdmin([
            writtenRow({ email: 'c.oach+alumno@gmail.com' }),
        ])
        getUserById.mockResolvedValue({ data: { user: { email: 'Coach@gmail.com' } }, error: null })

        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(true)
        await flushAfter()

        expect(getUserById).toHaveBeenCalledWith(COACH_ID)
        expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
            properties: { seconds_since_created: 90, self_invited: true },
        }))
    })

    it('emite igual con self_invited null si no se puede leer el correo del coach', async () => {
        const { admin, getUserById } = createAdmin([writtenRow()])
        getUserById.mockRejectedValue(new Error('auth admin down'))

        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(true)
        await flushAfter()

        expect(mocks.capture).toHaveBeenCalledTimes(1)
        expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
            distinctId: COACH_ID,
            properties: { seconds_since_created: 90, self_invited: null },
        }))
    })

    it('emite con self_invited null cuando getUserById devuelve error', async () => {
        const { admin, getUserById } = createAdmin([writtenRow()])
        getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'not found' } })

        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(true)
        await flushAfter()

        expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
            properties: { seconds_since_created: 90, self_invited: null },
        }))
    })

    it('no agenda evento si la fila escrita no tiene coach', async () => {
        const { admin, getUserById } = createAdmin([writtenRow({ coach_id: null })])

        await expect(recordStudentFirstLogin(admin, CLIENT_ID)).resolves.toBe(true)
        await flushAfter()

        expect(getUserById).not.toHaveBeenCalled()
        expect(mocks.capture).not.toHaveBeenCalled()
    })
})
