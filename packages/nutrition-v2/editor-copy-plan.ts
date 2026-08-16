/**
 * Plan de copia (T2.6 F2) — PURO, sin React.
 *
 * Complementa a `copy-presets.ts`, que resuelve QUE dias abarca un preset con nombre ("Lu a Vi",
 * "Fin de semana", "Todos"). Acá viven las dos piezas que faltaban:
 *
 *  1. **Quick-select relativo** — "proximos 1 / 2 / 4". El coach que arma el lunes casi nunca
 *     piensa "lunes, martes, miercoles"; piensa "esto va los proximos tres dias". Los presets con
 *     nombre no cubren ese recorte y hacerlo a mano son cuatro toques en un multi-select.
 *  2. **Modo de copia** (decision del dueño D2, 2026-08-12):
 *       · `replace` — lo de hoy: el destino queda IGUAL al origen (su contenido propio se pierde).
 *       · `append`  — las franjas del origen se SUMAN a lo que el destino ya tiene, sin pisar nada.
 *     Anexar dos veces puede dejar franjas repetidas. Eso NO se prohibe ni se filtra en silencio:
 *     se avisa antes, con los nombres exactos que van a quedar duplicados.
 *
 * Regla de este modulo, heredada de `copy-presets.ts`: **nada de esto ejecuta la copia**. Todo
 * devuelve una descripcion de lo que pasaria; la UI la muestra y la CTA de siempre la aplica. Por
 * eso es testeable sin montar un builder entero.
 */

import type { CopyPresetTarget } from './editor-copy-presets'

/** Modo de copia (D2). `replace` es el comportamiento historico. */
export type CopyMode = 'replace' | 'append'

/** Semana en orden de lectura del coach: Lu → Do (0 = domingo, como el resto del modulo). */
const WEEK_IN_READING_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

/** Cantidades ofrecidas por el quick-select relativo. */
export const NEXT_DAYS_QUICK_PICKS: readonly number[] = [1, 2, 4]

/**
 * Los `count` dias que siguen al de origen, en orden calendario y dando la vuelta a la semana
 * (viernes + 4 => sabado, domingo, lunes, martes).
 *
 * El dia BASE (`dayOfWeek === null`) no tiene lugar en la semana: "los proximos dos dias" no
 * significa nada respecto de el, asi que devuelve vacio y la UI esconde los chips. Inventar un
 * origen (por ejemplo el lunes) seria adivinar por el coach.
 */
export function nextDaysFrom(sourceDayOfWeek: number | null, count: number): number[] {
  if (sourceDayOfWeek == null) return []
  if (!Number.isFinite(count) || count <= 0) return []
  const start = WEEK_IN_READING_ORDER.indexOf(sourceDayOfWeek)
  if (start < 0) return []
  const total = WEEK_IN_READING_ORDER.length
  // Tope duro: la semana tiene 6 dias ademas del origen; pedir mas es pedir el origen otra vez.
  const wanted = Math.min(Math.trunc(count), total - 1)
  const days: number[] = []
  for (let step = 1; step <= wanted; step += 1) {
    days.push(WEEK_IN_READING_ORDER[(start + step) % total])
  }
  return days
}

/**
 * Quick-select relativo para el menu de la FRANJA (decision del dueño A, 2026-08-13): los chips
 * "proximos 1 / 2 / 4" MARCAN el multi-select existente, igual que los presets con nombre de
 * `targetsForCopyPreset`. A diferencia del menu del dia, la franja solo puede copiarse a dias que
 * YA existen como variante (la copia de franja no crea dias), asi que un "proximo" sin variante
 * simplemente no entra en la seleccion. La fusion por nombre del reducer queda intacta: aca no hay
 * modo ni toggle, solo seleccion.
 */
export function targetsForNextDays(
  targets: readonly CopyPresetTarget[],
  sourceDayOfWeek: number | null,
  count: number,
): string[] {
  const wanted = new Set(nextDaysFrom(sourceDayOfWeek, count))
  if (wanted.size === 0) return []
  return targets.filter((target) => target.dayOfWeek != null && wanted.has(target.dayOfWeek)).map((t) => t.key)
}

/** Un destino tal como lo ve el builder: el dia y las franjas que YA tiene. */
export interface CopyDestination {
  dayOfWeek: number
  /** Nombres de las franjas propias del destino. Vacio = el dia todavia no existe como propio. */
  slotNames: readonly string[]
  /** El dia ya es una variante propia del plan (aunque no tenga franjas). */
  occupied: boolean
}

/** Que le pasa a UN destino con el modo elegido. */
export interface CopyPlanEntry {
  dayOfWeek: number
  /** El dia ya existia como propio. */
  occupied: boolean
  /** Franjas que suma la copia. En `replace` es el total del origen (el destino queda igual). */
  slotsAdded: number
  /** Solo `replace`: el contenido propio de este dia se pierde. */
  replaced: boolean
  /** Solo `append`: nombres que van a quedar DUPLICADOS en este dia. */
  duplicatedNames: string[]
  /** El dia no entra porque el plan ya llego al tope de dias propios. */
  skippedNoRoom: boolean
}

