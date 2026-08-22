/**
 * Gate y cliente de PERSONA en la app (`apps/mobile/lib/coach-persona.ts`, W5 F5.1).
 *
 * Lo que se pinnea:
 *  - el parser es TOTAL y conservador: un payload raro nunca deja `needsPersona: true` (eso
 *    secuestraría el panel de un coach que ya trabaja);
 *  - el gate consulta UNA vez por sesión y por cuenta, deduplica lo concurrente y se rinde a los
 *    6 s (una red colgada no puede dejar el árbol coach esperando);
 *  - un fallo NO se cachea (se reintenta en la próxima navegación) y NUNCA redirige;
 *  - contestar apaga el gate sin volver a preguntarle al servidor.
 *
 * GOTCHA de resolución (mismo patrón que `coach-access.test.ts`): los ids bare (`react-native`,
 * expo, supabase) resuelven distinto desde `tests/` que desde `apps/mobile/` en este monorepo
 * pnpm, así que los módulos del app se mockean por PATH ABSOLUTO con `vi.doMock` + `import()`
 * dinámico. `vi.resetModules()` en cada setup da una caché de gate limpia (es estado de módulo).
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)

type ApiCall = { path: string; options: Record<string, unknown> }

const COACH_A = 'coach-a'

let apiFetchImpl: (path: string, options: Record<string, unknown>) => Promise<unknown>
let calls: ApiCall[] = []
let sessionUserId: string | null = COACH_A

async function loadModule() {
    vi.resetModules()
    vi.doMock(mobileLib('api'), () => ({
        apiFetch: (p: string, options: Record<string, unknown>) => {
            calls.push({ path: p, options })
            return apiFetchImpl(p, options)
        },
    }))
    vi.doMock(mobileLib('supabase'), () => ({
        supabase: {
            auth: {
                getSession: async () => ({
                    data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
                }),
            },
        },
    }))
    return import(mobileLib('coach-persona'))
}

beforeEach(() => {
    calls = []
    sessionUserId = COACH_A
    apiFetchImpl = async () => ({ persona: null, alsoOther: false, needsPersona: true })
})

describe('parseCoachPersonaStatus', () => {
    it('acepta una respuesta valida', async () => {
        const { parseCoachPersonaStatus } = await loadModule()
        expect(parseCoachPersonaStatus({ persona: 'nutrition', alsoOther: true, needsPersona: false })).toEqual({
            persona: 'nutrition',
            alsoOther: true,
            needsPersona: false,
        })
    })

    it('persona desconocida o basura ⇒ null, sin preguntar de mas', async () => {
        const { parseCoachPersonaStatus } = await loadModule()
        expect(parseCoachPersonaStatus({ persona: 'kinesiologo', needsPersona: false })).toEqual({
            persona: null,
            alsoOther: false,
            needsPersona: false,
        })
        expect(parseCoachPersonaStatus(null)).toEqual({ persona: null, alsoOther: false, needsPersona: false })
        expect(parseCoachPersonaStatus('nope')).toEqual({ persona: null, alsoOther: false, needsPersona: false })
        expect(parseCoachPersonaStatus([1, 2])).toEqual({ persona: null, alsoOther: false, needsPersona: false })
    })

    it('con persona elegida jamas se vuelve a preguntar, diga lo que diga el server', async () => {
        const { parseCoachPersonaStatus } = await loadModule()
        expect(parseCoachPersonaStatus({ persona: 'rehab', needsPersona: true }).needsPersona).toBe(false)
    })
})

describe('resolvePostPersonaRoute', () => {
    it('manda a la guia cuando la pantalla existe y al panel cuando no', async () => {
        const { resolvePostPersonaRoute, COACH_GUIA_ROUTE, COACH_HOME_ROUTE } = await loadModule()
        expect(resolvePostPersonaRoute(true)).toBe(COACH_GUIA_ROUTE)
        expect(resolvePostPersonaRoute(false)).toBe(COACH_HOME_ROUTE)
    })
})

describe('fetchCoachPersonaStatus', () => {
    it('pega al endpoint mobile con el bearer', async () => {
        const { fetchCoachPersonaStatus } = await loadModule()
        await fetchCoachPersonaStatus()
        expect(calls).toHaveLength(1)
        expect(calls[0].path).toBe('/api/mobile/coach/persona')
        expect(calls[0].options).toMatchObject({ method: 'GET', authenticated: true })
    })

    it('endpoint caido ⇒ null (el caller no redirige a nadie)', async () => {
        apiFetchImpl = async () => {
            throw new Error('500')
        }
        const { fetchCoachPersonaStatus } = await loadModule()
        expect(await fetchCoachPersonaStatus()).toBeNull()
    })
})

describe('saveCoachPersona', () => {
    it('postea persona + alsoOther y devuelve el demo sembrado', async () => {
        apiFetchImpl = async () => ({ ok: true, demoClientId: 'demo-1' })
        const { saveCoachPersona } = await loadModule()
        const result = await saveCoachPersona({ persona: 'endurance', alsoOther: true })

        expect(result).toEqual({ ok: true, demoClientId: 'demo-1' })
        expect(calls[0].options).toMatchObject({
            method: 'POST',
            authenticated: true,
            body: { persona: 'endurance', alsoOther: true },
        })
    })

    it('`alsoOther` ausente viaja como false', async () => {
        apiFetchImpl = async () => ({ ok: true })
        const { saveCoachPersona } = await loadModule()
        const result = await saveCoachPersona({ persona: 'strength' })
        expect(result).toEqual({ ok: true, demoClientId: null })
        expect((calls[0].options as { body: { alsoOther: boolean } }).body.alsoOther).toBe(false)
    })

    it('el error redactado del server viaja al usuario, sin apagar el gate', async () => {
        apiFetchImpl = async () => {
            const error = new Error('Tu panel lo administra tu organización o tu equipo.')
            ;(error as Error & { status: number }).status = 403
            throw error
        }
        const mod = await loadModule()
        const result = await mod.saveCoachPersona({ persona: 'strength' })
        expect(result).toEqual({ ok: false, error: 'Tu panel lo administra tu organización o tu equipo.' })
        expect(mod.getCachedCoachPersonaStatus()).toBeNull()
    })

    it('un fallo de RED no le muestra al coach el error crudo del runtime', async () => {
        apiFetchImpl = async () => {
            throw new TypeError('Network request failed')
        }
        const mod = await loadModule()
        const result = await mod.saveCoachPersona({ persona: 'strength' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).not.toContain('Network request failed')
    })

    it('un 200 sin `ok` no se toma por exito', async () => {
        apiFetchImpl = async () => ({ demoClientId: 'demo-1' })
        const mod = await loadModule()
        expect((await mod.saveCoachPersona({ persona: 'other' })).ok).toBe(false)
        expect(mod.getCachedCoachPersonaStatus()).toBeNull()
    })

    it('guardar apaga el gate sin volver a preguntar al servidor', async () => {
        apiFetchImpl = async () => ({ ok: true, demoClientId: null })
        const mod = await loadModule()
        await mod.saveCoachPersona({ persona: 'rehab', alsoOther: false })

        expect(mod.getCachedCoachPersonaStatus()).toEqual({
            persona: 'rehab',
            alsoOther: false,
            needsPersona: false,
        })
        const status = await mod.resolveCoachPersonaGate()
        expect(status?.needsPersona).toBe(false)
        // Solo el POST: el gate se resolvio con la cache.
        expect(calls.filter((c) => c.options.method === 'GET')).toHaveLength(0)
    })
})

describe('resolveCoachPersonaGate', () => {
    it('resuelve una sola vez por sesion', async () => {
        const mod = await loadModule()
        expect((await mod.resolveCoachPersonaGate())?.needsPersona).toBe(true)
        expect((await mod.resolveCoachPersonaGate())?.needsPersona).toBe(true)
        expect(calls).toHaveLength(1)
    })

    it('deduplica las llamadas concurrentes (una navegacion rapida no dispara N requests)', async () => {
        const mod = await loadModule()
        await Promise.all([
            mod.resolveCoachPersonaGate(),
            mod.resolveCoachPersonaGate(),
            mod.resolveCoachPersonaGate(),
        ])
        expect(calls).toHaveLength(1)
    })

    it('sin sesion no pregunta nada', async () => {
        sessionUserId = null
        const mod = await loadModule()
        expect(await mod.resolveCoachPersonaGate()).toBeNull()
        expect(calls).toHaveLength(0)
    })

    it('cambiar de cuenta invalida el veredicto anterior', async () => {
        const mod = await loadModule()
        await mod.resolveCoachPersonaGate()

        sessionUserId = 'coach-b'
        apiFetchImpl = async () => ({ persona: 'strength', alsoOther: false, needsPersona: false })
        const second = await mod.resolveCoachPersonaGate()

        expect(second).toEqual({ persona: 'strength', alsoOther: false, needsPersona: false })
        expect(calls).toHaveLength(2)
    })

    it('un fallo NO se cachea: se reintenta en la proxima navegacion', async () => {
        apiFetchImpl = async () => {
            throw new Error('sin red')
        }
        const mod = await loadModule()
        expect(await mod.resolveCoachPersonaGate()).toBeNull()

        apiFetchImpl = async () => ({ persona: null, alsoOther: false, needsPersona: true })
        expect((await mod.resolveCoachPersonaGate())?.needsPersona).toBe(true)
        expect(calls).toHaveLength(2)
    })

    it('una red colgada se rinde al techo de espera y no redirige', async () => {
        vi.useFakeTimers()
        try {
            apiFetchImpl = () => new Promise(() => {})
            const mod = await loadModule()
            const pending = mod.resolveCoachPersonaGate()
            await vi.advanceTimersByTimeAsync(mod.PERSONA_GATE_TIMEOUT_MS)
            expect(await pending).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })
})
