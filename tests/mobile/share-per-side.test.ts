/**
 * Share Entreno RN con fuerza POR LADO — `apps/mobile/components/alumno/share/build-share-data.ts`
 * (tren «Ciclo real y por lado», tarea W3.x / R34; caso §1.6 de TESTING-QA).
 *
 * R3 deja `reps_done` = el lado MÁS BAJO y manda el desglose en `metadata {left_reps, right_reps}`.
 * Sin leer ese jsonb el card mostraría LA MITAD del volumen que el resumen de sesión que lo abrió
 * (`summarizeSessionByKind`) y que el tonelaje de la ficha del coach. El reparto de R34:
 *
 *   - `totalReps` y `totalVolumeKg` ⇒ `izq + der` (misma fórmula que el motor);
 *   - `topSetLabelFor` y `repsAtMax` ⇒ siguen con `reps_done`, porque el top set es una COMPARACIÓN
 *     entre series y el e1RM se calcula sobre una serie: cambiarles la base movería el orden y
 *     inflaría el récord. Lo único que cambia ahí es lo que se imprime («10 / 10»).
 *
 * El módulo es lógica pura (sin react-native): se importa directo, sin mocks.
 */
import { describe, expect, it } from 'vitest'
import { summarizeSessionByKind, type SummaryBlock, type SummaryLogLike } from '@eva/workout-engine'
import { epleyOneRM } from '@eva/profile-analytics'
import { buildWorkoutShareData } from '../../apps/mobile/components/alumno/share/build-share-data'

const EXERCISE = {
  id: 'ex-1',
  name: 'Zancada búlgara',
  muscle_group: 'Piernas',
  exercise_type: 'strength',
}
const BLOCKS: SummaryBlock[] = [{ id: 'blk-1', exercises: EXERCISE }]

function log(over: Partial<SummaryLogLike>): SummaryLogLike {
  return { block_id: 'blk-1', set_number: 1, weight_kg: 20, reps_done: 10, ...over }
}

function build(logs: SummaryLogLike[], exerciseMaxes: Record<string, number> = {}) {
  return buildWorkoutShareData({
    blocks: BLOCKS,
    logs,
    exerciseMaxes,
    planTitle: 'Tren inferior',
    todayISO: '2026-09-03',
  })
}

/** Tres series iguales de 20 kg × 10, la forma clásica sin nada por lado. */
const SIN_METADATA = [1, 2, 3].map((n) => log({ set_number: n }))
/** Las MISMAS tres series registradas por lado: 10 izquierda y 10 derecha con el mismo peso. */
const CON_METADATA = [1, 2, 3].map((n) => log({ set_number: n, metadata: { left_reps: 10, right_reps: 10 } }))

describe('build-share-data · sin metadata la salida es la de hoy', () => {
  it('totales y top set byte-idénticos al comportamiento previo', () => {
    const data = build(SIN_METADATA)

    expect(data.completedSets).toBe(3)
    expect(data.totalReps).toBe(30)
    expect(data.totalVolumeKg).toBe(600)
    expect(data.exercises).toEqual([
      {
        exerciseId: 'ex-1',
        name: 'Zancada búlgara',
        setsCount: 3,
        topSetLabel: '3×10 · 20 kg',
        isRecord: false,
      },
    ])
  })

  it('una metadata que NO trae los dos lados deja la salida idéntica a la de sin metadata', () => {
    const base = JSON.stringify(build(SIN_METADATA))
    const basuras: SummaryLogLike['metadata'][] = [
      null,
      { left_reps: 10 },
      { left_reps: 10, right_reps: null },
      { left_reps: -1, right_reps: 10 } as SummaryLogLike['metadata'],
      // Hold por lado de MOVILIDAD: otro eje, no son reps.
      { left_sec: 30, right_sec: 25 } as unknown as SummaryLogLike['metadata'],
    ]

    for (const metadata of basuras) {
      const conBasura = build([1, 2, 3].map((n) => log({ set_number: n, metadata })))
      expect(JSON.stringify({ ...conBasura, muscles: conBasura.muscles })).toBe(base)
    }
  })
})

describe('build-share-data · con «10 / 10 · 20 kg» (R34)', () => {
  it('el volumen suma los dos lados y COINCIDE con el del resumen de sesión', () => {
    const data = build(CON_METADATA)
    const resumen = summarizeSessionByKind(BLOCKS, CON_METADATA)

    // 20 kg × (10 + 10) × 3 series.
    expect(data.totalVolumeKg).toBe(1200)
    // Aserción cruzada contra el motor: el card no puede contradecir a la pantalla que lo abrió.
    expect(data.totalVolumeKg).toBe(resumen.strength[0]!.totalVolume)
    // …y es exactamente el DOBLE de lo que salía leyendo `reps_done` crudo (el bug que cierra W3.x).
    expect(data.totalVolumeKg).toBe(build(SIN_METADATA).totalVolumeKg * 2)
    expect(data.totalReps).toBe(60)
    // Las series registradas no cambian: son 3, no 6.
    expect(data.completedSets).toBe(3)
  })

  it('el top set imprime «10 / 10» y sigue agrupando por serie', () => {
    expect(build(CON_METADATA).exercises[0]!.topSetLabel).toBe('3×10 / 10 · 20 kg')
  })

  it('el top set NO cambia de serie: la comparación sigue siendo `reps_done` (el mínimo)', () => {
    // A: 8 y 20 (suma 28, mínimo 8) · B: 10 y 10 (suma 20, mínimo 10). Con la SUMA ganaría A.
    const logs = [
      log({ set_number: 1, metadata: { left_reps: 8, right_reps: 20 }, reps_done: 8 }),
      log({ set_number: 2, metadata: { left_reps: 10, right_reps: 10 }, reps_done: 10 }),
    ]

    expect(build(logs).exercises[0]!.topSetLabel).toBe('1×10 / 10 · 20 kg')
  })

  it('dos series con el mismo `reps_done` pero distinto desglose no se funden en un «2×»', () => {
    const logs = [
      log({ set_number: 1, metadata: { left_reps: 10, right_reps: 12 } }),
      log({ set_number: 2, metadata: { left_reps: 10, right_reps: 10 } }),
    ]

    // Misma serie ganadora (empate de peso y reps ⇒ la primera), contada UNA vez.
    expect(build(logs).exercises[0]!.topSetLabel).toBe('1×10 / 12 · 20 kg')
  })

  it('el récord usa `reps_done` para el e1RM, no la suma de los lados', () => {
    const logs = [
      log({ set_number: 1, weight_kg: 20, reps_done: 10, metadata: { left_reps: 10, right_reps: 14 } }),
      log({ set_number: 2, weight_kg: 22.5, reps_done: 10, metadata: { left_reps: 10, right_reps: 14 } }),
    ]

    const [record] = build(logs, { 'ex-1': 15 }).records

    expect(record).toMatchObject({ exerciseId: 'ex-1', weightKg: 22.5 })
    expect(record!.oneRmEstKg).toBe(Math.round(epleyOneRM(22.5, 10) * 10) / 10)
    expect(record!.oneRmEstKg).not.toBe(Math.round(epleyOneRM(22.5, 24) * 10) / 10)
  })
})
