// A3 (roadmap Tanda 6): suite dedicada de la cache RN de Nutricion V2 (apps/mobile/lib/nutrition-v2-cache.ts).
//
// GOTCHA de resolucion (documentado aqui porque no es obvio): apps/mobile declara su PROPIA
// dependencia de @react-native-async-storage/async-storage (v3.1.1), distinta de cualquier copia
// que pnpm pudiera hoistear a la raiz del monorepo para otro workspace. Un `vi.mock('@react-native-
// async-storage/async-storage', factory)` llamado desde un archivo de test en tests/ (contexto raiz)
// solo intercepta el id resuelto DESDE la raiz - NO el id que resuelve apps/mobile/lib al importar el
// mismo specifier bare, porque son dos paquetes fisicamente distintos en node_modules (pnpm content-
// addressable store). El fix es resolver el path REAL tal como lo veria apps/mobile (require.resolve
// con `paths: [mobileDir]`) y mockear ESE path absoluto con `vi.doMock` (no hoisteado), seguido de un
// `import()` dinamico del modulo bajo test (para que la evaluacion ocurra despues del doMock).
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile')

function resolveMobileDep(spec: string): string {
  return requireFromTest.resolve(spec, { paths: [mobileDir] })
}

const store = new Map<string, string>()
const asyncStorageMock = {
  getItem: vi.fn((key: string) => Promise.resolve(store.has(key) ? (store.get(key) as string) : null)),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value)
    return Promise.resolve()
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key)
    return Promise.resolve()
  }),
  getAllKeys: vi.fn(() => Promise.resolve(Array.from(store.keys()))),
}

vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({
  default: asyncStorageMock,
}))

const {
  clearNutritionV2CacheForUser,
  nutritionV2CacheKey,
  readNutritionV2Cache,
  removeNutritionV2Cache,
  writeNutritionV2Cache,
} = await import('../apps/mobile/lib/nutrition-v2-cache')

const PayloadSchema = z.object({ value: z.number() })

const COACH_A = 'coach-a'
const COACH_B = 'coach-b'
const CLIENT_A = 'client-a'
const CLIENT_B = 'client-b'

beforeEach(() => {
  store.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('nutritionV2CacheKey - aislamiento por workspace', () => {
  it('produce keys distintas por userId/clientId/kind/scopeKey', () => {
    const base = { userId: COACH_A, clientId: CLIENT_A, kind: 'today' as const, scopeKey: 's1' }
    const keys = [
      nutritionV2CacheKey(base),
      nutritionV2CacheKey({ ...base, userId: COACH_B }),
      nutritionV2CacheKey({ ...base, clientId: CLIENT_B }),
      nutritionV2CacheKey({ ...base, kind: 'plan' }),
      nutritionV2CacheKey({ ...base, scopeKey: 's2' }),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('es estable para el mismo input (misma key en dos llamadas)', () => {
    const input = { userId: COACH_A, clientId: null, kind: 'coachHub' as const, scopeKey: 'team:x:-' }
    expect(nutritionV2CacheKey(input)).toBe(nutritionV2CacheKey(input))
  })
})

describe('write-read - dos workspaces del mismo coach no comparten entrada', () => {
  it('escribe para alumno A y leer con alumno B (mismo coach) no encuentra nada', async () => {
    await writeNutritionV2Cache({
      userId: COACH_A,
      clientId: CLIENT_A,
      kind: 'clientDetail',
      scopeKey: 'today',
      payload: { value: 1 },
    })

    const readB = await readNutritionV2Cache({
      userId: COACH_A,
      clientId: CLIENT_B,
      kind: 'clientDetail',
      scopeKey: 'today',
      schema: PayloadSchema,
    })
    expect(readB).toBeNull()

    const readA = await readNutritionV2Cache({
      userId: COACH_A,
      clientId: CLIENT_A,
      kind: 'clientDetail',
      scopeKey: 'today',
      schema: PayloadSchema,
    })
    expect(readA?.payload).toEqual({ value: 1 })
  })

  it('mismo coach, distinto scope (team vs org) no comparte entrada', async () => {
    await writeNutritionV2Cache({
      userId: COACH_A,
      clientId: null,
      kind: 'coachHub',
      scopeKey: 'team:t1:-',
      payload: { value: 42 },
    })
    const orgRead = await readNutritionV2Cache({
      userId: COACH_A,
      clientId: null,
      kind: 'coachHub',
      scopeKey: 'organization:-:o1',
      schema: PayloadSchema,
    })
    expect(orgRead).toBeNull()
  })
})

describe('TTL - vencido solo es legible con allowStale', () => {
  it('sin allowStale: expirado devuelve null', async () => {
    await writeNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      payload: { value: 1 },
      ttlMs: 1_000,
    })
    vi.advanceTimersByTime(1_001)
    const result = await readNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      schema: PayloadSchema,
    })
    expect(result).toBeNull()
  })

  it('con allowStale=true: expirado devuelve payload marcado stale', async () => {
    await writeNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      payload: { value: 7 },
      ttlMs: 1_000,
    })
    vi.advanceTimersByTime(1_001)
    const result = await readNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      schema: PayloadSchema,
      allowStale: true,
    })
    expect(result).toEqual({ payload: { value: 7 }, stale: true, storedAt: expect.any(Number) })
  })

  it('antes de vencer: NO esta stale ni con allowStale', async () => {
    await writeNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      payload: { value: 3 },
      ttlMs: 10_000,
    })
    vi.advanceTimersByTime(1_000)
    const result = await readNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      schema: PayloadSchema,
      allowStale: true,
    })
    expect(result?.stale).toBe(false)
  })
})

