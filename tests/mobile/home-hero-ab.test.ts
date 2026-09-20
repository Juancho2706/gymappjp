/**
 * Hero y «Próximo» del home alumno (punto 4 del SPEC `docs/specs/vuelta-nueva-salud-y-reloj`).
 *
 * Los dos bugs que cubre, los dos SOLO de la app (la web ya se comporta así,
 * `heroComplianceBundle.ts:256`):
 *   · Semanal A/B: el hero salía de `plans.find(p => p.day_of_week === todayDbDay)` sobre TODOS los
 *     planes, sin mirar la variante ⇒ en semana B el alumno veía el entreno de la semana A.
 *   · «Próximo» de los días SIN plan: caía a `plans[0]` de una lista ordenada por `day_of_week` ⇒ un
 *     martes de un Lun/Mié/Vie anunciaba el del LUNES, un día que ya pasó (249 programas `weekly`).
 *
 * Se prueban los helpers PUROS (`hero-plans.ts`) contra el cursor REAL (`deriveProgramCursor`, el
 * mismo adaptador que monta `home.tsx`): si el shell dejara de filtrar por variante, o si «Próximo»
 * volviera a mirar la lista cruda, estos casos fallan sin montar la pantalla.
 */
import { describe, expect, it } from 'vitest'
import {
  CYCLE_CURSOR_FIXTURES,
  type CycleCursorPlan,
  type CycleCursorProgram,
  type DayCompletionBlock,
} from '@eva/workout-engine'
import { deriveProgramCursor } from '../../apps/mobile/components/alumno/home/program-cursor'
import { heroPlansFromCursor, selectProgramPlans } from '../../apps/mobile/components/alumno/home/hero-plans'
import type { Plan, Program } from '../../apps/mobile/components/alumno/home/types'

/** Un plan del programa con un bloque de 3 series (denominador del día). */
function plan(id: string, title: string, dayOfWeek: number, weekVariant: string | null): Plan {
  return {
    id,
    title,
    day_of_week: dayOfWeek,
    assigned_date: null,
    week_variant: weekVariant,
    blockCount: 1,
    blocks: [{ id: `${id}-b1`, name: 'Ejercicio', sets: 3, reps: '10' }],
  }
}

function program(plans: Plan[], over: Partial<Program> = {}): Program {
  return {
    id: 'prog-1',
    name: 'Programa',
    plans,
    phases: null,
    weeksToRepeat: 8,
    // 2026-09-07 es lunes: con `weeks_to_repeat` vigente, la semana del 14-09 es la 2.ª ⇒ variante B.
    startDate: '2026-09-07',
    abMode: false,
    structureType: 'weekly',
    cycleLength: null,
    startDateFlexible: null,
    ...over,
  }
}

/** Hero + «Próximo» tal como los arma el shell: selección por variante → cursor → planes. */
function heroOf(prog: Program, todayIso: string, today: Date) {
  const { programPlans, activeVariant } = selectProgramPlans(prog.plans, prog, today)
  const cursor = deriveProgramCursor({ program: prog, plans: programPlans, logs: [], todayIso })
  const planById = new Map(prog.plans.map((p) => [p.id, p]))
  return { ...heroPlansFromCursor(cursor, planById), activeVariant, cursor }
}

// Semana 2 del programa (variante B) — lunes 14, martes 15, jueves 17, sábado 19, domingo 20.
// `date` es un INSTANTE absoluto a mediodía UTC, no `new Date(2026, 8, 14)` (medianoche local):
// `programWeekIndex1Based` parsea `start_date` como medianoche UTC y cuenta días con `ceil`, así
// que a medianoche local el lunes 14 cae en el borde exacto de 7 días y la semana depende de la
// zona horaria del runner (en Chile 7 d + 3 h ⇒ semana 2; en el CI, UTC, 7 d justos ⇒ semana 1).
// Ese borde es comportamiento heredado de la web (pendiente #15 del TASKS); el test no lo pisa.
const MON_B = { iso: '2026-09-14', date: new Date('2026-09-14T12:00:00Z') }
const TUE_B = { iso: '2026-09-15', date: new Date('2026-09-15T12:00:00Z') }
const THU_B = { iso: '2026-09-17', date: new Date('2026-09-17T12:00:00Z') }
const SAT_B = { iso: '2026-09-19', date: new Date('2026-09-19T12:00:00Z') }
const SUN_B = { iso: '2026-09-20', date: new Date('2026-09-20T12:00:00Z') }

