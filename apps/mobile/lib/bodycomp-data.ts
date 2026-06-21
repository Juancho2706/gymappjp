import { supabase } from './supabase'

/**
 * Datos + helpers de lectura de Composición Corporal (mobile, vista ALUMNO read-only).
 *
 * Lecturas DIRECTAS por PostgREST bajo la sesión del ALUMNO (RLS bcm_select: rama self-select,
 * el alumno solo ve sus propias mediciones no borradas). NADA service-role. Espejo de la vista
 * web (apps/web .../c/[coach_slug]/bodycomp + StudentBodyCompositionView + lib/bodycomp/view-helpers).
 *
 * NOTA anti-drift: los helpers de lectura del jsonb `metrics` (readBiaMetrics/readIsakMetrics/
 * deltaVsPrev/deviceLabel) son un port verbatim de apps/web/src/lib/bodycomp/view-helpers.ts —
 * no se mapea ese archivo en el tsconfig de mobile. Si cambia la forma del jsonb en web,
 * actualizar acá. NUNCA mezcla métodos (BIA vs ISAK se leen con funciones distintas).
 */

export type BodyCompMethod = 'bia' | 'isak'

export interface BodyCompositionRow {
  id: string
  method: string
  measured_at: string
  weight_kg: number | null
  height_cm: number | null
  device_brand: string | null
  device_model: string | null
  is_validated: boolean
  metrics: any
  notes: string | null
}

export interface BiaMetrics {
  skeletalMuscleMassKg?: number
  fatMassKg?: number
  bodyFatPercent?: number
  totalBodyWaterL?: number
  visceralFatLevel?: number
  basalMetabolicRateKcal?: number
  phaseAngleDeg?: number
  [key: string]: unknown
}

export interface IsakMetricsView {
  fractionation: {
    adipose: { kg: number; pct: number }
    muscle: { kg: number; pct: number }
    bone: { kg: number; pct: number }
    residual: { kg: number; pct: number }
    skin: { kg: number; pct: number }
    predictedMassKg: number
    measuredWeightKg: number
    massDifferenceKg: number
  }
  somatotype: { endomorphy: number; mesomorphy: number; ectomorphy: number }
  bodyFat: { equation: string; percent: number }
}

const SELECT_COLUMNS =
  'id, method, measured_at, weight_kg, height_cm, device_brand, device_model, is_validated, metrics, notes'

/** Mediciones (no borradas) del propio alumno para UN método, más reciente primero. */
export async function listMyMeasurements(method: BodyCompMethod): Promise<BodyCompositionRow[]> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return []
    const { data } = await supabase
      .from('body_composition_measurements')
      .select(SELECT_COLUMNS)
      .eq('client_id', uid)
      .eq('method', method)
      .is('deleted_at', null)
      .order('measured_at', { ascending: false })
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      method: r.method,
      measured_at: r.measured_at,
      weight_kg: r.weight_kg ?? null,
      height_cm: r.height_cm ?? null,
      device_brand: r.device_brand ?? null,
      device_model: r.device_model ?? null,
      is_validated: !!r.is_validated,
      metrics: r.metrics ?? null,
      notes: r.notes ?? null,
    })) as BodyCompositionRow[]
  } catch {
    return []
  }
}

// ─── Helpers de lectura del jsonb (port verbatim de view-helpers.ts) ──────────

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function massComponent(v: unknown): { kg: number; pct: number } {
  const o = (v ?? {}) as Record<string, unknown>
  return { kg: num(o.kg), pct: num(o.pct) }
}

/** Lee `metrics` de una fila ISAK. null si la forma no es la esperada. */
export function readIsakMetrics(row: BodyCompositionRow): IsakMetricsView | null {
  if (row.method !== 'isak') return null
  const m = row.metrics as Record<string, unknown> | null
  if (!m || typeof m !== 'object' || !m.fractionation) return null
  const f = m.fractionation as Record<string, unknown>
  const s = (m.somatotype ?? {}) as Record<string, unknown>
  const bf = (m.bodyFat ?? {}) as Record<string, unknown>
  return {
    fractionation: {
      adipose: massComponent(f.adipose),
      muscle: massComponent(f.muscle),
      bone: massComponent(f.bone),
      residual: massComponent(f.residual),
      skin: massComponent(f.skin),
      predictedMassKg: num(f.predictedMassKg),
      measuredWeightKg: num(f.measuredWeightKg),
      massDifferenceKg: num(f.massDifferenceKg),
    },
    somatotype: {
      endomorphy: num(s.endomorphy),
      mesomorphy: num(s.mesomorphy),
      ectomorphy: num(s.ectomorphy),
    },
    bodyFat: {
      equation: typeof bf.equation === 'string' ? bf.equation : 'durnin_womersley',
      percent: num(bf.percent),
    },
  }
}

/** Lee `metrics` de una fila BIA (superset opcional capturado del dispositivo). */
export function readBiaMetrics(row: BodyCompositionRow): BiaMetrics {
  if (row.method !== 'bia') return {}
  return (row.metrics as BiaMetrics) ?? {}
}

/** Etiqueta visible "InBody 570 · 05 jun" (dispositivo + fecha). */
export function deviceLabel(row: BodyCompositionRow): string {
  const parts: string[] = []
  if (row.device_brand) parts.push(row.device_brand)
  if (row.device_model) parts.push(row.device_model)
  const device = parts.join(' ')
  const date = new Date(row.measured_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
  return device ? `${device} · ${date}` : date
}

/**
 * Delta de un valor numérico vs la medición ANTERIOR del MISMO método. `rows` viene ordenado
 * (más reciente primero). null si no hay anterior.
 */
export function deltaVsPrev(
  rowsDescByDate: BodyCompositionRow[],
  index: number,
  pick: (row: BodyCompositionRow) => number | null
): number | null {
  const current = pick(rowsDescByDate[index])
  const prev = rowsDescByDate[index + 1] ? pick(rowsDescByDate[index + 1]) : null
  if (current == null || prev == null) return null
  return Math.round((current - prev) * 100) / 100
}

export function formatKg(v: number): string {
  return `${v.toFixed(1)} kg`
}
