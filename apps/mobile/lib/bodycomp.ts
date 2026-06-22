import { supabase } from './supabase'
import { apiFetch } from './api'
import {
  BodyCompositionCreateSchema,
  type BodyFatEquationDto,
  type IsakRawInputDto,
} from '@eva/schemas'

/**
 * Datos + cálculo del módulo body_composition (mobile). Lecturas/escrituras DIRECTAS por
 * PostgREST bajo la sesión del coach (RLS bcm_*: el coach solo ve/escribe mediciones de sus
 * alumnos). El write usa las MISMAS columnas que el server action web (que corre bajo la sesión
 * del coach, no service-role) → los GRANT de columna para `authenticated` ya existen, sin migración.
 *
 * El cálculo ISAK (Kerr 5C + Heath-Carter + %grasa) se PORTA INLINE acá VERBATIM de
 * apps/web/src/domain/bodycomp/* (phantom.ts, anthropometry.ts, somatotype.ts, bodyfat.ts,
 * index.ts) porque domain/* no resuelve desde el bundle mobile. Es el MISMO código puro: lo que
 * se ve en la vista previa del wizard es exactamente lo que se persiste en `metrics` (paridad).
 *
 * Las dos series (BIA vs ISAK) NUNCA se mezclan: cada panel filtra `method` por separado.
 */

// ────────────────────────────────────────────────────────────────────────────
// Tipos puros (espejo de domain/bodycomp/types.ts)
// ────────────────────────────────────────────────────────────────────────────

export type Sex = 'male' | 'female'
export type BodyFatEquation = 'durnin_womersley' | 'yuhasz' | 'faulkner'

export interface Skinfolds {
  tricepsMm: number
  subscapularMm: number
  supraspinaleMm: number
  abdominalMm: number
  frontThighMm: number
  medialCalfMm: number
  bicepsMm: number
  iliacCrestMm: number
}

export interface Girths {
  headCm: number
  armRelaxedCm: number
  armFlexedCm: number
  forearmCm: number
  chestMesosternaleCm: number
  waistCm: number
  thighCm: number
  calfCm: number
}

export interface Breadths {
  biacromialCm: number
  biiliocristalCm: number
  humerusCm: number
  femurCm: number
  transverseChestCm: number
  apChestDepthCm: number
}

export interface IsakRawInput {
  sex: Sex
  ageYears?: number
  heightCm: number
  weightKg: number
  sittingHeightCm: number
  skinfolds: Skinfolds
  girths: Girths
  breadths: Breadths
}

export interface BodyFatInput {
  sex: Sex
  ageYears?: number
  skinfolds: Skinfolds
}

export interface MassComponent {
  kg: number
  pct: number
}

export interface Fractionation5C {
  adipose: MassComponent
  muscle: MassComponent
  bone: MassComponent
  residual: MassComponent
  skin: MassComponent
  predictedMassKg: number
  measuredWeightKg: number
  massDifferenceKg: number
}

export interface Somatotype {
  endomorphy: number
  mesomorphy: number
  ectomorphy: number
}

export interface BodyFatResult {
  equation: BodyFatEquation
  percent: number
  bodyDensity?: number
}

export interface IsakResult {
  fractionation: Fractionation5C
  somatotype: Somatotype
  bodyFat: BodyFatResult
  equationUsed: string
}

export interface BiaMetrics {
  skeletalMuscleMassKg?: number
  fatMassKg?: number
  bodyFatPercent?: number
  totalBodyWaterL?: number
  intracellularWaterL?: number
  extracellularWaterL?: number
  ecwTbwRatio?: number
  visceralFatAreaCm2?: number
  visceralFatLevel?: number
  basalMetabolicRateKcal?: number
  phaseAngleDeg?: number
}

// ────────────────────────────────────────────────────────────────────────────
// Phantom + Kerr (espejo VERBATIM de domain/bodycomp/phantom.ts)
// ────────────────────────────────────────────────────────────────────────────

