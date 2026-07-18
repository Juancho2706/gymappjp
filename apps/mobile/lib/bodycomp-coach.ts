/**
 * bodycomp-coach — datos del modulo Composicion corporal del lado COACH (E6-05).
 *
 * Dos responsabilidades money-safe (identico patron a cardio-coach.ts / movement-coach.ts):
 *  - LECTURA (tendencias + portada + historial): las mediciones del alumno se leen por
 *    PostgREST directo. NO es mutacion → la RLS `bcm_select` (client_id del coach, verificada en
 *    E0-B1) alcanza. Con `hasModule('body_composition')` en OFF la pantalla NO llama a estas
 *    funciones (cero fetch). Se excluyen las soft-deleted (`deleted_at IS NULL`) — la exclusion
 *    de negocio es de esta capa (la RLS deja la fila visible para restore/auditoria).
 *  - MUTACION (guardar BIA/ISAK, eliminar): SIEMPRE via los endpoints `/api/mobile/bodycomp/*`,
 *    que aplican `assertModule('body_composition')` server-side (la RLS de la tabla NO chequea
 *    enabled_modules → escribir por PostgREST evadiria el cobro). En ISAK el server RECALCULA los
 *    `metrics` derivados (Kerr 5C + Heath-Carter + %grasa) con `computeIsak` (@eva/bodycomp); jamas
 *    se confia en el calculo del cliente. NUNCA INSERT/UPDATE directo.
 *
 * Los metodos NUNCA se mezclan: cada metodo tiene su serie filtrada por `method` (los % grasa de
 * BIA e ISAK no son comparables — espejo de la regla web).
 */
import type {
  BiaCreateInput,
  BiaMetrics,
  IsakCreateInput,
  IsakResult,
} from '@eva/bodycomp'
import { supabase } from './supabase'
import { apiFetch } from './api'
import type { ClientActionWorkspace } from './client-actions'
import { getSantiagoIsoYmdForUtcInstant } from './date-utils'

export type BodyCompMethod = 'bia' | 'isak'

/** Fila minima de una medicion para las tendencias / portada / historial (sin `raw_input`). */
export interface BodyCompRow {
  id: string
  method: BodyCompMethod
  measured_at: string
  weight_kg: number | null
  height_cm: number | null
  device_brand: string | null
  device_model: string | null
  equation_used: string | null
  is_validated: boolean
  metrics: Record<string, unknown> | null
}

const LIST_COLUMNS =
  'id, method, measured_at, weight_kg, height_cm, device_brand, device_model, equation_used, is_validated, metrics'

function normalizeRow(r: any): BodyCompRow {
  return {
    id: r.id,
    method: r.method,
    measured_at: r.measured_at,
    weight_kg: r.weight_kg ?? null,
    height_cm: r.height_cm ?? null,
    device_brand: r.device_brand ?? null,
    device_model: r.device_model ?? null,
    equation_used: r.equation_used ?? null,
    is_validated: r.is_validated === true,
    metrics: (r.metrics as Record<string, unknown> | null) ?? null,
  }
}

/** Nombre del alumno (encabezado). RLS del coach alcanza; null si no existe. */
export async function getBodycompClientName(clientId: string): Promise<string | null> {
  const { data } = await supabase.from('clients').select('full_name').eq('id', clientId).maybeSingle()
  return (data?.full_name as string | undefined) ?? null
}

/**
 * Mediciones (no borradas) de UN metodo, mas reciente primero. Espejo de
 * `listByClientAndMethod` (repository web). [] ante error/permiso (nunca crash).
 */
export async function listMeasurements(clientId: string, method: BodyCompMethod): Promise<BodyCompRow[]> {
  const { data, error } = await supabase
    .from('body_composition_measurements')
    .select(LIST_COLUMNS)
    .eq('client_id', clientId)
    .eq('method', method)
    .is('deleted_at', null)
    .order('measured_at', { ascending: false })
  if (error || !Array.isArray(data)) return []
  return data.map(normalizeRow)
}

export type ScopedBodyCompMeasurements = {
  bia: BodyCompRow[]
  isak: BodyCompRow[]
}

/** Lectura inline de ficha con scope explicito del recurso; no depende del workspace preferido web. */
export async function listScopedMeasurements(
  clientId: string,
  workspace: ClientActionWorkspace,
): Promise<ScopedBodyCompMeasurements> {
  const params = [
    `workspaceKind=${encodeURIComponent(workspace.kind)}`,
    ...(workspace.teamId ? [`teamId=${encodeURIComponent(workspace.teamId)}`] : []),
    ...(workspace.orgId ? [`orgId=${encodeURIComponent(workspace.orgId)}`] : []),
  ].join('&')
  const response = await apiFetch<{ ok: true; bia: any[]; isak: any[] }>(
    `/api/mobile/coach/clients/${clientId}/bodycomp?${params}`,
    { authenticated: true },
  )
  return {
    bia: Array.isArray(response.bia) ? response.bia.map(normalizeRow) : [],
    isak: Array.isArray(response.isak) ? response.isak.map(normalizeRow) : [],
  }
}

/**
 * Fecha (ISO) de la medicion mas reciente del alumno, cualquiera sea el metodo — para el
 * estado "ultima medicion hace X" en la ficha. Read-only PostgREST (misma RLS `bcm_select` que
 * `listMeasurements`); el llamador ya gatea con `hasModule('body_composition')`. null si no hay.
 */
export async function getLastBodycompMeasuredAt(clientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('body_composition_measurements')
    .select('measured_at')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return (data.measured_at as string | null) ?? null
}

