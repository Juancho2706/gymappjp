import { supabase } from './supabase'

/**
 * Resumen del mes calendario (zona Santiago) para la share-card mensual del alumno.
 * Espejo RN de la query web `getMonthlyRecap`
 * (apps/web/src/app/c/[coach_slug]/perfil/_data/monthly-recap.queries.ts):
 * reusa los MISMOS RPC alumno-scoped (GRANT a `authenticated` + guard IDOR 3-vías),
 * `get_client_workout_day_counts` (sesiones) y `get_client_daily_tonnage` (volumen),
 * ambos ya agregados en Santiago. Se piden 31 días y se filtra al mes calendario.
 * Zero-server, sin lógica de negocio nueva: solo agrega y formatea.
 */

const SANTIAGO_TZ = 'America/Santiago'

export interface MonthlyRecap {
  /** Sesiones (días entrenados) del mes calendario Santiago. */
  sessions: number
  /** Volumen total del mes en kg. */
  volumeKg: number
  /** Etiqueta legible del mes ("Julio 2026"). */
  monthLabel: string
}

export interface MonthlyRecapTotals {
  sessions: number
  volumeKg: number
}

interface DayCountRow {
  day: string | null
  sets: number | null
}
interface TonnageRow {
  day: string | null
  tonnage: number | null
}

/** "YYYY-MM" del mes actual en zona Santiago (borde de mes correcto sin importar TZ del host). */
export function getSantiagoMonthPrefix(now = new Date()): string {
  // en-CA → "YYYY-MM-DD"; recortamos a "YYYY-MM".
  const ymd = now.toLocaleDateString('en-CA', {
    timeZone: SANTIAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return ymd.slice(0, 7)
}

/** "Julio 2026" (capitalizado) del mes actual en Santiago. */
export function formatSantiagoMonthLabel(now = new Date()): string {
  const raw = now.toLocaleDateString('es-CL', {
    timeZone: SANTIAGO_TZ,
    month: 'long',
    year: 'numeric',
  })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * Reducción PURA (mirror de `reduceMonthlyRecap` web). Los RPC devuelven `day` como
 * `YYYY-MM-DD` ya en Santiago → filtro al mes = `startsWith(monthPrefix)`.
 * - Sesiones: días del mes con `sets > 0`.
 * - Volumen: suma de `tonnage` de los días del mes (redondeado).
 */
export function reduceMonthlyRecap(
  dayCounts: ReadonlyArray<DayCountRow>,
  tonnage: ReadonlyArray<TonnageRow>,
  monthPrefix: string
): MonthlyRecapTotals {
  const inMonth = (d: string | null | undefined): boolean =>
    typeof d === 'string' && d.startsWith(monthPrefix)

  const sessions = dayCounts.filter((r) => inMonth(r.day) && Number(r.sets ?? 0) > 0).length
  const volumeKg = Math.round(
    tonnage.filter((r) => inMonth(r.day)).reduce((sum, r) => sum + (Number(r.tonnage ?? 0) || 0), 0)
  )
  return { sessions, volumeKg }
}

/**
 * Volumen legible: ≥1000 kg → toneladas con 1 decimal ("45,2 t"); si no, "N kg".
 * Mirror de `fmtVolume` del canvas web (coma decimal es-CL).
 */
export function fmtVolume(kg: number): string {
  const n = Math.max(0, Math.round(kg))
  if (n >= 1000) {
    const t = (n / 1000).toFixed(1).replace('.', ',')
    return `${t} t`
  }
  return `${n} kg`
}

/**
 * Trae el resumen del mes calendario (Santiago). Fail-open: ante error de red/RPC
 * devuelve ceros con la etiqueta del mes (nunca lanza) — la share-card degrada
 * elegante, sin bloquear al alumno (mismo espíritu que los otros loaders del perfil).
 */
export async function getMonthlyRecap(clientId: string): Promise<MonthlyRecap> {
  const monthPrefix = getSantiagoMonthPrefix()
  const monthLabel = formatSantiagoMonthLabel()
  try {
    const [dayCountsRes, tonnageRes] = await Promise.all([
      supabase.rpc('get_client_workout_day_counts', { p_client_id: clientId, p_days_back: 31 }),
      supabase.rpc('get_client_daily_tonnage', { p_client_id: clientId, p_max_days: 31 }),
    ])
    const dayCounts = (dayCountsRes.data ?? []) as DayCountRow[]
    const tonnage = (tonnageRes.data ?? []) as TonnageRow[]
    const { sessions, volumeKg } = reduceMonthlyRecap(dayCounts, tonnage, monthPrefix)
    return { sessions, volumeKg, monthLabel }
  } catch {
    return { sessions: 0, volumeKg: 0, monthLabel }
  }
}