const PHANTOM_STATURE_CM = 170.18

const KERR = {
  adipose: { skinfoldSumP: 116.41, skinfoldSumS: 34.79, massP: 25.6, massS: 5.85 },
  bone: {
    breadthSumP: 98.88,
    breadthSumS: 5.33,
    bodyMassP: 6.7,
    bodyMassS: 1.34,
    headGirthP: 56.0,
    headGirthS: 1.44,
    headMassP: 1.2,
    headMassS: 0.18,
  },
  muscle: { correctedGirthSumP: 207.21, correctedGirthSumS: 13.74, massP: 24.5, massS: 5.4 },
  residual: { sumP: 109.35, sumS: 7.08, sittingHeightP: 89.92, massP: 6.1, massS: 1.24 },
  skin: {
    densityGCm3: 1.05,
    thicknessMaleMm: 2.07,
    thicknessFemaleMm: 1.96,
    csaMaleOver12: 68.305,
    csaFemaleOver12: 73.074,
    csaUnder12: 70.691,
    weightExp: 0.425,
    heightExp: 0.725,
  },
} as const

function phantomZ(
  value: number,
  p: number,
  s: number,
  d: number,
  subjectScalingCm: number,
  phantomScalingCm: number = PHANTOM_STATURE_CM
): number {
  return (value * (phantomScalingCm / subjectScalingCm) ** d - p) / s
}

function correctedGirth(girthCm: number, skinfoldMm: number): number {
  return girthCm - Math.PI * (skinfoldMm / 10)
}

// ────────────────────────────────────────────────────────────────────────────
// Fraccionamiento 5C (espejo VERBATIM de domain/bodycomp/anthropometry.ts)
// ────────────────────────────────────────────────────────────────────────────

const SCALE_EXP = 3

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function bodySurfaceAreaM2(weightKg: number, heightCm: number, sex: Sex, ageYears?: number): number {
  const { csaMaleOver12, csaFemaleOver12, csaUnder12, weightExp, heightExp } = KERR.skin
  let csa: number
  if (ageYears !== undefined && ageYears < 12) {
    csa = csaUnder12
  } else {
    csa = sex === 'male' ? csaMaleOver12 : csaFemaleOver12
  }
  const saCm2 = csa * weightKg ** weightExp * heightCm ** heightExp
  return saCm2 / 10000
}

function skinMassKg(weightKg: number, heightCm: number, sex: Sex, ageYears?: number): number {
  const sa = bodySurfaceAreaM2(weightKg, heightCm, sex, ageYears)
  const thickness = sex === 'male' ? KERR.skin.thicknessMaleMm : KERR.skin.thicknessFemaleMm
  return sa * thickness * KERR.skin.densityGCm3
}

function adiposeMassKg(input: IsakRawInput): number {
  const { skinfolds: sf, heightCm } = input
  const sumSf =
    sf.tricepsMm + sf.subscapularMm + sf.supraspinaleMm + sf.abdominalMm + sf.frontThighMm + sf.medialCalfMm
  const z = phantomZ(sumSf, KERR.adipose.skinfoldSumP, KERR.adipose.skinfoldSumS, 1, heightCm)
  return (z * KERR.adipose.massS + KERR.adipose.massP) * (heightCm / PHANTOM_STATURE_CM) ** SCALE_EXP
}

function boneMassKg(input: IsakRawInput): number {
  const { breadths: br, girths: gi, heightCm } = input
  const zHead = (gi.headCm - KERR.bone.headGirthP) / KERR.bone.headGirthS
  const headBone = zHead * KERR.bone.headMassS + KERR.bone.headMassP
  const sumBreadth = br.biacromialCm + br.biiliocristalCm + 2 * br.humerusCm + 2 * br.femurCm
  const zBody = phantomZ(sumBreadth, KERR.bone.breadthSumP, KERR.bone.breadthSumS, 1, heightCm)
  const bodyBone = (zBody * KERR.bone.bodyMassS + KERR.bone.bodyMassP) * (heightCm / PHANTOM_STATURE_CM) ** SCALE_EXP
  return bodyBone + headBone
}