describe('CA4.1/CA4.2 — semanal A/B: el hero es el de la variante que toca', () => {
  const abPlans = [
    plan('a-lun', 'Pierna A', 1, 'A'),
    plan('b-lun', 'Pierna B', 1, 'B'),
    plan('a-mar', 'Torso A', 2, 'A'),
    plan('b-jue', 'Torso B', 4, 'B'),
  ]
  const abProgram = program(abPlans, { abMode: true })

  it('semana B, lunes con plan A y B ⇒ el hero es el plan B', () => {
    const hero = heroOf(abProgram, MON_B.iso, MON_B.date)
    expect(hero.activeVariant).toBe('B')
    expect(hero.todayPlan?.id).toBe('b-lun')
    expect(hero.todayPlan?.title).toBe('Pierna B')
  })

  it('semana B, día que SÓLO tiene plan A (martes) ⇒ sin plan de hoy (Día de descanso)', () => {
    const hero = heroOf(abProgram, TUE_B.iso, TUE_B.date)
    expect(hero.todayPlan).toBeNull()
  })

  it('CA4.3 — «Próximo» es el siguiente día con plan de la VARIANTE activa, sin dar la vuelta', () => {
    // Martes de la semana B: el siguiente día con plan B es el jueves; el «Torso A» del martes y el
    // «Pierna B» del lunes (que ya pasó) no participan.
    expect(heroOf(abProgram, TUE_B.iso, TUE_B.date).nextPlan?.id).toBe('b-jue')
    // Sábado: ya no queda ningún día de la variante activa ⇒ «Recupera bien para la próxima sesión.»
    expect(heroOf(abProgram, SAT_B.iso, SAT_B.date).nextPlan).toBeNull()
  })
})

describe('CA4.4/CA4.5 — semanal SIN A/B (Lun/Mié/Vie)', () => {
  const lmvPlans = [
    plan('lun', 'Full body Lun', 1, null),
    plan('mie', 'Full body Mié', 3, null),
    plan('vie', 'Full body Vie', 5, null),
  ]
  const lmv = program(lmvPlans)

  it('`todayPlan` es IDÉNTICO a la búsqueda vieja (`day_of_week === ISODOW`)', () => {
    for (const day of [MON_B, TUE_B, THU_B, SAT_B, SUN_B]) {
      const { iso: todayIso, date } = day
      const dbDay = date.getDay() === 0 ? 7 : date.getDay()
      const legacy = lmvPlans.find((p) => p.day_of_week === dbDay) ?? null
      expect(heroOf(lmv, todayIso, date).todayPlan?.id ?? null).toBe(legacy?.id ?? null)
    }
  })

  it('martes ⇒ «Próximo» es el del MIÉRCOLES (antes decía el del lunes, un día que ya pasó)', () => {
    const hero = heroOf(lmv, TUE_B.iso, TUE_B.date)
    expect(hero.todayPlan).toBeNull()
    expect(hero.nextPlan?.id).toBe('mie')
    // La regla vieja devolvía `plans[0]` de la lista ordenada por `day_of_week`: el lunes.
    expect(hero.nextPlan?.id).not.toBe('lun')
  })

  it('jueves ⇒ «Próximo» es el del VIERNES', () => {
    expect(heroOf(lmv, THU_B.iso, THU_B.date).nextPlan?.id).toBe('vie')
  })

  it('sábado y domingo ⇒ sin «Próximo» (el cursor no da la vuelta a la semana)', () => {
    expect(heroOf(lmv, SAT_B.iso, SAT_B.date).nextPlan).toBeNull()
    expect(heroOf(lmv, SUN_B.iso, SUN_B.date).nextPlan).toBeNull()
  })

  it('un día CON plan también resuelve su «Próximo» (el hero no lo pinta, pero el cursor no miente)', () => {
    const hero = heroOf(lmv, MON_B.iso, MON_B.date)
    expect(hero.todayPlan?.id).toBe('lun')
    expect(hero.nextPlan?.id).toBe('mie')
  })
})

describe('CA4.5 — `cycle` sigue igual que hoy (fixtures compartidos del motor)', () => {
  /** Plan del home desde el plan del fixture (mismo armado que `cycle-cursor-parity.test.ts`). */
  function planOf(row: CycleCursorPlan, blocks: readonly DayCompletionBlock[] | undefined): Plan {
    return {
      id: row.id,
      title: row.title ?? '',
      day_of_week: row.day_of_week,
      assigned_date: null,
      week_variant: null,
      blockCount: (blocks ?? []).length,
      blocks: (blocks ?? []).map((b) => ({ id: b.id, name: 'Ejercicio', sets: b.sets ?? 0, reps: '10' })),
    }
  }
  function programOf(
    row: CycleCursorProgram,
    plans: readonly CycleCursorPlan[],
    blocksByPlan: Readonly<Record<string, readonly DayCompletionBlock[]>>,
  ): Program {
    return program(plans.map((p) => planOf(p, blocksByPlan[p.id])), {
      startDate: row.start_date,
      structureType: row.program_structure_type,
      cycleLength: row.cycle_length,
      startDateFlexible: row.start_date_flexible,
    })
  }

  for (const fixture of CYCLE_CURSOR_FIXTURES) {
    it(`fixture: ${fixture.name}`, () => {
      const prog = programOf(fixture.program, fixture.plans, fixture.blocksByPlan)
      const { programPlans } = selectProgramPlans(prog.plans, prog, new Date(`${fixture.todayIso}T12:00:00Z`))
      const cursor = deriveProgramCursor({
        program: prog,
        plans: programPlans,
        logs: fixture.logs,
        todayIso: fixture.todayIso,
      })
      const planById = new Map(prog.plans.map((p) => [p.id, p]))
      const { todayPlan, nextPlan } = heroPlansFromCursor(cursor, planById)
      // El hero del ciclo YA salía del cursor: el helper no puede cambiar ni un id.
      expect(todayPlan?.id ?? null).toBe(fixture.expectedCursor.todayPlanId)
      expect(nextPlan?.id ?? null).toBe(fixture.expectedCursor.nextPlanId)
    })
  }
})
