/**
 * «Cambiar ejercicio» filtra por tipo EFECTIVO en RN — `apps/mobile/lib/workout/substitution.ts`
 * (tren «Ciclo real y por lado», tarea W3.7 / R5; espejo exacto de W2.10 en web).
 *
 * La regla, idéntica en las dos plataformas (`effectiveExerciseType` del motor): el tipo con el que
 * se busca reemplazo es `exercise_type_override > exercises.exercise_type > 'strength'`. Un press
 * marcado `mobility` EN ESE BLOQUE ofrece movilidad, no fuerza. En `strength` el filtro admite
 * además los del catálogo SIN tipo (su tipo efectivo ES fuerza): excluirlos vaciaría el sheet en los
 * catálogos legacy. Espejo literal de `apps/web/.../_data/substitution.queries.ts` (W2.10).
 *
 * Se ejercita la capa de datos REAL contra un PostgREST de mentira que registra el filtro emitido;
 * `supabase` y `client` (perfil del alumno) se mockean por path resuelto desde `apps/mobile`
 * (patrón de `coach-branding-rpc.test.ts`).
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectiveExerciseType } from '@eva/workout-engine'

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (...seg: string[]) => path.resolve(mobileDir, 'lib', ...seg)

const BLOCK_ID = '11111111-2222-4333-8444-555555555555'

type BlockRow = {
  exercise_id: string | null
  exercise_type_override?: string | null
  exercises: {
    id: string
    name: string
    muscle_group: string | null
    equipment: string | null
    exercise_type: string | null
    secondary_muscles: string[] | null
  } | null
}

const CANDIDATES = [
  {
    id: 'ex-2',
    name: 'Estocada con mancuernas',
    muscle_group: 'Piernas',
    equipment: 'dumbbell',
    exercise_type: 'strength',
    secondary_muscles: null,
    coach_id: null,
    org_id: null,
    team_id: null,
  },
]

function blockRow(over: Partial<BlockRow> & { exercise_type?: string | null }): BlockRow {
  const { exercise_type = 'strength', ...rest } = over
  return {
    exercise_id: 'ex-1',
    exercises: {
      id: 'ex-1',
      name: 'Zancada búlgara',
      muscle_group: 'Piernas',
      equipment: 'machine',
      exercise_type,
      secondary_muscles: null,
    },
    ...rest,
  }
}

/** Monta la capa de datos con un PostgREST de mentira que anota el `select` y los `.eq` emitidos. */
async function setup(block: BlockRow) {
  const seen = { blockSelect: '', exercisesEq: [] as [string, unknown][], exercisesOr: [] as string[] }

  const blocksBuilder = {
    select(cols: string) {
      seen.blockSelect = cols
      return this
    },
    eq() {
      return this
    },
    maybeSingle: async () => ({ data: block, error: null }),
  }
  const exercisesBuilder = {
    select() {
      return this
    },
    or(filter: string) {
      seen.exercisesOr.push(filter)
      return this
    },
    is() {
      return this
    },
    eq(col: string, value: unknown) {
      seen.exercisesEq.push([col, value])
      return this
    },
    neq() {
      return this
    },
    order() {
      return this
    },
    limit: async () => ({ data: CANDIDATES, error: null }),
  }

  vi.resetModules()
  vi.doMock(mobileLib('supabase.ts'), () => ({
    supabase: { from: (table: string) => (table === 'workout_blocks' ? blocksBuilder : exercisesBuilder) },
  }))
  vi.doMock(mobileLib('client.ts'), () => ({
    getClientProfile: vi.fn(async () => ({ id: 'cli-1', coachId: 'coach-1' })),
  }))

  const mod = (await import(mobileLib('workout', 'substitution.ts'))) as typeof import('../../apps/mobile/lib/workout/substitution')
  return { ...mod, seen }
}