function muscleMassKg(input: IsakRawInput): number {
  const { girths: gi, skinfolds: sf, heightCm } = input
  const sumCorrected =
    correctedGirth(gi.armRelaxedCm, sf.tricepsMm) +
    gi.forearmCm +
    correctedGirth(gi.thighCm, sf.frontThighMm) +
    correctedGirth(gi.calfCm, sf.medialCalfMm) +
    correctedGirth(gi.chestMesosternaleCm, sf.subscapularMm)
  const z = phantomZ(sumCorrected, KERR.muscle.correctedGirthSumP, KERR.muscle.correctedGirthSumS, 1, heightCm)
  return (z * KERR.muscle.massS + KERR.muscle.massP) * (heightCm / PHANTOM_STATURE_CM) ** SCALE_EXP
}

function residualMassKg(input: IsakRawInput): number {
  const { breadths: br, girths: gi, skinfolds: sf, sittingHeightCm } = input
  const sumRes = br.apChestDepthCm + br.transverseChestCm + correctedGirth(gi.waistCm, sf.abdominalMm)
  const z = phantomZ(sumRes, KERR.residual.sumP, KERR.residual.sumS, 1, sittingHeightCm, KERR.residual.sittingHeightP)
  return (
    (z * KERR.residual.massS + KERR.residual.massP) *
    (sittingHeightCm / KERR.residual.sittingHeightP) ** SCALE_EXP
  )
}

