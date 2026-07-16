/**
 * Builder V2 - logica PURA del conflicto de "fecha de vigencia" al publicar.
 *
 * El plan vigente de un alumno solo puede ser reemplazado por una version cuya fecha de
 * vigencia sea POSTERIOR a la de la version actual (la barrera real vive en el RPC
 * publish_nutrition_plan_v2, que compara `p_effective_from <= v_current_from`). Este modulo
 * espeja esa regla del lado del cliente para poder abrir el modal de decision SIN gastar una
 * ida y vuelta fallida al servidor. El RPC sigue siendo la red de seguridad (fail-closed).
 *
 * Sin React / Next / Supabase: solo comparacion de fechas ISO (YYYY-MM-DD). Testeable.
 */

/**
 * True cuando la fecha elegida choca con la de la version vigente: es igual o anterior, y por
 * tanto el RPC la rechazaria. Fechas ISO YYYY-MM-DD comparan lexicograficamente = por dia.
 * Si falta cualquiera de las dos, no bloquea (deja que el servidor decida).
 */
export function effectiveDateConflicts(
  chosen: string | null | undefined,
  current: string | null | undefined,
): boolean {
  if (!chosen || !current) return false
  return chosen <= current
}

/**
 * Devuelve el dia calendario siguiente a una fecha ISO (YYYY-MM-DD). Usa aritmetica en UTC
 * para no depender de la zona horaria del navegador (evita corrimientos de un dia). Si la
 * entrada no es una fecha ISO valida, la devuelve sin cambios (el servidor validara).
 */
export function nextDayIso(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts.map((p) => Number(p))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
