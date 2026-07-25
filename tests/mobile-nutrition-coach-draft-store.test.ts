// 4B-14: suite del respaldo local de borradores del coach en Nutricion V2 RN
// (apps/mobile/lib/nutrition-coach-draft-store.ts). Cubre read/write/clear/sweep, TTL 7 dias,
// tope de tamano, keys CON clientId (gotcha PR #148) y el envelope con AMBOS reducers
// (state + portions) — la trampa de la unidad: persistir/rehidratar los dos, no solo `state`.
//
// GOTCHA de resolucion (igual que mobile-nutrition-v2-cache.test.ts): apps/mobile declara su
// PROPIA dependencia de @react-native-async-storage/async-storage, distinta de cualquier copia
// hoisteada a la raiz. Un `vi.mock(specifier)` desde tests/ NO intercepta el id que resuelve
// apps/mobile/lib. El fix es resolver el path REAL con `require.resolve({ paths: [mobileDir] })`
// y mockear ESE path absoluto con `vi.doMock` (no hoisteado), seguido de un `import()` dinamico.
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  NUTRITION_DRAFT_MAX_AGE_MS,
  builderDraftKey,
  clearNutritionDraft,
  quickEditDraftKey,
  readNutritionDraft,
  sweepStaleNutritionDrafts,
  writeNutritionDraft,
} = await import('../apps/mobile/lib/nutrition-coach-draft-store')

const NOW = new Date('2026-07-22T12:00:00.000Z').getTime()

// Payload representativo del quick-edit RN: los DOS reducers (state del arbol + portions).
interface DraftPayload {
  clientId: string
  planId: string
  baseVersionId: string
  state: { variants: Array<{ key: string; slots: unknown[] }> }
  portions: { bySlot: Record<string, Array<{ portions: number }>> }
}

function makePayload(overrides: Partial<DraftPayload> = {}): DraftPayload {
  return {
    clientId: 'client-a',
    planId: 'plan-1',
    baseVersionId: 'ver-1',
    state: { variants: [{ key: 'v1', slots: [{}] }] },
    portions: { bySlot: { 'slot-1': [{ portions: 2.5 }] } },
    ...overrides,
  }
}

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('keys — clientId SIEMPRE presente (gotcha PR #148)', () => {
  it('quickEditDraftKey aisla por clientId', () => {
    expect(quickEditDraftKey('client-a')).toBe('eva:nutrition-qe-draft:client-a')
    expect(quickEditDraftKey('client-a')).not.toBe(quickEditDraftKey('client-b'))
  })

  it('builderDraftKey lleva clientId + planId, y "new" cuando planId es null', () => {
    expect(builderDraftKey('client-a', 'plan-1')).toBe('eva:nutrition-builder-draft:client-a:plan-1')
    expect(builderDraftKey('client-a', null)).toBe('eva:nutrition-builder-draft:client-a:new')
    // Prefijos distintos: un borrador de quick-edit nunca colisiona con uno de builder.
    expect(quickEditDraftKey('client-a')).not.toBe(builderDraftKey('client-a', null))
  })
})

describe('write + read — round-trip del envelope con AMBOS reducers', () => {
  it('persiste y rehidrata state Y portions (no solo state)', async () => {
    const key = quickEditDraftKey('client-a')
    const payload = makePayload()
    expect(await writeNutritionDraft(key, payload, NOW)).toBe(true)

    const record = await readNutritionDraft<DraftPayload>(key, NOW)
    expect(record).not.toBeNull()
    expect(record?.v).toBe(1)
    expect(record?.savedAt).toBe(NOW)
    // La trampa: ambos reducers sobreviven el round-trip.
    expect(record?.payload.state.variants).toHaveLength(1)
    expect(record?.payload.portions.bySlot['slot-1'][0].portions).toBe(2.5)
    expect(record?.payload.baseVersionId).toBe('ver-1')
  })

  it('read devuelve null ante ausencia', async () => {
    expect(await readNutritionDraft(quickEditDraftKey('nadie'), NOW)).toBeNull()
  })

  it('read devuelve null ante basura no-JSON', async () => {
    const key = quickEditDraftKey('client-a')
    store.set(key, '{no es json')
    expect(await readNutritionDraft(key, NOW)).toBeNull()
  })

  it('read descarta version desconocida (v !== 1)', async () => {
    const key = quickEditDraftKey('client-a')
    store.set(key, JSON.stringify({ v: 2, savedAt: NOW, payload: makePayload() }))
    expect(await readNutritionDraft(key, NOW)).toBeNull()
  })

  it('read descarta payload no-objeto', async () => {
    const key = quickEditDraftKey('client-a')
    store.set(key, JSON.stringify({ v: 1, savedAt: NOW, payload: 'texto' }))
    expect(await readNutritionDraft(key, NOW)).toBeNull()
  })
})

