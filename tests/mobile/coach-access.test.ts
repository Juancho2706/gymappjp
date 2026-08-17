/**
 * Gate de acceso del coach (`apps/mobile/lib/coach-access.ts`) — store con estado de modulo.
 *
 * Cubre los 4 hallazgos de la auditoria 2026-08-09:
 *   #1 error de red => gate CERRADO (no neutro) y cache intacta.
 *   #2 cambio de cuenta con revalidacion EN VUELO => el veredicto viejo no se aplica ni se persiste.
 *   #3 guard de cambio de cuenta valido tambien si la sesion previa era de un alumno (sin coachId).
 *   #4 tras el error el estado queda RE-INTENTABLE (`status: 'error'`, sin throttle).
 *
 * GOTCHA de resolucion (mismo patron que mobile-nutrition-v2-cache.test.ts): los ids bare
 * (`react-native`, async-storage) resuelven DISTINTO desde `tests/` que desde `apps/mobile/` en este
 * monorepo pnpm, asi que se mockean por PATH ABSOLUTO tal como los ve apps/mobile (createRequire con
 * `paths: [mobileDir]`) con `vi.doMock` + `import()` dinamico. `vi.resetModules()` en cada setup da
 * un store limpio (el estado del gate es de modulo).
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

const HOUR = 60 * 60 * 1000
const FUTURE = () => new Date(Date.now() + 30 * 24 * HOUR).toISOString()
const PAST = () => new Date(Date.now() - 30 * 24 * HOUR).toISOString()

type Profile = {
    id: string
    subscriptionStatus: string
    subscriptionTier: string
    currentPeriodEnd: string | null
    /** coaches.max_clients — cupo EFECTIVO (grandfather pricing v2); ausente ⇒ catálogo. */
    maxClients?: number
}

const profile = (over: Partial<Profile> = {}): Profile => ({
    id: 'coach-a',
    subscriptionStatus: 'active',
    subscriptionTier: 'pro',
    currentPeriodEnd: null,
    ...over,
})

/** AsyncStorage en memoria, inspeccionable desde el test. */
function makeStorage() {
    const map = new Map<string, string>()
    return {
        map,
        mod: {
            default: {
                getItem: vi.fn(async (k: string) => map.get(k) ?? null),
                setItem: vi.fn(async (k: string, v: string) => {
                    map.set(k, v)
                }),
                removeItem: vi.fn(async (k: string) => {
                    map.delete(k)
                }),
            },
        },
    }
}

/** Supabase minimo: sesion + el head-count de `clients` (solo lo toca el tier free standalone). */
function makeSupabase(userId: string | null, clientCount = 0) {
    return {
        supabase: {
            auth: {
                getSession: vi.fn(async () => ({
                    data: { session: userId ? { user: { id: userId } } : null },
                })),
                onAuthStateChange: vi.fn(),
            },
            from: vi.fn(() => {
                const builder: Record<string, unknown> = {}
                for (const m of ['select', 'eq', 'is']) {
                    builder[m] = vi.fn(() => builder)
                }
                // El head-count se await-ea directo sobre el builder.
                builder.then = (resolve: (v: unknown) => unknown) =>
                    Promise.resolve({ count: clientCount, error: null }).then(resolve)
                return builder
            }),
        },
    }
}

interface Harness {
    profileMock: ReturnType<typeof vi.fn>
    workspaceMock: ReturnType<typeof vi.fn>
    storage: ReturnType<typeof makeStorage>
}

async function setup(opts: {
    userId?: string | null
    clientCount?: number
    profile?: () => Promise<Profile | null>
    workspace?: () => Promise<{ kind: string } | null>
}): Promise<Harness & typeof import('../../apps/mobile/lib/coach-access')> {
    const storage = makeStorage()
    const profileMock = vi.fn(opts.profile ?? (async () => profile()))
    const workspaceMock = vi.fn(opts.workspace ?? (async () => ({ kind: 'standalone' })))

    vi.resetModules()
    vi.doMock(mobileDep('react-native'), () => ({ AppState: { addEventListener: vi.fn() } }))
    vi.doMock(mobileDep('@react-native-async-storage/async-storage'), () => storage.mod)
    vi.doMock(mobileLib('supabase.ts'), () => makeSupabase(opts.userId ?? 'coach-a', opts.clientCount ?? 0))
    vi.doMock(mobileLib('coach.ts'), () => ({ getCoachProfileStrict: profileMock }))
    vi.doMock(mobileLib('workspace.ts'), () => ({ getActiveCoachWorkspaceStrict: workspaceMock }))

    const mod = (await import(mobileLib('coach-access.ts'))) as typeof import('../../apps/mobile/lib/coach-access')
    return Object.assign(mod, { profileMock, workspaceMock, storage })
}

