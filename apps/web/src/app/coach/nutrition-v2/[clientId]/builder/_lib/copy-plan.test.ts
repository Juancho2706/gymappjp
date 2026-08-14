import { describe, it, expect } from 'vitest'
import {
  NEXT_DAYS_QUICK_PICKS,
  copyPlanWarning,
  nextDaysFrom,
  planCopy,
  targetsForNextDays,
  type CopyDestination,
} from './copy-plan'

/** Destino ocupado con las franjas que ya tiene. */
function taken(dayOfWeek: number, slotNames: string[]): CopyDestination {
  return { dayOfWeek, slotNames, occupied: true }
}

/** Destino libre: el dia todavia no es propio. */
function free(dayOfWeek: number): CopyDestination {
  return { dayOfWeek, slotNames: [], occupied: false }
}

describe('nextDaysFrom', () => {
  it('da los proximos dias en orden calendario', () => {
    expect(nextDaysFrom(1, 1)).toEqual([2])
    expect(nextDaysFrom(1, 4)).toEqual([2, 3, 4, 5])
  })

  it('da la vuelta a la semana', () => {
    // Viernes + 4 => sabado, domingo, lunes, martes.
    expect(nextDaysFrom(5, 4)).toEqual([6, 0, 1, 2])
    // Domingo es el ultimo de la semana de lectura: sigue el lunes.
    expect(nextDaysFrom(0, 2)).toEqual([1, 2])
  })

  it('nunca devuelve el dia de origen ni mas de 6 dias', () => {
    const all = nextDaysFrom(3, 99)
    expect(all).toHaveLength(6)
    expect(all).not.toContain(3)
    expect(new Set(all).size).toBe(6)
  })

  it('el dia BASE no tiene "proximos": devuelve vacio', () => {
    // Sin lugar en la semana, inventarle un origen seria adivinar por el coach.
    expect(nextDaysFrom(null, 2)).toEqual([])
  })

  it('cantidades invalidas no rompen', () => {
    expect(nextDaysFrom(1, 0)).toEqual([])
    expect(nextDaysFrom(1, -3)).toEqual([])
    expect(nextDaysFrom(1, Number.NaN)).toEqual([])
  })

  it('las cantidades ofrecidas caben en la semana', () => {
    for (const count of NEXT_DAYS_QUICK_PICKS) {
      expect(nextDaysFrom(1, count)).toHaveLength(count)
    }
  })
})

describe('targetsForNextDays (quick-select del menu de la franja, decision A)', () => {
  const targets = [
    { key: 'ma', dayOfWeek: 2 },
    { key: 'ju', dayOfWeek: 4 },
    { key: 'sa', dayOfWeek: 6 },
    { key: 'base', dayOfWeek: null },
  ]

  it('marca solo los dias que existen como variante: los "proximos" sin variante no entran', () => {
    // Lunes + 2 => martes y miercoles, pero miercoles no existe como dia propio.
    expect(targetsForNextDays(targets, 1, 2)).toEqual(['ma'])
    // Lunes + 4 => Ma-Vi; existen martes y jueves.
    expect(targetsForNextDays(targets, 1, 4)).toEqual(['ma', 'ju'])
  })

  it('da la vuelta a la semana y nunca marca el dia base', () => {
    // Viernes + 4 => Sa, Do, Lu, Ma; existen sabado y martes. La base (null) jamas entra.
    expect(targetsForNextDays(targets, 5, 4)).toEqual(['ma', 'sa'])
  })

  it('desde el dia BASE devuelve vacio (no hay "proximos" respecto de el)', () => {
    expect(targetsForNextDays(targets, null, 2)).toEqual([])
  })
})

describe('planCopy — modo replace (comportamiento historico)', () => {
  it('marca los ocupados como reemplazados y los libres como creados', () => {
    const plan = planCopy({
      mode: 'replace',
      sourceSlotNames: ['Desayuno', 'Almuerzo'],
      destinations: [free(2), taken(3, ['Cena'])],
      room: 7,
    })

    expect(plan.createdDays).toEqual([2])
    expect(plan.replacedDays).toEqual([3])
    expect(plan.appendedDays).toEqual([])
    // El destino queda IGUAL al origen: lo que "suma" es el origen entero.
    expect(plan.entries.map((e) => e.slotsAdded)).toEqual([2, 2])
    // Reemplazar no duplica nunca: el contenido viejo no sobrevive.
    expect(plan.duplicatedNames).toEqual([])
  })
})

