/**
 * Bloqueo biométrico (`apps/mobile/lib/biometric.ts`) — anti-loop de Face ID.
 *
 * Bug reportado por una alumna real (iPhone, 26-08): al activar el desbloqueo facial la app
 * «se quedó spameando que verificara la cara». Causa: el prompt biométrico ES una transición de
 * ciclo de vida (iOS `inactive`, varios OEM Android `background`), y el bloqueo se re-armaba en
 * CADA vuelta a 'active' ⇒ cerrar el prompt reabría el prompt.
 *
 * GOTCHA de resolucion (mismo patron que coach-access.test.ts): los ids bare de expo resuelven
 * DISTINTO desde `tests/` que desde `apps/mobile/`, asi que se mockean por PATH ABSOLUTO tal como
 * los ve apps/mobile (createRequire con `paths: [mobileDir]`) con `vi.doMock` + `import()`
 * dinamico. El estado del escudo/latch es de MODULO: `vi.resetModules()` en cada setup.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

const SECURITY_LEVEL = { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 } as const

type AuthResult = { success: boolean; error?: string }

function makeLocalAuth(opts: {
  level?: number
  /** Resolver del prompt: permite dejarlo ABIERTO para probar el guard de vuelo. */
  auth?: () => Promise<AuthResult>
}) {
  const authenticateAsync = vi.fn(opts.auth ?? (async () => ({ success: true })))
  return {
    authenticateAsync,
    mod: {
      authenticateAsync,
      hasHardwareAsync: vi.fn(async () => true),
      isEnrolledAsync: vi.fn(async () => (opts.level ?? SECURITY_LEVEL.BIOMETRIC_STRONG) >= SECURITY_LEVEL.BIOMETRIC_WEAK),
      getEnrolledLevelAsync: vi.fn(async () => opts.level ?? SECURITY_LEVEL.BIOMETRIC_STRONG),
      SecurityLevel: SECURITY_LEVEL,
    },
  }
}

function makeSecureStore(pref: string | null) {
  const map = new Map<string, string>()
  if (pref !== null) map.set('eva_biometric_lock', pref)
  return {
    map,
    mod: {
      getItemAsync: vi.fn(async (k: string) => map.get(k) ?? null),
      setItemAsync: vi.fn(async (k: string, v: string) => { map.set(k, v) }),
      deleteItemAsync: vi.fn(async (k: string) => { map.delete(k) }),
    },
  }
}

type Bio = typeof import('../../apps/mobile/lib/biometric')

async function setup(opts: {
  pref?: string | null
  level?: number
  auth?: () => Promise<AuthResult>
} = {}): Promise<Bio & { authenticateAsync: ReturnType<typeof vi.fn> }> {
  const localAuth = makeLocalAuth({ level: opts.level, auth: opts.auth })
  const store = makeSecureStore(opts.pref === undefined ? '1' : opts.pref)

  vi.resetModules()
  vi.doMock(mobileDep('expo-local-authentication'), () => localAuth.mod)
  vi.doMock(mobileDep('expo-secure-store'), () => store.mod)

  const mod = (await import(mobileLib('biometric.ts'))) as Bio
  mod.__resetBiometricLifecycleForTests()
  return Object.assign(mod, { authenticateAsync: localAuth.authenticateAsync })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock(mobileDep('expo-local-authentication'))
  vi.doUnmock(mobileDep('expo-secure-store'))
})