/**
 * Filtro de tipo que emitió la query, normalizado a un string comparable entre plataformas:
 * `'mobility'` para el `.eq`, `'strength|null'` para el `.or` de fuerza, `null` si no filtró.
 */
function typeFilterOf(seen: { exercisesEq: [string, unknown][]; exercisesOr: string[] }): string | null {
  const eq = seen.exercisesEq.find(([col]) => col === 'exercise_type')
  if (eq) return String(eq[1])
  const or = seen.exercisesOr.find((f) => f.includes('exercise_type'))
  if (or === 'exercise_type.eq.strength,exercise_type.is.null') return 'strength|null'
  return or ?? null
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchSubstituteCandidates · filtro por tipo efectivo (R5)', () => {
  it('el override del BLOQUE manda sobre el tipo de catálogo del ejercicio', async () => {
    const { fetchSubstituteCandidates, seen } = await setup(
      blockRow({ exercise_type: 'strength', exercise_type_override: 'mobility' }),
    )

    const res = await fetchSubstituteCandidates(BLOCK_ID)

    // Con override `mobility` sobre un ejercicio de catálogo `strength`, los candidatos son de movilidad.
    expect(typeFilterOf(seen)).toBe('mobility')
    expect(res?.current.exercise_type).toBe('mobility')
    // Y la columna del override viaja en el select del bloque (si no, el override sería invisible).
    expect(seen.blockSelect).toContain('exercise_type_override')
  })

  it('sin override, fuerza admite además el catálogo SIN tipo (el sheet legacy no queda vacío)', async () => {
    const { fetchSubstituteCandidates, seen } = await setup(blockRow({ exercise_type: 'strength' }))

    const res = await fetchSubstituteCandidates(BLOCK_ID)

    expect(typeFilterOf(seen)).toBe('strength|null')
    expect(res?.current.exercise_type).toBe('strength')
  })

  it('sin override y sin tipo de catálogo, el bloque legacy resuelve «strength»', async () => {
    const { fetchSubstituteCandidates, seen } = await setup(blockRow({ exercise_type: null }))

    const res = await fetchSubstituteCandidates(BLOCK_ID)

    expect(typeFilterOf(seen)).toBe('strength|null')
    expect(res?.current.exercise_type).toBe('strength')
    expect(res?.candidates).toHaveLength(1)
  })

  it('paridad con web: el filtro emitido sale del MISMO `effectiveExerciseType` en cada combinación', async () => {
    // Misma regla que aplica `apps/web/.../_data/substitution.queries.ts` (W2.10), calculada con el
    // helper del motor —no con un literal copiado—: si RN y web difieren, el mismo bloque ofrece
    // reemplazos distintos en la PWA y en la app.
    const reglaWeb = (override: string | null, catalogo: string | null) => {
      const tipo = effectiveExerciseType({ exercise_type_override: override }, { exercise_type: catalogo })
      return tipo === 'strength' ? 'strength|null' : tipo
    }
    const casos: [string | null, string | null][] = [
      ['mobility', 'strength'],
      ['strength', 'mobility'],
      ['cardio', null],
      [null, 'roller'],
      [null, null],
      // Override basura (no es un tipo del enum) ⇒ cae al del catálogo, como en el motor.
      ['no-existe', 'cardio'],
    ]

    for (const [override, catalogo] of casos) {
      const { fetchSubstituteCandidates, seen } = await setup(
        blockRow({ exercise_type: catalogo, exercise_type_override: override }),
      )
      await fetchSubstituteCandidates(BLOCK_ID)
      expect(typeFilterOf(seen)).toEqual(reglaWeb(override, catalogo))
    }
  })

  it('un blockId malformado sigue rebotando antes de tocar la red', async () => {
    const { fetchSubstituteCandidates, InvalidBlockIdError } = await setup(blockRow({}))

    await expect(fetchSubstituteCandidates('no-es-un-guid')).rejects.toBeInstanceOf(InvalidBlockIdError)
  })
})