describe('TTL 7 dias', () => {
  it('el maximo es exactamente 7 dias', () => {
    expect(NUTRITION_DRAFT_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('read descarta un borrador vencido (>= TTL)', async () => {
    const key = quickEditDraftKey('client-a')
    const savedAt = NOW - NUTRITION_DRAFT_MAX_AGE_MS
    store.set(key, JSON.stringify({ v: 1, savedAt, payload: makePayload() }))
    // Exactamente en el limite ya se considera vencido (nowMs - savedAt >= maxAgeMs).
    expect(await readNutritionDraft(key, NOW)).toBeNull()
  })

  it('read conserva un borrador dentro del TTL', async () => {
    const key = quickEditDraftKey('client-a')
    const savedAt = NOW - (NUTRITION_DRAFT_MAX_AGE_MS - 1000)
    store.set(key, JSON.stringify({ v: 1, savedAt, payload: makePayload() }))
    expect(await readNutritionDraft(key, NOW)).not.toBeNull()
  })
})

describe('write — tope de tamano', () => {
  it('rechaza payloads gigantes (> 450_000 chars) sin escribir', async () => {
    const key = quickEditDraftKey('client-a')
    const huge = makePayload({ planId: 'x'.repeat(500_000) })
    expect(await writeNutritionDraft(key, huge, NOW)).toBe(false)
    expect(store.has(key)).toBe(false)
    expect(asyncStorageMock.setItem).not.toHaveBeenCalled()
  })
})

describe('clear — best-effort', () => {
  it('borra la key indicada', async () => {
    const key = quickEditDraftKey('client-a')
    await writeNutritionDraft(key, makePayload(), NOW)
    expect(store.has(key)).toBe(true)
    await clearNutritionDraft(key)
    expect(store.has(key)).toBe(false)
  })
})

describe('sweep — barre ambos prefijos, deja lo vivo', () => {
  it('elimina vencidos/basura de qe y builder, conserva los vigentes; ignora otras keys', async () => {
    const qeStale = quickEditDraftKey('viejo')
    const qeFresh = quickEditDraftKey('nuevo')
    const builderStale = builderDraftKey('viejo', 'plan-9')
    const builderFresh = builderDraftKey('nuevo', null)
    const ajeno = 'eva:otra-cache:foo'

    store.set(qeStale, JSON.stringify({ v: 1, savedAt: NOW - NUTRITION_DRAFT_MAX_AGE_MS, payload: makePayload() }))
    store.set(builderStale, '{basura')
    await writeNutritionDraft(qeFresh, makePayload(), NOW)
    await writeNutritionDraft(builderFresh, makePayload(), NOW)
    store.set(ajeno, 'no-tocar')

    await sweepStaleNutritionDrafts(NOW)

    expect(store.has(qeStale)).toBe(false)
    expect(store.has(builderStale)).toBe(false)
    expect(store.has(qeFresh)).toBe(true)
    expect(store.has(builderFresh)).toBe(true)
    // El sweep jamas toca keys fuera de los dos prefijos de nutricion.
    expect(store.has(ajeno)).toBe(true)
  })
})

describe('best-effort — degrada sin romper cuando AsyncStorage falla', () => {
  it('write devuelve false y read null si setItem/getItem lanzan', async () => {
    asyncStorageMock.setItem.mockRejectedValueOnce(new Error('quota'))
    expect(await writeNutritionDraft(quickEditDraftKey('client-a'), makePayload(), NOW)).toBe(false)

    asyncStorageMock.getItem.mockRejectedValueOnce(new Error('io'))
    expect(await readNutritionDraft(quickEditDraftKey('client-a'), NOW)).toBeNull()
  })
})