describe('observeAppStateForRelock: el prompt NO puede re-armar el bloqueo', () => {
  it('iOS — el ciclo del prompt (active → inactive → active) no re-arma', async () => {
    const bio = await setup()
    // Prompt abierto: iOS deja la app en 'inactive', nunca 'background'.
    expect(bio.observeAppStateForRelock('inactive')).toBe(false)
    // Al cerrarse vuelve a 'active': ESTE era el disparo que reabría el prompt.
    expect(bio.observeAppStateForRelock('active')).toBe(false)
  })

  it('iOS — la vuelta REAL de background sí re-arma, aunque pase por inactive', async () => {
    const bio = await setup()
    // Salida real: active → inactive → background.
    bio.observeAppStateForRelock('inactive')
    bio.observeAppStateForRelock('background')
    // Vuelta real: background → inactive → active. El previo es 'inactive' igual que en el
    // prompt, por eso el veredicto lo da el latch y no el estado anterior.
    bio.observeAppStateForRelock('inactive')
    expect(bio.observeAppStateForRelock('active')).toBe(true)
  })

  it('una sola vuelta re-arma una sola vez (el latch se consume)', async () => {
    const bio = await setup()
    bio.observeAppStateForRelock('background')
    expect(bio.observeAppStateForRelock('active')).toBe(true)
    expect(bio.observeAppStateForRelock('active')).toBe(false)
  })

  it('Android — el background que provoca el propio prompt no cuenta como salida', async () => {
    let resolvePrompt: (r: AuthResult) => void = () => {}
    const bio = await setup({ auth: () => new Promise<AuthResult>((r) => { resolvePrompt = r }) })

    const pending = bio.authenticate('Desbloquea EVA')
    // OEM que manda la app a background mientras el prompt está arriba.
    expect(bio.observeAppStateForRelock('background')).toBe(false)
    resolvePrompt({ success: true })
    await pending
    // Y el resume inmediato tampoco: cae en la ventana de gracia.
    expect(bio.observeAppStateForRelock('active')).toBe(false)
  })

  it('la gracia post-prompt tapa el resume tardío, pero no dura para siempre', async () => {
    const bio = await setup()
    await bio.authenticate('Desbloquea EVA')

    // Salida real justo después de desbloquear: dentro de la gracia, se ignora.
    bio.observeAppStateForRelock('background')
    expect(bio.observeAppStateForRelock('active')).toBe(false)

    // Pasada la ventana, el ciclo de vida vuelve a mandar.
    vi.advanceTimersByTime(bio.PROMPT_APPSTATE_GRACE_MS + 1)
    expect(bio.isPromptShieldingAppState()).toBe(false)
    bio.observeAppStateForRelock('background')
    expect(bio.observeAppStateForRelock('active')).toBe(true)
  })
})

describe('authenticate: idempotencia', () => {
  it('jamás dos prompts en vuelo — la segunda llamada no abre nada', async () => {
    let resolvePrompt: (r: AuthResult) => void = () => {}
    const bio = await setup({ auth: () => new Promise<AuthResult>((r) => { resolvePrompt = r }) })

    const first = bio.authenticate('Desbloquea EVA')
    await expect(bio.authenticate('Desbloquea EVA')).resolves.toBe(false)
    expect(bio.authenticateAsync).toHaveBeenCalledTimes(1)

    resolvePrompt({ success: true })
    await expect(first).resolves.toBe(true)
  })

  it('cancelar devuelve false y libera el guard (el reintento es del usuario, no automático)', async () => {
    const bio = await setup({ auth: async () => ({ success: false, error: 'user_cancel' }) })
    await expect(bio.authenticate()).resolves.toBe(false)
    // Nada se reintentó solo: un único prompt por llamada.
    expect(bio.authenticateAsync).toHaveBeenCalledTimes(1)
    // Y el guard quedó libre para el gesto manual.
    await expect(bio.authenticate()).resolves.toBe(false)
    expect(bio.authenticateAsync).toHaveBeenCalledTimes(2)
  })

  it('un throw de la lib nativa degrada a false sin dejar el guard trabado', async () => {
    const bio = await setup({ auth: async () => { throw new Error('native boom') } })
    await expect(bio.authenticate()).resolves.toBe(false)
    await expect(bio.authenticate()).resolves.toBe(false)
    expect(bio.authenticateAsync).toHaveBeenCalledTimes(2)
  })
})

describe('shouldArmBiometricLock: degradar sin encerrar a nadie', () => {
  it('pref apagada ⇒ no se arma', async () => {
    const bio = await setup({ pref: null })
    await expect(bio.shouldArmBiometricLock()).resolves.toBe(false)
  })

  it('pref encendida + biometría enrolada ⇒ se arma', async () => {
    const bio = await setup({ pref: '1', level: SECURITY_LEVEL.BIOMETRIC_STRONG })
    await expect(bio.shouldArmBiometricLock()).resolves.toBe(true)
  })

  it('sin biometría pero con código de sistema ⇒ se arma (el prompt cae a passcode)', async () => {
    const bio = await setup({ pref: '1', level: SECURITY_LEVEL.SECRET })
    await expect(bio.shouldArmBiometricLock()).resolves.toBe(true)
  })

  it('device sin biometría NI código ⇒ NO se arma: el prompt nunca podría terminar bien', async () => {
    const bio = await setup({ pref: '1', level: SECURITY_LEVEL.NONE })
    await expect(bio.canDeviceSatisfyLock()).resolves.toBe(false)
    await expect(bio.shouldArmBiometricLock()).resolves.toBe(false)
  })
})
