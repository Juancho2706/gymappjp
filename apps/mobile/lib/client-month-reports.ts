import { supabase } from './supabase'
import { toMonthKey, type MonthReportJson, type MonthReportsJson } from '@eva/client-dossier'

/**
 * Capa de datos del «Dossier por meses» en RN (R22).
 *
 * Dos lecturas contra los RPC de `supabase/migrations/20260915230000_client_month_reports.sql`,
 * con el JWT del coach (mismo camino que el resto de `coach-client-detail.ts`: RLS + guard de 3
 * vías dentro de la función). Vive aparte para no engordar `coach-client-detail.ts` (1.6k líneas)
 * y porque la exportación mensual es un flujo propio: la ficha carga sin tocar esto.
 *
 * El corte de mes lo resuelve el RPC en America/Santiago (R1): acá NO se calculan períodos ni se
 * mira el reloj del teléfono.
 */

/** Tope de la función SQL (R2): más de 24 meses ⇒ `raise exception` 22023. */
export const MAX_EXPORT_MONTHS = 24

/** Postgres devuelve el 42501 del guard en `error.code` (R3). */
const DENIED_CODE = '42501'
const DENIED_MESSAGE = 'No tenés acceso a este alumno'

type SupabaseErrorish = { code?: string | null; message?: string | null } | null

/** 22023 = array de meses inválido o > 24 (R2). */
const INVALID_CODE = '22023'
const INVALID_MESSAGE = 'Selección de meses inválida'

// Misma allowlist que el service web (DM-42b.1): solo 42501 y 22023 llegan con texto propio;
// cualquier otro error de Postgres se loguea acá y sube como mensaje genérico. El mensaje crudo
// nunca se pinta en el sheet.
function throwRpcError(error: SupabaseErrorish, fallback: string): never {
  const raw = String(error?.message ?? '')
  if (error?.code === DENIED_CODE || raw.includes('_denied')) {
    throw new Error(DENIED_MESSAGE)
  }
  if (error?.code === INVALID_CODE || raw.includes('_invalid_months')) {
    throw new Error(INVALID_MESSAGE)
  }
  console.warn('[client-month-reports] RPC error', { code: error?.code ?? null, message: raw })
  throw new Error(fallback)
}

export interface ClientReportBounds {
  /** `YYYY-MM` del primer mes con señal del alumno. */
  firstMonthKey: string
  /** `YYYY-MM` del mes en curso (Santiago, lo resuelve el RPC). */
  currentMonthKey: string
}

/**
 * Rango de meses exportables (R11). El sheet pinta los chips con
 * `monthRangeFrom(firstMonthKey, currentMonthKey)`.
 */
export async function fetchClientReportBounds(clientId: string): Promise<ClientReportBounds> {
  const { data, error } = await supabase.rpc('get_client_report_bounds', { p_client_id: clientId })
  if (error) throwRpcError(error as SupabaseErrorish, 'No se pudieron cargar los meses disponibles.')
  const row = (data ?? {}) as { first_month?: string | null; current_month?: string | null }
  const currentMonthKey = toMonthKey(row.current_month)
  const firstMonthKey = toMonthKey(row.first_month) || currentMonthKey
  if (!currentMonthKey) throw new Error('No se pudieron cargar los meses disponibles.')
  return { firstMonthKey, currentMonthKey }
}

/**
 * Informes de los meses pedidos, EN EL ORDEN pedido (el RPC preserva el orden del array).
 * `monthKeys` entra como `YYYY-MM`; el RPC espera el primer día de cada mes (`date[]`).
 */
export async function fetchClientMonthReports(
  clientId: string,
  monthKeys: string[]
): Promise<MonthReportJson[]> {
  const keys = monthKeys.map((k) => toMonthKey(k)).filter((k) => !!k)
  if (keys.length === 0) return []
  // Red de seguridad: el sheet ya no deja pasar de 24, pero una llamada con más reventaría en el
  // servidor con un 22023 ilegible para el coach.
  if (keys.length > MAX_EXPORT_MONTHS) {
    throw new Error(`Podés exportar hasta ${MAX_EXPORT_MONTHS} meses por vez.`)
  }
  const { data, error } = await supabase.rpc('get_client_month_reports', {
    p_client_id: clientId,
    p_months: keys.map((k) => `${k}-01`),
  })
  if (error) throwRpcError(error as SupabaseErrorish, 'No se pudo generar el informe mensual.')
  const payload = (data ?? {}) as MonthReportsJson
  return Array.isArray(payload.months) ? payload.months.filter((m): m is MonthReportJson => !!m) : []
}

/**
 * `{ id del check-in → ref SIN firmar de la foto frontal }` de un mes, para pasárselo a
 * `buildClientMonthDossier` como `photoUrls`.
 *
 * En web ese campo lleva la URL ya firmada server-side; en RN la firma ocurre DESPUÉS (en el
 * generador, por lote de mes y con presupuesto global), así que el modelo viaja con el ref y el
 * generador lo resuelve contra su mapa de fotos bajadas. Convención documentada en
 * `client-dossier-pdf.ts`.
 */
export function photoRefsByCheckInId(report: MonthReportJson): Record<string, string> {
  const out: Record<string, string> = {}
  for (const checkIn of report.check_ins ?? []) {
    const id = String(checkIn?.id ?? '').trim()
    const ref = String(checkIn?.front_photo_url ?? '').trim()
    if (id && ref) out[id] = ref
  }
  return out
}
