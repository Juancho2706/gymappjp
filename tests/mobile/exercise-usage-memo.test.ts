// Una sola query de uso por ejercicio (ítem 18 del tren «Arreglos chicos pre-OTA», R11).
//
// `countExerciseUsage` (apps/mobile/lib/exercises.ts) memoiza el conteo por id porque el flujo real
// es preview → «Editar»: dos hojas preguntando lo mismo. Lo que se prueba:
//   1. dos llamadas con el mismo id ⇒ UNA sola consulta a `workout_blocks`;
//   2. una consulta con error NO se cachea (devuelve 0, pero la siguiente vuelve a preguntar);
//   3. una mutación del catálogo (borrar) invalida el conteo de ese id.
//
// GOTCHA de resolución (patrón de `coach-dashboard-agenda.test.ts:21-38`): dependencias mockeadas
// por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico, y `vi.resetModules()` en cada carga para
// que el memo de módulo arranque vacío en cada caso.
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

type Mod = typeof import('../../apps/mobile/lib/exercises')

const COACH = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const EXERCISE = 'eeeeeeee-2222-4222-8222-eeeeeeeeeeee'

/** Respuestas programables del mock de Supabase. */
let countResponse: { count: number | null; error: { message: string } | null }
let deleteResponse: { data: { id: string }[] | null; error: { message: string } | null }
/** Cuántas veces se consultó de verdad `workout_blocks`. */
let countQueries = 0

const supabaseMock = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: COACH } }, error: null })) },
  from: vi.fn((table: string) => {
    if (table === 'workout_blocks') {
      return {
        select: () => ({
          eq: () => {
            countQueries += 1
            return Promise.resolve(countResponse)
          },
        }),
      }
    }
    // `exercises`: solo el camino del soft-delete, que es el que invalida el memo.
    return {
      update: () => ({
        eq: () => ({
          eq: () => ({ select: () => Promise.resolve(deleteResponse) }),
        }),
      }),
    }
  }),
}

async function loadModule(): Promise<Mod> {
  vi.resetModules()
  vi.doMock(mobileDep('expo-image-manipulator'), () => ({ manipulateAsync: vi.fn(), SaveFormat: { PNG: 'png' } }))
  vi.doMock(mobileDep('base64-arraybuffer'), () => ({ decode: vi.fn() }))
  vi.doMock(mobileLib('supabase.ts'), () => ({ supabase: supabaseMock }))
  vi.doMock(mobileLib('db-compat.ts'), () => ({ selectWithFallback: vi.fn() }))
  vi.doMock(mobileLib('org.ts'), () => ({ getCoachOrgContext: vi.fn(async () => ({ orgId: null })) }))
  return (await import(mobileLib('exercises.ts'))) as Mod
}

describe('countExerciseUsage — memo de módulo (ítem 18)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    countQueries = 0
    countResponse = { count: 3, error: null }
    deleteResponse = { data: [{ id: EXERCISE }], error: null }
  })

  it('dos llamadas con el mismo id ⇒ una sola query', async () => {
    const { countExerciseUsage } = await loadModule()

    expect(await countExerciseUsage(EXERCISE)).toBe(3)
    expect(await countExerciseUsage(EXERCISE)).toBe(3)

    expect(countQueries).toBe(1)
  })

  it('ids distintos se cuentan por separado', async () => {
    const { countExerciseUsage } = await loadModule()

    await countExerciseUsage(EXERCISE)
    await countExerciseUsage('ffffffff-3333-4333-8333-ffffffffffff')

    expect(countQueries).toBe(2)
  })

  it('el 0 de error NO se cachea: la siguiente llamada vuelve a consultar', async () => {
    const { countExerciseUsage } = await loadModule()
    countResponse = { count: null, error: { message: 'boom' } }

    expect(await countExerciseUsage(EXERCISE)).toBe(0)

    countResponse = { count: 5, error: null }
    expect(await countExerciseUsage(EXERCISE)).toBe(5)
    expect(countQueries).toBe(2)
  })

  it('borrar el ejercicio invalida su conteo', async () => {
    const { countExerciseUsage, deleteExercise } = await loadModule()

    expect(await countExerciseUsage(EXERCISE)).toBe(3)

    const result = await deleteExercise(EXERCISE)
    expect(result.ok).toBe(true)

    countResponse = { count: 0, error: null }
    expect(await countExerciseUsage(EXERCISE)).toBe(0)
    expect(countQueries).toBe(2)
  })

  it('un borrado que no tocó ninguna fila no invalida nada', async () => {
    const { countExerciseUsage, deleteExercise } = await loadModule()

    expect(await countExerciseUsage(EXERCISE)).toBe(3)

    deleteResponse = { data: [], error: null }
    const result = await deleteExercise(EXERCISE)
    expect(result.ok).toBe(false)

    expect(await countExerciseUsage(EXERCISE)).toBe(3)
    expect(countQueries).toBe(1)
  })
})
