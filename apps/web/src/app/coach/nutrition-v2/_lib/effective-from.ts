/**
 * Vigencia (`effective_from`) de una republicación del quick-edit — capa PURA compartida por los
 * DOS caminos de escritura del coach: la server action web (`_actions/quick-edit.actions.ts`) y la
 * op `quickEditPublish` de la API móvil (`api/mobile/nutrition-v2/coach/mutate/route.ts`).
 *
 * Vive acá y no dentro de la action porque un archivo `'use server'` solo puede exportar funciones
 * async (nada de helpers puros), y la alternativa era una TERCERA copia de la misma aritmética de
 * fechas. Una sola verdad: el día del alumno se calcula en SU zona horaria, nunca con el reloj del
 * navegador del coach.
 *
 * W3.2 «Cantidades honestas» (SPEC §6.2): con «Aplicar desde mañana» la versión nueva entra el día
 * siguiente y la vigente queda intacta hoy — el snapshot del día no se rearma, los ids de los ítems
 * no cambian y los registros del alumno no pueden quedar huérfanos (cero fantasmas por
 * construcción, sin depender del linaje de W3.1).
 */

/** Qué hacer con el DÍA del alumno al republicar. `'today'` = lo de siempre (decisión D5 a). */
export type QuickEditEffectiveFromChoice = 'today' | 'tomorrow'

/**
 * `today` (YYYY-MM-DD) en la zona horaria del alumno. `en-CA` produce el formato ISO. Una tz
 * inválida (dato viejo, typo) cae a `America/Santiago` en vez de romper la publicación.
 */
export function todayInTimezone(timezone: string): string {
  const format = (tz: string): string =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  try {
    return format(timezone)
  } catch {
    return format('America/Santiago')
  }
}

/**
 * Día siguiente de una fecha ISO, en aritmética de CALENDARIO (UTC puro sobre y-m-d): la entrada ya
 * es «hoy en la tz del alumno», así que sumar un día acá no puede correrse ni por DST ni por la
 * zona del servidor. Entrada no-ISO ⇒ se devuelve tal cual (el RPC la valida igual).
 */
export function nextDayIso(iso: string): string {
  const parts = iso.split('-').map((part) => Number(part))
  const [y, m, d] = parts
  if (parts.length !== 3 || !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

/**
 * Vigencia final de la republicación.
 *
 * - `'tomorrow'` ⇒ hoy + 1 día en la tz del alumno (W3.2).
 * - `'today'` (default) ⇒ `max(hoy, vigencia de la versión base)`: la edición NUNCA puede
 *   «adelantar» un plan con vigencia futura. Con la migración same-day el MISMO día se permite
 *   (supersede intra-día); solo una fecha < vigente la rechaza el RPC.
 */
export function resolveQuickEditEffectiveFrom(input: {
  choice: QuickEditEffectiveFromChoice
  timezone: string
  baseEffectiveFrom: string | null
}): string {
  const today = todayInTimezone(input.timezone)
  if (input.choice === 'tomorrow') return nextDayIso(today)
  return input.baseEffectiveFrom && input.baseEffectiveFrom > today ? input.baseEffectiveFrom : today
}