export interface CopyPlan {
  mode: CopyMode
  entries: CopyPlanEntry[]
  /** Destinos que se van a crear (dias libres). */
  createdDays: number[]
  /** Destinos ocupados que pierden su contenido (solo `replace`). */
  replacedDays: number[]
  /** Destinos ocupados que reciben franjas encima (solo `append`). */
  appendedDays: number[]
  /** Destinos que quedaron afuera por el tope de dias propios. */
  skippedDays: number[]
  /** Nombres que van a quedar repetidos en algun destino (solo `append`), sin duplicados. */
  duplicatedNames: string[]
}

/** Normaliza para comparar nombres de franja: el coach escribe "Almuerzo " y " almuerzo". */
function slotNameKey(name: string): string {
  return name.trim().toLocaleLowerCase('es')
}

/**
 * Describe la copia completa ANTES de ejecutarla.
 *
 * `room` es cuantos dias propios NUEVOS entran todavia (tope del plan). Los destinos ocupados no
 * consumen cupo —reemplazar o anexar deja el conteo igual—, asi que solo se cuenta contra los
 * libres, y los que no entran salen marcados en vez de desaparecer sin explicacion.
 */
export function planCopy(params: {
  mode: CopyMode
  /** Franjas del dia de origen, en su orden. */
  sourceSlotNames: readonly string[]
  destinations: readonly CopyDestination[]
  /** Dias propios nuevos que todavia entran en el plan. */
  room: number
}): CopyPlan {
  const { mode, sourceSlotNames, destinations } = params
  let room = Number.isFinite(params.room) ? Math.max(0, Math.trunc(params.room)) : 0

  const entries: CopyPlanEntry[] = []
  const seen = new Set<number>()

  for (const destination of destinations) {
    // Un dia repetido en la seleccion se copia una vez: la segunda no significa nada distinto.
    if (seen.has(destination.dayOfWeek)) continue
    seen.add(destination.dayOfWeek)

    if (!destination.occupied && room <= 0) {
      entries.push({
        dayOfWeek: destination.dayOfWeek,
        occupied: false,
        slotsAdded: 0,
        replaced: false,
        duplicatedNames: [],
        skippedNoRoom: true,
      })
      continue
    }
    if (!destination.occupied) room -= 1

    // `append` sobre un dia ocupado es lo unico que puede duplicar nombres; sobre un dia que se
    // crea no hay con que chocar, y `replace` deja el destino igual al origen por definicion.
    const duplicatedNames =
      mode === 'append' && destination.occupied
        ? dedupeNames(
            sourceSlotNames.filter((name) =>
              destination.slotNames.some((existing) => slotNameKey(existing) === slotNameKey(name)),
            ),
          )
        : []

    entries.push({
      dayOfWeek: destination.dayOfWeek,
      occupied: destination.occupied,
      slotsAdded: sourceSlotNames.length,
      replaced: mode === 'replace' && destination.occupied,
      duplicatedNames,
      skippedNoRoom: false,
    })
  }

  return {
    mode,
    entries,
    createdDays: entries.filter((e) => !e.occupied && !e.skippedNoRoom).map((e) => e.dayOfWeek),
    replacedDays: entries.filter((e) => e.replaced).map((e) => e.dayOfWeek),
    appendedDays: entries.filter((e) => mode === 'append' && e.occupied && !e.skippedNoRoom).map((e) => e.dayOfWeek),
    skippedDays: entries.filter((e) => e.skippedNoRoom).map((e) => e.dayOfWeek),
    duplicatedNames: dedupeNames(entries.flatMap((e) => e.duplicatedNames)),
  }
}

/** Nombres unicos conservando el primero escrito (se compara normalizado, se muestra el original). */
function dedupeNames(names: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const key = slotNameKey(name)
    if (key.length === 0 || seen.has(key)) continue
    seen.add(key)
    out.push(name.trim())
  }
  return out
}

/**
 * El aviso que se lee ANTES de confirmar. Dice exactamente lo que va a pasar, sin eufemismos:
 * pisar el trabajo de un dia y sumarle franjas son cosas distintas y se nombran distinto.
 *
 * Devuelve `null` cuando no hay nada que advertir (todos los destinos son dias libres).
 */
export function copyPlanWarning(plan: CopyPlan): string | null {
  const parts: string[] = []

  if (plan.replacedDays.length > 0) {
    parts.push(
      plan.replacedDays.length === 1
        ? 'Se reemplaza 1 día que ya tenía contenido propio'
        : `Se reemplazan ${plan.replacedDays.length} días que ya tenían contenido propio`,
    )
  }
  if (plan.appendedDays.length > 0) {
    parts.push(
      plan.appendedDays.length === 1
        ? 'Se suman franjas a 1 día que ya tenía contenido'
        : `Se suman franjas a ${plan.appendedDays.length} días que ya tenían contenido`,
    )
  }
  if (plan.duplicatedNames.length > 0) {
    const names = plan.duplicatedNames.slice(0, 3).join(', ')
    const rest = plan.duplicatedNames.length - 3
    parts.push(`Quedan franjas repetidas: ${names}${rest > 0 ? ` y ${rest} más` : ''}`)
  }
  if (plan.skippedDays.length > 0) {
    parts.push(
      plan.skippedDays.length === 1
        ? 'Queda 1 día afuera: el plan llegó al tope de días propios'
        : `Quedan ${plan.skippedDays.length} días afuera: el plan llegó al tope de días propios`,
    )
  }

  return parts.length === 0 ? null : parts.join('. ') + '.'
}