function fractionate5C(input: IsakRawInput): Fractionation5C {
  const adipose = adiposeMassKg(input)
  const muscle = muscleMassKg(input)
  const bone = boneMassKg(input)
  const residual = residualMassKg(input)
  const skin = skinMassKg(input.weightKg, input.heightCm, input.sex, input.ageYears)

  const predicted = adipose + muscle + bone + residual + skin
  const pct = (kg: number) => (predicted > 0 ? round2((kg / predicted) * 100) : 0)

  return {
    adipose: { kg: round2(adipose), pct: pct(adipose) },
    muscle: { kg: round2(muscle), pct: pct(muscle) },
    bone: { kg: round2(bone), pct: pct(bone) },
    residual: { kg: round2(residual), pct: pct(residual) },
    skin: { kg: round2(skin), pct: pct(skin) },
    predictedMassKg: round2(predicted),
    measuredWeightKg: round2(input.weightKg),
    massDifferenceKg: round2(input.weightKg - predicted),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Somatotipo Heath-Carter (espejo VERBATIM de domain/bodycomp/somatotype.ts)
// ────────────────────────────────────────────────────────────────────────────

const COMPONENT_FLOOR = 0.1
const HWR_HIGH = 40.75
const HWR_LOW = 38.25

function floorComponent(value: number): number {
  return value <= 0 ? COMPONENT_FLOOR : value
}

function endomorphy(input: IsakRawInput): number {
  const { skinfolds: sf, heightCm } = input
  const x = (sf.tricepsMm + sf.subscapularMm + sf.supraspinaleMm) * (PHANTOM_STATURE_CM / heightCm)
  const value = -0.7182 + 0.1451 * x - 0.00068 * x ** 2 + 0.0000014 * x ** 3
  return round2(floorComponent(value))
}

function mesomorphy(input: IsakRawInput): number {
  const { breadths: br, girths: gi, skinfolds: sf, heightCm } = input
  const cag = correctedGirth(gi.armFlexedCm, sf.tricepsMm)
  const ccg = correctedGirth(gi.calfCm, sf.medialCalfMm)
  const value = 0.858 * br.humerusCm + 0.601 * br.femurCm + 0.188 * cag + 0.161 * ccg - 0.131 * heightCm + 4.5
  return round2(floorComponent(value))
}

function ectomorphy(input: IsakRawInput): number {
  const hwr = input.heightCm / Math.cbrt(input.weightKg)
  let value: number
  if (hwr >= HWR_HIGH) {
    value = 0.732 * hwr - 28.58
  } else if (hwr > HWR_LOW) {
    value = 0.463 * hwr - 17.63
  } else {
    value = COMPONENT_FLOOR
  }
  return round2(floorComponent(value))
}

function heathCarter(input: IsakRawInput): Somatotype {
  return {
    endomorphy: endomorphy(input),
    mesomorphy: mesomorphy(input),
    ectomorphy: ectomorphy(input),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// % grasa por pliegues (espejo VERBATIM de domain/bodycomp/bodyfat.ts)
// ────────────────────────────────────────────────────────────────────────────

interface DwCoeff {
  maxAge: number
  c: number
  m: number
}

const DW_MALE: DwCoeff[] = [
  { maxAge: 16, c: 1.1533, m: 0.0643 },
  { maxAge: 19, c: 1.162, m: 0.063 },
  { maxAge: 29, c: 1.1631, m: 0.0632 },
  { maxAge: 39, c: 1.1422, m: 0.0544 },
  { maxAge: 49, c: 1.162, m: 0.07 },
  { maxAge: Infinity, c: 1.1715, m: 0.0779 },
]

const DW_FEMALE: DwCoeff[] = [
  { maxAge: 16, c: 1.1369, m: 0.0598 },
  { maxAge: 19, c: 1.1549, m: 0.0678 },
  { maxAge: 29, c: 1.1599, m: 0.0717 },
  { maxAge: 39, c: 1.1423, m: 0.0632 },
  { maxAge: 49, c: 1.1333, m: 0.0612 },
  { maxAge: Infinity, c: 1.1339, m: 0.0645 },
]

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5
}

function siriBodyFatPct(bodyDensity: number): number {
  return 495 / bodyDensity - 450
}

function selectDwCoeff(sex: Sex, ageYears: number): DwCoeff {
  const table = sex === 'male' ? DW_MALE : DW_FEMALE
  return table.find((band) => ageYears <= band.maxAge) ?? table[table.length - 1]
}

function durninWomersley(input: BodyFatInput): BodyFatResult {
  if (input.ageYears === undefined) {
    throw new Error('durnin_womersley requiere ageYears para seleccionar la banda de edad')
  }
  const { skinfolds: sf } = input
  const sum4 = sf.bicepsMm + sf.tricepsMm + sf.subscapularMm + sf.iliacCrestMm
  const { c, m } = selectDwCoeff(input.sex, input.ageYears)
  const density = c - m * Math.log10(sum4)
  return {
    equation: 'durnin_womersley',
    percent: round2(siriBodyFatPct(density)),
    bodyDensity: round5(density),
  }
}

function yuhasz(input: BodyFatInput): BodyFatResult {
  const { skinfolds: sf } = input
  const sum6 =
    sf.tricepsMm + sf.subscapularMm + sf.supraspinaleMm + sf.abdominalMm + sf.frontThighMm + sf.medialCalfMm
  const percent = input.sex === 'male' ? 0.1051 * sum6 + 2.585 : 0.1548 * sum6 + 3.58
  return { equation: 'yuhasz', percent: round2(percent) }
}

function faulkner(input: BodyFatInput): BodyFatResult {
  const { skinfolds: sf } = input
  const sum4 = sf.tricepsMm + sf.subscapularMm + sf.iliacCrestMm + sf.abdominalMm
  return { equation: 'faulkner', percent: round2(5.783 + 0.153 * sum4) }
}

function bodyFatPct(input: BodyFatInput, equation: BodyFatEquation): BodyFatResult {
  switch (equation) {
    case 'durnin_womersley':
      return durninWomersley(input)
    case 'yuhasz':
      return yuhasz(input)
    case 'faulkner':
      return faulkner(input)
    default:
      throw new Error(`Ecuacion de % grasa no soportada: ${String(equation)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// computeIsak (espejo VERBATIM de domain/bodycomp/index.ts)
// ────────────────────────────────────────────────────────────────────────────

export function isakEquationLabel(bodyFatEquation: BodyFatEquation): string {
  return `kerr5c+heath_carter+${bodyFatEquation}`
}

export function computeIsak(
  raw: IsakRawInput,
  opts: { bodyFatEquation?: BodyFatEquation } = {}
): IsakResult {
  const bodyFatEquation = opts.bodyFatEquation ?? 'durnin_womersley'
  return {
    fractionation: fractionate5C(raw),
    somatotype: heathCarter(raw),
    bodyFat: bodyFatPct(raw, bodyFatEquation),
    equationUsed: isakEquationLabel(bodyFatEquation),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura del jsonb metrics (espejo de lib/bodycomp/view-helpers.ts)
// ────────────────────────────────────────────────────────────────────────────

export interface BodyCompositionRow {
  id: string
  client_id: string
  method: string
  measured_at: string
  weight_kg: number | null
  height_cm: number | null
  device_brand: string | null
  device_model: string | null
  equation_used: string | null
  metrics: unknown
  is_validated: boolean
  notes: string | null
}

export interface IsakMetricsView {
  fractionation: {
    adipose: MassComponent
    muscle: MassComponent
    bone: MassComponent
    residual: MassComponent
    skin: MassComponent
    predictedMassKg: number
    measuredWeightKg: number
    massDifferenceKg: number
  }
  somatotype: Somatotype
  bodyFat: { equation: string; percent: number; bodyDensity?: number }
  equationUsed: string
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function massComp(v: unknown): MassComponent {
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
      adipose: massComp(f.adipose),
      muscle: massComp(f.muscle),
      bone: massComp(f.bone),
      residual: massComp(f.residual),
      skin: massComp(f.skin),
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
      ...(typeof bf.bodyDensity === 'number' ? { bodyDensity: bf.bodyDensity } : {}),
    },
    equationUsed: typeof m.equationUsed === 'string' ? m.equationUsed : '',
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

/** Etiqueta corta de fecha para el eje X de las series. */
export function shortDate(measuredAt: string): string {
  return new Date(measuredAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

/** Delta de un valor vs la medición ANTERIOR del MISMO método (rows desc por fecha). */
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

export function formatPct(v: number): string {
  return `${v.toFixed(1)}%`
}

// ────────────────────────────────────────────────────────────────────────────
// Reads / writes (PostgREST, RLS coach)
// ────────────────────────────────────────────────────────────────────────────

const LIST_COLUMNS =
  'id, client_id, method, measured_at, weight_kg, height_cm, device_brand, device_model, ' +
  'equation_used, metrics, is_validated, notes'

export interface BodyCompClientRow {
  id: string
  full_name: string | null
}

/** Datos mínimos del alumno (nombre) para la cabecera. */
export async function getBodyCompClient(clientId: string): Promise<BodyCompClientRow | null> {
  try {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name')
      .eq('id', clientId)
      .maybeSingle()
    if (!data) return null
    const c = data as any
    return { id: c.id, full_name: c.full_name ?? null }
  } catch {
    return null
  }
}

/** Mediciones (no borradas) de un alumno para UN método, más reciente primero. */
export async function listMeasurements(
  clientId: string,
  method: 'bia' | 'isak'
): Promise<BodyCompositionRow[]> {
  try {
    const { data } = await supabase
      .from('body_composition_measurements')
      .select(LIST_COLUMNS)
      .eq('client_id', clientId)
      .eq('method', method)
      .is('deleted_at', null)
      .order('measured_at', { ascending: false })
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      client_id: r.client_id,
      method: r.method,
      measured_at: r.measured_at,
      weight_kg: r.weight_kg ?? null,
      height_cm: r.height_cm ?? null,
      device_brand: r.device_brand ?? null,
      device_model: r.device_model ?? null,
      equation_used: r.equation_used ?? null,
      metrics: r.metrics ?? null,
      is_validated: r.is_validated ?? false,
      notes: r.notes ?? null,
    })) as BodyCompositionRow[]
  } catch {
    return []
  }
}

export interface BiaSavePayload {
  deviceBrand?: string | null
  deviceModel?: string | null
  weightKg?: number | null
  heightCm?: number | null
  metrics: BiaMetrics
  notes?: string | null
}

/**
 * Guarda una medición BIA. Hardening de gating (#3): la escritura YA NO va por PostgREST directo,
 * sino por `/api/mobile/bodycomp/bia`, que corre `assertModule('body_composition')` SERVER-SIDE
 * antes de insertar (la RLS no chequea enabled_modules → sin el endpoint un coach sin el módulo
 * podría escribir por API directa y evadir el cobro). El server valida con el MISMO schema
 * (defensa en profundidad). La firma y el shape de retorno NO cambian (las pantallas no se tocan).
 */
export async function saveBiaMeasurement(
  clientId: string,
  payload: BiaSavePayload
): Promise<{ error: string | null }> {
  const candidate = {
    method: 'bia' as const,
    clientId,
    metrics: payload.metrics,
    deviceBrand: payload.deviceBrand ?? null,
    deviceModel: payload.deviceModel ?? null,
    weightKg: payload.weightKg ?? null,
    heightCm: payload.heightCm ?? null,
    notes: payload.notes ?? null,
  }
  const parsed = BodyCompositionCreateSchema.safeParse(candidate)
  if (!parsed.success) {
    return { error: 'Revisá los datos: hay valores fuera de rango.' }
  }
  try {
    await apiFetch('/api/mobile/bodycomp/bia', {
      method: 'POST',
      authenticated: true,
      body: candidate,
    })
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo guardar la medición.' }
  }
}

/**
 * Guarda una medición ISAK. Hardening de gating (#3): la escritura va por
 * `/api/mobile/bodycomp/isak` (assertModule SERVER-SIDE antes de insertar). CLAVE: el cálculo
 * (Kerr 5C + Heath-Carter + %grasa) lo hace el SERVER (`computeIsak` dentro del service) — el
 * cliente solo envía los crudos (`rawInput`) + la ecuación, NUNCA `metrics`. Así el % grasa
 * persistido no depende de un cálculo del client. La firma y el shape de retorno NO cambian.
 * El `computeIsak` local que queda en este lib se usa SOLO para la vista previa del wizard.
 */
export async function saveIsakMeasurement(
  clientId: string,
  rawInput: IsakRawInputDto,
  bodyFatEquation: BodyFatEquationDto
): Promise<{ error: string | null }> {
  const candidate = {
    method: 'isak' as const,
    clientId,
    rawInput,
    bodyFatEquation,
    weightKg: rawInput.weightKg,
    heightCm: rawInput.heightCm,
  }
  const parsed = BodyCompositionCreateSchema.safeParse(candidate)
  if (!parsed.success) {
    return { error: 'Revisá los datos: hay valores fuera de rango.' }
  }
  try {
    await apiFetch('/api/mobile/bodycomp/isak', {
      method: 'POST',
      authenticated: true,
      body: candidate,
    })
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo guardar la medición.' }
  }
}

/**
 * Soft-delete (deleted_at) de una medición. Hardening de gating (#3): va por
 * `/api/mobile/bodycomp/[id]` (assertModule SERVER-SIDE antes del soft-delete; RLS = techo).
 * Idempotente. Firma y shape de retorno sin cambios.
 */
export async function deleteMeasurement(id: string): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/api/mobile/bodycomp/${id}`, {
      method: 'DELETE',
      authenticated: true,
    })
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo eliminar la medición.' }
  }
}