describe('planCopy — modo append (D2: suma franjas, no pisa)', () => {
  it('suma a los ocupados sin marcarlos como reemplazados', () => {
    const plan = planCopy({
      mode: 'append',
      sourceSlotNames: ['Colación'],
      destinations: [taken(3, ['Cena'])],
      room: 7,
    })

    expect(plan.replacedDays).toEqual([])
    expect(plan.appendedDays).toEqual([3])
    expect(plan.entries[0].slotsAdded).toBe(1)
    expect(plan.duplicatedNames).toEqual([])
  })

  it('avisa que nombres van a quedar repetidos, comparando sin mayusculas ni espacios', () => {
    const plan = planCopy({
      mode: 'append',
      sourceSlotNames: ['Desayuno', 'Colación'],
      destinations: [taken(3, [' desayuno ', 'Cena'])],
      room: 7,
    })

    expect(plan.duplicatedNames).toEqual(['Desayuno'])
    expect(plan.entries[0].duplicatedNames).toEqual(['Desayuno'])
  })

  it('un dia que se CREA no puede duplicar nada', () => {
    const plan = planCopy({
      mode: 'append',
      sourceSlotNames: ['Desayuno'],
      destinations: [free(4)],
      room: 7,
    })

    expect(plan.duplicatedNames).toEqual([])
    expect(plan.createdDays).toEqual([4])
  })
})

describe('planCopy — cupo y saneamiento', () => {
  it('los ocupados no consumen cupo; los libres que no entran quedan marcados', () => {
    const plan = planCopy({
      mode: 'replace',
      sourceSlotNames: ['Desayuno'],
      destinations: [taken(2, ['Cena']), free(3), free(4)],
      room: 1,
    })

    expect(plan.replacedDays).toEqual([2])
    expect(plan.createdDays).toEqual([3])
    expect(plan.skippedDays).toEqual([4])
    expect(plan.entries.find((e) => e.dayOfWeek === 4)?.slotsAdded).toBe(0)
  })

  it('un dia repetido en la seleccion se cuenta una sola vez', () => {
    const plan = planCopy({
      mode: 'replace',
      sourceSlotNames: ['Desayuno'],
      destinations: [free(3), free(3)],
      room: 7,
    })

    expect(plan.entries).toHaveLength(1)
    expect(plan.createdDays).toEqual([3])
  })

  it('room invalido se trata como cero', () => {
    const plan = planCopy({
      mode: 'replace',
      sourceSlotNames: ['Desayuno'],
      destinations: [free(3)],
      room: Number.NaN,
    })

    expect(plan.createdDays).toEqual([])
    expect(plan.skippedDays).toEqual([3])
  })
})

describe('copyPlanWarning', () => {
  it('no advierte nada cuando solo se crean dias libres', () => {
    const plan = planCopy({ mode: 'replace', sourceSlotNames: ['Desayuno'], destinations: [free(3)], room: 7 })
    expect(copyPlanWarning(plan)).toBeNull()
  })

  it('nombra pisar y sumar distinto', () => {
    const replace = planCopy({
      mode: 'replace',
      sourceSlotNames: ['Desayuno'],
      destinations: [taken(3, ['Cena']), taken(4, ['Cena'])],
      room: 7,
    })
    expect(copyPlanWarning(replace)).toContain('Se reemplazan 2 días')

    const append = planCopy({
      mode: 'append',
      sourceSlotNames: ['Desayuno'],
      destinations: [taken(3, ['Desayuno'])],
      room: 7,
    })
    const warning = copyPlanWarning(append)
    expect(warning).toContain('Se suman franjas a 1 día')
    expect(warning).toContain('Quedan franjas repetidas: Desayuno')
  })

  it('avisa los dias que quedan afuera por el tope', () => {
    const plan = planCopy({
      mode: 'replace',
      sourceSlotNames: ['Desayuno'],
      destinations: [free(3), free(4)],
      room: 0,
    })
    expect(copyPlanWarning(plan)).toContain('Quedan 2 días afuera')
  })
})