const CACHE_KEY = (id: string) => `eva_coach_access_v2:${id}`

/** Cache ya persistida de una resolucion anterior (para verificar que un error NO la borra). */
function seedCache(storage: ReturnType<typeof makeStorage>, coachId: string) {
    storage.map.set(
        CACHE_KEY(coachId),
        JSON.stringify({ accessVersion: 2, coachId, subscriptionStatus: 'active', subscriptionTier: 'pro' }),
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ── (a) error de red ⇒ gate CERRADO, no neutro ───────────────────────────────────────────────────

describe('fail-closed ante error de red (hallazgo #1)', () => {
    it('perfil que LANZA (offline/5xx) deja el gate cerrado y en estado de error', async () => {
        const h = await setup({
            profile: async () => {
                throw new Error('Network request failed')
            },
        })
        await h.refreshCoachAccess(true)

        const s = h.getCoachAccessSnapshot()
        expect(s.ready).toBe(false)
        expect(s.blocked).toBe(true)
        expect(s.status).toBe('error')
    })

    it('el error NO borra la cache del ultimo veredicto', async () => {
        const h = await setup({
            profile: async () => {
                throw new Error('Network request failed')
            },
        })
        seedCache(h.storage, 'coach-a')
        await h.refreshCoachAccess(true)

        expect(h.storage.map.has(CACHE_KEY('coach-a'))).toBe(true)
        expect(h.storage.mod.default.removeItem).not.toHaveBeenCalled()
    })

    it('workspace que LANZA tambien cierra el gate (no se asume kind desconocido)', async () => {
        const h = await setup({
            workspace: async () => {
                throw new Error('Network request failed')
            },
        })
        await h.refreshCoachAccess(true)

        expect(h.getCoachAccessSnapshot().status).toBe('error')
        expect(h.getCoachAccessSnapshot().blocked).toBe(true)
    })
})

// ── (b) "no hay fila" real ⇒ neutro ──────────────────────────────────────────────────────────────

describe('sin fila de coach (alumno) => estado neutro (hallazgo #1, contracara)', () => {
    it('perfil null resuelto SIN error deja ready:true y blocked:false', async () => {
        const h = await setup({ profile: async () => null, workspace: async () => null })
        await h.refreshCoachAccess(true)

        const s = h.getCoachAccessSnapshot()
        expect(s.ready).toBe(true)
        expect(s.blocked).toBe(false)
        expect(s.status).toBe('allowed')
        expect(s.subscriptionStatus).toBeNull()
    })

    it('el estado neutro SI limpia la cache de coach (era de otra sesion)', async () => {
        const h = await setup({ profile: async () => null, workspace: async () => null })
        await h.refreshCoachAccess(true)
        expect(h.storage.mod.default.removeItem).toHaveBeenCalledWith('eva_coach_access')
    })
})

// ── (c) cambio de cuenta con request en vuelo ────────────────────────────────────────────────────

describe('cambio de cuenta con revalidacion en vuelo (hallazgo #2)', () => {
    it('el veredicto del coach saliente no se aplica ni se persiste tras el reset', async () => {
        let release: (p: Profile) => void = () => {}
        const pending = new Promise<Profile>((resolve) => {
            release = resolve
        })
        const h = await setup({ profile: () => pending })

        const inFlight = h.refreshCoachAccess(true)
        h.resetCoachAccess() // llega el SIGNED_IN de otra cuenta
        release(profile({ id: 'coach-a', subscriptionStatus: 'active' }))
        await inFlight

        const s = h.getCoachAccessSnapshot()
        expect(s.ready).toBe(false) // el gate quedo cerrado, no heredo el ready del saliente
        expect(s.blocked).toBe(true)
        expect(h.storage.map.has(CACHE_KEY('coach-a'))).toBe(false) // ni se persistio bajo la key vieja
    })

    it('tras el reset, refreshCoachAccess NO devuelve la promesa vieja: vuelve a preguntar', async () => {
        let release: (p: Profile) => void = () => {}
        const pending = new Promise<Profile>((resolve) => {
            release = resolve
        })
        let call = 0
        const h = await setup({
            profile: () => {
                call += 1
                return call === 1 ? pending : Promise.resolve(profile({ id: 'coach-b' }))
            },
        })

        const stale = h.refreshCoachAccess(true)
        h.resetCoachAccess()
        const fresh = h.refreshCoachAccess(true)
        expect(fresh).not.toBe(stale)

        release(profile({ id: 'coach-a' }))
        await Promise.all([stale, fresh])

        // Gana el coach entrante; el veredicto huerfano no pisa nada.
        expect(h.getCoachAccessSnapshot().ready).toBe(true)
        expect(h.storage.map.has(CACHE_KEY('coach-b'))).toBe(true)
        expect(h.storage.map.has(CACHE_KEY('coach-a'))).toBe(false)
    })
})

// ── (c2) guard de cambio de cuenta con sesion previa de alumno ───────────────────────────────────

describe('guard de cambio de cuenta (hallazgo #3)', () => {
    it('sesion previa de ALUMNO (sin coachId): el usuario entrante no hereda ready:true', async () => {
        const h = await setup({ userId: 'alumno-1', profile: async () => null, workspace: async () => null })
        await h.refreshCoachAccess(true)
        expect(h.getCoachAccessSnapshot().ready).toBe(true) // neutro del alumno

        // Entra otra cuenta: el guard debe resetear aunque `state.coachId` sea null.
        h.handleCoachAccessAuthChange('SIGNED_IN', 'coach-b')
        expect(h.getCoachAccessSnapshot().ready).toBe(false)
        expect(h.getCoachAccessSnapshot().blocked).toBe(true)
    })

    it('el MISMO usuario (refresh de token) no resetea el veredicto ya resuelto', async () => {
        const h = await setup({})
        await h.refreshCoachAccess(true)
        expect(h.getCoachAccessSnapshot().ready).toBe(true)

        h.handleCoachAccessAuthChange('TOKEN_REFRESHED', 'coach-a')
        expect(h.getCoachAccessSnapshot().ready).toBe(true)
    })

    it('SIGNED_OUT cierra el gate y borra la cache', async () => {
        const h = await setup({})
        await h.refreshCoachAccess(true)
        expect(h.storage.map.has(CACHE_KEY('coach-a'))).toBe(true)

        h.handleCoachAccessAuthChange('SIGNED_OUT', null)
        expect(h.getCoachAccessSnapshot().ready).toBe(false)
        expect(h.storage.map.has(CACHE_KEY('coach-a'))).toBe(false)
    })
})

// ── (d) el catch deja el estado RE-INTENTABLE ────────────────────────────────────────────────────

describe('estado re-intentable tras el error (hallazgo #4)', () => {
    it('el throttle de 30s NO sella el loader: el siguiente refresh sin force vuelve a preguntar', async () => {
        let fail = true
        const h = await setup({
            profile: async () => {
                if (fail) throw new Error('Network request failed')
                return profile()
            },
        })

        await h.refreshCoachAccess(true)
        expect(h.getCoachAccessSnapshot().status).toBe('error')
        expect(h.profileMock).toHaveBeenCalledTimes(1)

        // Sin `force` y dentro de la ventana de throttle: igual reintenta porque no hay resolucion.
        fail = false
        await h.refreshCoachAccess()
        expect(h.profileMock).toHaveBeenCalledTimes(2)

        const s = h.getCoachAccessSnapshot()
        expect(s.ready).toBe(true)
        expect(s.blocked).toBe(false)
        expect(s.status).toBe('allowed')
    })

    it('un error DESPUES de una resolucion buena tampoco queda sellado por el throttle', async () => {
        let fail = false
        const h = await setup({
            profile: async () => {
                if (fail) throw new Error('Network request failed')
                return profile()
            },
        })

        await h.refreshCoachAccess(true) // resolucion buena: arranca el throttle
        fail = true
        await h.refreshCoachAccess(true) // revalidacion de foreground que se cae
        expect(h.getCoachAccessSnapshot().status).toBe('error')
        expect(h.profileMock).toHaveBeenCalledTimes(2)

        // Sin este reintento el loader "Revisando tu plan…" quedaba 30s sin salida (no hay
        // navegacion posible desde el muro): el catch tiene que soltar el throttle.
        fail = false
        await h.refreshCoachAccess()
        expect(h.profileMock).toHaveBeenCalledTimes(3)
        expect(h.getCoachAccessSnapshot().status).toBe('allowed')
    })

    it('una resolucion exitosa SI aplica el throttle (camino feliz intacto)', async () => {
        const h = await setup({})
        await h.refreshCoachAccess(true)
        expect(h.profileMock).toHaveBeenCalledTimes(1)

        await h.refreshCoachAccess() // dentro de los 30s
        expect(h.profileMock).toHaveBeenCalledTimes(1)
    })
})

// ── (e) coach bloqueado ⇒ blocked con ready ──────────────────────────────────────────────────────

describe('veredictos resueltos', () => {
    it('coach vencido (gracia pasada) => ready:true + blocked:true (el layout puede expulsar)', async () => {
        const h = await setup({
            profile: async () => profile({ subscriptionStatus: 'canceled', currentPeriodEnd: PAST() }),
        })
        await h.refreshCoachAccess(true)

        const s = h.getCoachAccessSnapshot()
        expect(s.ready).toBe(true)
        expect(s.blocked).toBe(true)
        expect(s.status).toBe('blocked')
        expect(s.subscriptionStatus).toBe('canceled')
    })

    it('cancelado DENTRO de la gracia sigue con acceso', async () => {
        const h = await setup({
            profile: async () => profile({ subscriptionStatus: 'canceled', currentPeriodEnd: FUTURE() }),
        })
        await h.refreshCoachAccess(true)
        expect(h.getCoachAccessSnapshot().blocked).toBe(false)
    })

    // Pricing v2: cupo free de catálogo = 2 (B2 migra este guard al helper con created_at para
    // que un free VIEJO siga midiendo contra 3 — grandfather).
    it('free standalone sobre el cupo => blocked (usa el conteo real de clientes)', async () => {
        const h = await setup({ clientCount: 3, profile: async () => profile({ subscriptionTier: 'free' }) })
        await h.refreshCoachAccess(true)

        const s = h.getCoachAccessSnapshot()
        expect(s.ready).toBe(true)
        expect(s.blocked).toBe(true)
    })

    it('free standalone dentro del cupo => acceso', async () => {
        const h = await setup({ clientCount: 2, profile: async () => profile({ subscriptionTier: 'free' }) })
        await h.refreshCoachAccess(true)
        expect(h.getCoachAccessSnapshot().blocked).toBe(false)
    })

    // Grandfather (P2): el cupo efectivo viene de coaches.max_clients (perfil) — un free VIEJO
    // con su 3 de siempre NO queda bloqueado por el catálogo nuevo (free 2).
    it('free VIEJO (max_clients=3) con 3 activos => acceso (la columna manda sobre el catálogo)', async () => {
        const h = await setup({
            clientCount: 3,
            profile: async () => profile({ subscriptionTier: 'free', maxClients: 3 }),
        })
        await h.refreshCoachAccess(true)
        expect(h.getCoachAccessSnapshot().blocked).toBe(false)
    })

    it('free VIEJO (max_clients=3) con 4 activos => blocked (sobre su propio cupo)', async () => {
        const h = await setup({
            clientCount: 4,
            profile: async () => profile({ subscriptionTier: 'free', maxClients: 3 }),
        })
        await h.refreshCoachAccess(true)
        expect(h.getCoachAccessSnapshot().blocked).toBe(true)
    })

    it('managed (team) nunca queda bloqueado por suscripcion', async () => {
        const h = await setup({
            profile: async () => profile({ subscriptionStatus: 'team_managed', subscriptionTier: 'free' }),
            workspace: async () => ({ kind: 'team_member' }),
        })
        await h.refreshCoachAccess(true)
        expect(h.getCoachAccessSnapshot().blocked).toBe(false)
    })
})