/**
 * Guarda una medicion BIA via el endpoint mobile (gate de dinero server-side:
 * assertModule → 403 MODULE_OFF sin el modulo). El server persiste `metrics` tal cual (no calcula).
 */
export async function saveBiaMeasurement(
  input: Omit<BiaCreateInput, 'method'>,
  workspace: ClientActionWorkspace,
): Promise<string> {
  const res = await apiFetch<{ ok: true; measurementId: string }>('/api/mobile/bodycomp/bia', {
    method: 'POST',
    authenticated: true,
    body: { ...input, method: 'bia', workspace },
  })
  return res.measurementId
}

/**
 * Guarda una medicion ISAK via el endpoint mobile. El cliente envia SOLO los crudos + la ecuacion;
 * el server calcula los `metrics` derivados (computeIsak). Gate assertModule server-side.
 */
export async function saveIsakMeasurement(
  input: Omit<IsakCreateInput, 'method'>,
  workspace: ClientActionWorkspace,
): Promise<string> {
  const res = await apiFetch<{ ok: true; measurementId: string }>('/api/mobile/bodycomp/isak', {
    method: 'POST',
    authenticated: true,
    body: { ...input, method: 'isak', workspace },
  })
  return res.measurementId
}

/** Soft-delete de una medicion (gate assertModule server-side). NUNCA DELETE directo. */
export async function deleteMeasurement(id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/mobile/bodycomp/${id}`, {
    method: 'DELETE',
    authenticated: true,
  })
}

/** Soft-delete inline de ficha con clientId + workspace explicitamente autorizados server-side. */
export async function deleteScopedMeasurement(
  clientId: string,
  id: string,
  workspace: ClientActionWorkspace,
): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/mobile/coach/clients/${clientId}/bodycomp/${id}`, {
    method: 'DELETE',
    authenticated: true,
    body: { workspace },
  })
}

/* ── Helpers PUROS de lectura/formato del jsonb `metrics` (espejo de lib/bodycomp/view-helpers) ── */

/** Vista normalizada de una medicion ISAK (5C Kerr + somatotipo + %grasa) para la UI. */
export type IsakView = {
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

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function massComponent(v: unknown): { kg: number; pct: number } {
  const o = (v ?? {}) as Record<string, unknown>
  return { kg: num(o.kg), pct: num(o.pct) }
}

/** Resultado ISAK derivado (computeIsak) -> vista de UI (preview en vivo, misma forma que la fila). */
export function isakResultToView(result: IsakResult): IsakView {
  const f = result.fractionation
  return {
    fractionation: {
      adipose: { kg: f.adipose.kg, pct: f.adipose.pct },
      muscle: { kg: f.muscle.kg, pct: f.muscle.pct },
      bone: { kg: f.bone.kg, pct: f.bone.pct },
      residual: { kg: f.residual.kg, pct: f.residual.pct },
      skin: { kg: f.skin.kg, pct: f.skin.pct },
      predictedMassKg: f.predictedMassKg,
      measuredWeightKg: f.measuredWeightKg,
      massDifferenceKg: f.massDifferenceKg,
    },
    somatotype: {
      endomorphy: result.somatotype.endomorphy,
      mesomorphy: result.somatotype.mesomorphy,
      ectomorphy: result.somatotype.ectomorphy,
    },
    bodyFat: { equation: result.bodyFat.equation, percent: result.bodyFat.percent },
  }
}

/** Lee `metrics` de una fila ISAK. Devuelve null si la forma no es la esperada. */
export function readIsakView(row: BodyCompRow): IsakView | null {
  if (row.method !== 'isak') return null
  const m = row.metrics
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
export function readBiaMetrics(row: BodyCompRow): BiaMetrics {
  if (row.method !== 'bia') return {}
  return (row.metrics as BiaMetrics) ?? {}
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** dd <mes> (Intl es-CL no es fiable en Hermes → formateo manual). */
export function fmtShort(iso: string): string {
  const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? iso
    : getSantiagoIsoYmdForUtcInstant(iso)
  const [, month, day] = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? []
  const monthIndex = Number(month) - 1
  if (!day || monthIndex < 0 || monthIndex >= MONTHS_SHORT.length) return '—'
  return `${day} ${MONTHS_SHORT[monthIndex]}`
}

/** Etiqueta "InBody 570 · 05 jun" (dispositivo + fecha). */
export function deviceLabel(row: BodyCompRow): string {
  const parts: string[] = []
  if (row.device_brand) parts.push(row.device_brand)
  if (row.device_model) parts.push(row.device_model)
  const device = parts.join(' ')
  const date = fmtShort(row.measured_at)
  return device ? `${device} · ${date}` : date
}

/**
 * Delta de un valor vs la medicion ANTERIOR del MISMO metodo. `rows` viene ordenado desc (mas
 * reciente primero). null si no hay anterior.
 */
export function deltaVsPrev(
  rowsDescByDate: BodyCompRow[],
  index: number,
  pick: (row: BodyCompRow) => number | null,
): number | null {
  const current = pick(rowsDescByDate[index])
  const prev = rowsDescByDate[index + 1] ? pick(rowsDescByDate[index + 1]) : null
  if (current == null || prev == null) return null
  return Math.round((current - prev) * 100) / 100
}

export function formatKg(v: number): string {
  return `${v.toFixed(1)} kg`
}
export function formatPct(v: number): string {
  return `${v.toFixed(1)}%`
}
