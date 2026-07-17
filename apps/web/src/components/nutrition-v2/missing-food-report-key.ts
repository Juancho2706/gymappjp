/**
 * Clave de idempotencia ESTABLE para el reporte de un GTIN faltante desde el scanner PWA.
 *
 * El RPC `report_missing_food_gtin_v2` deduplica por `p_idempotency_key`. La version anterior
 * generaba la clave con `Date.now()`, asi que cada reintento (mismo alumno, mismo codigo, mismo
 * dia) producia una clave distinta y creaba un reporte duplicado — la deduplicacion nunca aplicaba.
 *
 * Esta clave es determinista por CONTENIDO: mismo alumno + mismo GTIN + mismo dia local => misma
 * clave. Asi el reintento del alumno reusa el reporte del dia en vez de duplicarlo. El GTIN se
 * normaliza a digitos (coincide con la normalizacion del lookup) para que "780..." y "7 80..."
 * caigan en la misma clave. Sin dependencias nuevas: la fecha local sale del reloj del dispositivo.
 */
export function missingFoodReportKey(input: {
  clientId: string
  gtin: string
  /** Inyectable para tests deterministas; por defecto el momento actual (fecha LOCAL). */
  now?: Date
}): string {
  const gtin = input.gtin.replace(/\D/g, '')
  const localDate = toLocalIsoDate(input.now ?? new Date())
  return `missing:${input.clientId}:${gtin}:${localDate}`
}

/** Fecha LOCAL en formato YYYY-MM-DD (no UTC): un reporte por dia calendario del alumno. */
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