describe('schema mismatch - la entrada se descarta', () => {
  it('payload que no matchea el schema devuelve null y borra la entrada', async () => {
    await writeNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      payload: { value: 'no-es-un-numero' },
    })

    const mismatched = await readNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      schema: PayloadSchema,
    })
    expect(mismatched).toBeNull()

    const secondAttempt = await readNutritionV2Cache({
      userId: COACH_A,
      kind: 'today',
      scopeKey: 's1',
      schema: z.object({ value: z.unknown() }),
    })
    expect(secondAttempt).toBeNull()
  })
})

describe('limite de tamano - payload mayor a 750KB no se escribe', () => {
  it('writeNutritionV2Cache devuelve false y no persiste nada', async () => {
    const huge = { value: 1, blob: 'x'.repeat(800_000) }
    const ok = await writeNutritionV2Cache({
      userId: COACH_A,
      kind: 'history',
      scopeKey: 's1',
      payload: huge as unknown as { value: number },
    })
    expect(ok).toBe(false)

    const read = await readNutritionV2Cache({
      userId: COACH_A,
      kind: 'history',
      scopeKey: 's1',
      schema: PayloadSchema,
    })
    expect(read).toBeNull()
  })

  it('un payload justo debajo del limite SI se escribe', async () => {
    const ok = await writeNutritionV2Cache({
      userId: COACH_A,
      kind: 'history',
      scopeKey: 's2',
      payload: { value: 9 },
    })
    expect(ok).toBe(true)
  })
})

describe('clearNutritionV2CacheForUser - limpia SOLO lo del usuario', () => {
  it('borra todas las entradas de A sin tocar las de B', async () => {
    await writeNutritionV2Cache({ userId: COACH_A, kind: 'today', scopeKey: 's1', payload: { value: 1 } })
    await writeNutritionV2Cache({ userId: COACH_A, clientId: CLIENT_A, kind: 'clientDetail', scopeKey: 's1', payload: { value: 2 } })
    await writeNutritionV2Cache({ userId: COACH_B, kind: 'today', scopeKey: 's1', payload: { value: 3 } })

    await clearNutritionV2CacheForUser(COACH_A)

    expect(
      await readNutritionV2Cache({ userId: COACH_A, kind: 'today', scopeKey: 's1', schema: PayloadSchema }),
    ).toBeNull()
    expect(
      await readNutritionV2Cache({
        userId: COACH_A,
        clientId: CLIENT_A,
        kind: 'clientDetail',
        scopeKey: 's1',
        schema: PayloadSchema,
      }),
    ).toBeNull()
    expect(
      await readNutritionV2Cache({ userId: COACH_B, kind: 'today', scopeKey: 's1', schema: PayloadSchema }),
    ).toEqual({ payload: { value: 3 }, stale: false, storedAt: expect.any(Number) })
  })
})

describe('lectura con userId distinto al almacenado - borra y devuelve null', () => {
  // safeSegment() sanitiza caracteres no [a-zA-Z0-9:_-] a '-', asi que dos userId "distintos" a nivel
  // de negocio pueden colisionar en la MISMA storage key tras sanitizar. El guard interno
  // `parsed.userId !== input.userId` es la ultima linea de defensa contra servir la entrada de otro usuario.
  it('colision de safeSegment: el guard interno detecta el mismatch, borra y devuelve null', async () => {
    const storedAsUserId = 'coach a' // sanitiza a "coach-a"
    const readAsUserId = 'coach-a' // ya es "coach-a": MISMA storage key

    await writeNutritionV2Cache({
      userId: storedAsUserId,
      kind: 'today',
      scopeKey: 's1',
      payload: { value: 1 },
    })

    const mismatched = await readNutritionV2Cache({
      userId: readAsUserId,
      kind: 'today',
      scopeKey: 's1',
      schema: PayloadSchema,
    })
    expect(mismatched).toBeNull()

    const afterPurge = await readNutritionV2Cache({
      userId: storedAsUserId,
      kind: 'today',
      scopeKey: 's1',
      schema: PayloadSchema,
    })
    expect(afterPurge).toBeNull()
  })
})

describe('removeNutritionV2Cache', () => {
  it('borra la entrada puntual sin afectar otras keys', async () => {
    await writeNutritionV2Cache({ userId: COACH_A, kind: 'today', scopeKey: 's1', payload: { value: 1 } })
    await writeNutritionV2Cache({ userId: COACH_A, kind: 'plan', scopeKey: 's1', payload: { value: 2 } })

    await removeNutritionV2Cache({ userId: COACH_A, kind: 'today', scopeKey: 's1' })

    expect(
      await readNutritionV2Cache({ userId: COACH_A, kind: 'today', scopeKey: 's1', schema: PayloadSchema }),
    ).toBeNull()
    expect(
      await readNutritionV2Cache({ userId: COACH_A, kind: 'plan', scopeKey: 's1', schema: PayloadSchema }),
    ).toEqual({ payload: { value: 2 }, stale: false, storedAt: expect.any(Number) })
  })
})
