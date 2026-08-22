import { useSyncExternalStore } from 'react'
import * as Sentry from '@sentry/react-native'
import {
  ONBOARDING_STEP_KEYS,
  type OnboardingSignals,
  type OnboardingStepKey,
} from '@eva/onboarding'
import { PERSONAS, type Persona } from '@eva/schemas'
import { getCoachProfile, type CoachProfile } from './coach'
import { loadStoredBranding } from './branding'
import { supabase } from './supabase'
import { apiFetch } from './api'
import { selectWithFallback } from './db-compat'
import { isUuid } from './safe-uuid'
import { getActiveCoachWorkspace } from './workspace'

export type MobileKpiSummary = {
  mrrCurrentMonth: number
  mrrPreviousMonth: number
  mrrDeltaPct: number
  totalClients: number
  riskCount: number
  avgAdherence: number
  avgNutrition: number
}

export type MobileRiskAlertItem = {
  clientId: string
  clientName: string
  attentionScore: number
  label: string
  flags?: string[]
}

export type MobileAgendaItem = {
  id: string
  clientId: string
  clientName: string
  kind: 'programa_vence' | 'checkin_pendiente' | 'sin_ejercicio'
  label: string
}

export type MobileExpiringProgramItem = {
  id: string
  name: string
  clientId: string
  clientName: string
  daysLeft: number
}

export type MobileActivityItem = {
  id: string
  type: 'nuevo alumno' | 'check-in' | 'workout'
  title: string
  subtitle: string
  date: string
  clientId?: string | null
  photoUrl?: string | null
  /** Solo items `check-in`: `true` si el coach ya lo reviso (`reviewed_at != null`). Alimenta la senal + filtro del feed (1:1 con ActivityItemClient web). */
  reviewed?: boolean
}

export type MobileClientPaymentSummary = {
  clientId: string
  clientName: string
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  lastPaymentPeriodMonths: number | null
  nextRenewalDate: string | null
  hasRecentPayment: boolean
}

export type MobileClientStats = {
  clientId: string
  clientName: string
  hasAdherenceData: boolean
  hasNutritionData: boolean
  adherencePct: number
  nutritionPct: number
  adherenceHint: string
  nutritionHint: string
  adherenceHistory4w: number[]
  weightHistory30d: { date: string; value: number }[]
  currentWeight: number | null
  weightDelta7d: number | null
  oneRMDelta: number | null
  streak: number
  latestEnergyLevel: number | null
  planDaysRemaining: number | null
  planCurrentWeek: number | null
  planTotalWeeks: number | null
  attentionScore: number
}

export type MobileChartPoint = {
  name: string
  fullName?: string
  sesiones?: number
  alumnos?: number
}

/**
 * Coach del dashboard = `CoachProfile` + el logo OSCURO.
 *
 * `CoachProfile` (lib/coach.ts) ya trae `logoUrl` porque el camino DEGRADADO lo lee de Supabase
 * directo; el endpoint `/api/mobile/coach/dashboard` históricamente servía solo `hasCoachLogo`
 * (booleano), así que en el camino feliz el logo llegaba `undefined` y el avatar del saludo caía
 * a la figura EVA aunque el coach tuviera logo. `logoUrlDark` nunca existió en este tipo.
 */
export type MobileDashboardCoach = CoachProfile & {
  /** `coaches.logo_url_dark` — variante para tema oscuro. `null` ⇒ se usa `logoUrl`. */
  logoUrlDark?: string | null
}

export type MobileDashboardData = {
  coach: MobileDashboardCoach
  publicCode: { inviteCode: string; shouldConfirm: boolean } | null
  onboardingGuide: Record<string, unknown>
  activePlans: number
  hasStudentSignal30d: boolean
  clientList: Array<{ id: string; name: string }>
  clientPaymentSummary: MobileClientPaymentSummary[]
  clientStats: MobileClientStats[]
  areaData: MobileChartPoint[]
  barData: MobileChartPoint[]
  kpi: MobileKpiSummary
  /**
   * Alumnos que OCUPAN CUPO — el predicado del gate del server, NO el del KPI.
   *
   * `kpi.totalClients` cuenta `is_archived = false AND is_active = true` (alumnos activos, que es
   * lo que el coach ve como métrica) y el gate cuenta `is_archived = false AND is_demo = false`
   * (`services/billing/capacity.service.ts` → `countActiveStandaloneClients`, espejado por
   * `api/mobile/coach/clients/route.ts:201`). Los dos números divergen en los dos sentidos: un
   * alumno pausado ocupa cupo y no aparece en el KPI, y el alumno de ejemplo del onboarding
   * aparece en el KPI sin ocupar cupo. El banner de cupo del home tiene que decir lo MISMO que el
   * muro del alta, así que consume este campo y no el KPI.
   *
   * Si el conteo falla (columna ausente, red caída) degrada a `kpi.totalClients`: mejor el número
   * viejo que ningún banner.
   */
  capClients: number
  topRiskClients: MobileRiskAlertItem[]
  agenda: MobileAgendaItem[]
  expiringPrograms: MobileExpiringProgramItem[]
  recentActivities: MobileActivityItem[]
  /** Check-ins recientes (ventana del feed) sin revisar por el coach. Alimenta el badge "por revisar" (1:1 con DashboardV2Data). */
  pendingCheckinsCount: number
  /** D-F1: true cuando el endpoint falló y se usó el cálculo local degradado (adherencia heurística, sin nutrición/peso/streak). */
  degraded?: boolean
  /**
   * Onboarding v2 (SPEC coach-onboarding-v2): persona, alumno de ejemplo, guía y señales reales.
   * SIEMPRE presente — el parser degrada solo cuando el endpoint todavía no lo sirve.
   */
  onboardingV2: MobileOnboardingV2
}

// ── Onboarding v2 ────────────────────────────────────────────────────────────────────────────

/**
 * Estado PERSISTIDO de la guía (`coaches.onboarding_guide`), la misma foto que lee la web.
 * Es lo que hace que ocultar la guía en el panel la oculte también en el teléfono.
 */
export type MobileOnboardingGuideState = {
  /** Pasos tildados y persistidos. Los que no aparecen se resuelven por señal. */
  completed: Partial<Record<OnboardingStepKey, boolean>>
  /** El coach mandó la guía al pie / la descartó. */
  dismissed: boolean
  /** El coach la apagó del todo («No mostrar la guía»). */
  hidden: boolean
  /** Instante ISO de la primera visita a la guía. `null` = todavía no la vio. */
  guideSeenAt: string | null
}

/**
 * Contrato del objeto `onboardingV2` del endpoint `/api/mobile/coach/dashboard`.
 *
 * Lo SIRVE el gate de persona de RN (W5-A, TASKS F5.1) con los mismos datos que
 * `getCoachOnboardingV2Data` le da a la web: persona, demo, guía y señales YA computadas
 * server-side. Acá no se decide nada — la app refleja.
 */
export type MobileOnboardingV2 = {
  /** `coaches.persona`. `null` = coach viejo que nunca contestó «¿A qué te dedicas?». */
  persona: Persona | null
  /** `coaches.persona_also_other` (nutrición para 1/3/4, entrenamiento para 2). */
  alsoOther: boolean
  /** El server pide pasar por la pantalla de persona antes de seguir. */
  needsPersona: boolean
  demoClientId: string | null
  demoName: string | null
  guide: MobileOnboardingGuideState
  signals: OnboardingSignals
}

/** Clave del jsonb con el sello de «ya vio la guía». Idéntica a la de la web. */
export const GUIDE_SEEN_AT_KEY = 'guide_seen_at'

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null
}

function asPersona(raw: unknown): Persona | null {
  return typeof raw === 'string' && (PERSONAS as readonly string[]).includes(raw)
    ? (raw as Persona)
    : null
}

function asTrimmedString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

/**
 * Normaliza el bloque `coach` del endpoint para que el logo de marca sobreviva al viaje.
 *
 * Acepta camelCase y snake_case (`logoUrl`/`logo_url`, `logoUrlDark`/`logo_url_dark`): el
 * endpoint está agregando los campos hoy y un binario viejo contra un deploy nuevo —o al revés—
 * tiene que seguir arrancando. Un string vacío se normaliza a `null` (una URL en blanco pintaría
 * un avatar hueco en vez de caer al fallback).
 *
 * `fallback` es la CACHÉ DE MARCA (`branding` del ThemeContext, escrita por
 * `bootstrapOwnCoachBranding` y por el Guardar de «Mi marca»): si el endpoint todavía no sirve
 * los logos, el dashboard igual los tiene. La caché NO pisa lo que sí vino del server — ahí manda
 * el server, que es la fuente fresca.
 *
 * `hasCoachLogo` NO se recalcula si el server lo mandó: responde «¿el coach subió un logo?» y va
 * SIN gatear por tier a propósito (una señal del onboarding no puede cambiar de respuesta según el
 * plan), mientras que las URLs sí llegan gateadas. Solo se deriva cuando el payload no lo trae.
 */
export function parseMobileDashboardCoach(
  raw: unknown,
  fallback?: { logoUrl?: string | null; logoUrlDark?: string | null } | null,
): MobileDashboardCoach {
  const source = asRecord(raw) ?? {}
  const logoUrl =
    asTrimmedString(source.logoUrl) ?? asTrimmedString(source.logo_url) ?? asTrimmedString(fallback?.logoUrl)
  const logoUrlDark =
    asTrimmedString(source.logoUrlDark) ??
    asTrimmedString(source.logo_url_dark) ??
    asTrimmedString(fallback?.logoUrlDark)
  return {
    ...(raw as CoachProfile),
    logoUrl,
    logoUrlDark,
    hasCoachLogo: typeof source.hasCoachLogo === 'boolean' ? source.hasCoachLogo : Boolean(logoUrl || logoUrlDark),
  }
}

/**
 * Parser del estado de la guía dentro de `coaches.onboarding_guide` (o del bloque `guide` que
 * sirve el endpoint). Solo reconoce las 5 claves de `@eva/onboarding`: un jsonb con basura o con
 * claves viejas (`first_plan`, `first_checkin` de la guía v1) no ensucia el progreso.
 */
export function parseMobileOnboardingGuide(raw: unknown): MobileOnboardingGuideState {
  const source = asRecord(raw) ?? {}
  const completedRaw = asRecord(source.completed) ?? {}
  const completed: Partial<Record<OnboardingStepKey, boolean>> = {}
  for (const key of ONBOARDING_STEP_KEYS) {
    if (completedRaw[key] === true) completed[key] = true
  }
  return {
    completed,
    dismissed: source.dismissed === true,
    hidden: source.hidden === true,
    // El endpoint lo sirve camelCase dentro de `guide`; el jsonb crudo, snake_case.
    guideSeenAt: asTrimmedString(source.guideSeenAt) ?? asTrimmedString(source[GUIDE_SEEN_AT_KEY]),
  }
}

/**
 * Parser TOLERANTE del objeto `onboardingV2`. A mano y no con Zod a propósito: el caso que hay que
 * sobrevivir no es «un campo con el tipo equivocado» sino «el endpoint todavía no sirve el objeto»
 * (binario nuevo contra un deploy viejo, y al revés). Un `safeParse` fallido devolvería `null` y
 * la guía se caería entera; acá cada campo degrada por separado y la pantalla sigue en pie.
 *
 * `legacyGuide` es el `onboardingGuide` crudo que el endpoint ya devolvía antes de W5: mientras el
 * bloque `guide` no exista, el progreso, el `dismissed` y el sello salen de ahí — que es la MISMA
 * fila de la base, así que el cruce web ↔ app funciona igual.
 */
export function parseMobileOnboardingV2(raw: unknown, legacyGuide?: unknown): MobileOnboardingV2 {
  const source = asRecord(raw)
  const signalsRaw = asRecord(source?.signals) ?? {}
  const realClients = signalsRaw.realClients
  const demo = asRecord(source?.demo)

  return {
    persona: asPersona(source?.persona),
    alsoOther: source?.alsoOther === true,
    needsPersona: source?.needsPersona === true,
    // El demo puede venir plano (`demoClientId`) o anidado (`demo: { clientId, fullName }`), que es
    // la forma que ya usa la web (`DemoStudentSnapshot`). Se aceptan las dos.
    demoClientId: asTrimmedString(source?.demoClientId) ?? asTrimmedString(demo?.clientId),
    demoName: asTrimmedString(source?.demoName) ?? asTrimmedString(demo?.fullName),
    guide: parseMobileOnboardingGuide(source?.guide ?? legacyGuide),
    signals: {
      hasBrand: signalsRaw.hasBrand === true,
      viveTuAppOpened: signalsRaw.viveTuAppOpened === true,
      hasFirstArtifact: signalsRaw.hasFirstArtifact === true,
      realClients: typeof realClients === 'number' && Number.isFinite(realClients) ? realClients : 0,
      realStudentActivity: signalsRaw.realStudentActivity === true,
    },
  }
}

// ── Store de la guía (para la píldora flotante) ──────────────────────────────────────────────

/**
 * Foto compartida del onboarding v2, para que la píldora flotante
 * (`components/coach/GuidePill.tsx`) NO tenga que pedir nada al servidor.
 *
 * La píldora se monta en el layout de los tabs, donde no hay datos: en vez de duplicar la consulta
 * más cara de la app, las dos pantallas que YA la pagan (el dashboard y la guía) publican su
 * resultado acá y la píldora lo lee. Store de módulo + `useSyncExternalStore`, el mismo patrón que
 * `lib/workspace.ts` y `lib/entitlements.ts`: estado app-wide sin envolver el árbol en un Provider.
 *
 * Es CACHE DE PRESENTACIÓN, no autoridad: quien decide qué está hecho es el servidor.
 */
export type CoachOnboardingSnapshot = { coachId: string; onboardingV2: MobileOnboardingV2 }

let onboardingSnapshot: CoachOnboardingSnapshot | null = null
const onboardingListeners = new Set<() => void>()

/** Publica la foto más fresca. La llaman el dashboard y la guía después de cada carga. */
export function publishCoachOnboarding(snapshot: CoachOnboardingSnapshot): void {
  onboardingSnapshot = snapshot
  for (const listener of onboardingListeners) listener()
}

/** Limpia la foto (cambio de cuenta): la píldora del coach anterior no debe sobrevivir. */
export function clearCoachOnboarding(): void {
  if (onboardingSnapshot == null) return
  onboardingSnapshot = null
  for (const listener of onboardingListeners) listener()
}

function subscribeCoachOnboarding(listener: () => void): () => void {
  onboardingListeners.add(listener)
  return () => {
    onboardingListeners.delete(listener)
  }
}

/** Foto actual sin hook (para código que no está dentro de un render). */
export function getCoachOnboardingSnapshot(): CoachOnboardingSnapshot | null {
  return onboardingSnapshot
}

function readCoachOnboarding(): CoachOnboardingSnapshot | null {
  return onboardingSnapshot
}

/** Foto actual del onboarding v2. `null` = todavía nadie cargó el panel en esta sesión. */
export function useCoachOnboarding(): CoachOnboardingSnapshot | null {
  return useSyncExternalStore(subscribeCoachOnboarding, readCoachOnboarding, readCoachOnboarding)
}

// ── Escrituras de la guía (mismo endpoint que el dashboard) ──────────────────────────────────

/**
 * `step_key` con el que la app emite la telemetría de la guía.
 *
 * Fallback cuando el emisor no dice de qué paso habla (p. ej. la píldora): el endpoint
 * (`api/mobile/coach/dashboard/route.ts`, `MOBILE_EVENT_STEP_KEYS`) acepta desde W5 los cinco pasos
 * v2 + `persona`, así que los emisores que SÍ saben el paso lo mandan real — por el tercer
 * parámetro o, para no tocar llamadores, por `metadata.stepKey` / `metadata.step`. (Auditoría 22-08,
 * spec-rn missed: el `stepKey` fijo para todo era un workaround ya obsoleto que ensuciaba la tabla.)
 */
const GUIDE_EVENT_STEP_KEY = 'profile_branding'

/** Step keys que el endpoint móvil acepta en la columna `step_key`. */
const MOBILE_EVENT_STEP_KEYS: ReadonlySet<string> = new Set([
  ...ONBOARDING_STEP_KEYS,
  'first_plan',
  'first_checkin',
  'persona',
])

/** Resuelve el `step_key` real: parámetro explícito > `metadata.stepKey` > `metadata.step` > fallback. */
export function resolveOnboardingEventStepKey(
  metadata: Record<string, string | number | boolean> | undefined,
  explicit?: string,
): string {
  for (const candidate of [explicit, metadata?.stepKey, metadata?.step]) {
    if (typeof candidate === 'string' && MOBILE_EVENT_STEP_KEYS.has(candidate)) return candidate
  }
  return GUIDE_EVENT_STEP_KEY
}

/**
 * Persiste un parche del jsonb `coaches.onboarding_guide`. El servidor hace MERGE con lo que ya
 * había, así que dos superficies (web y app) no se pisan: cada una manda solo lo que cambió.
 *
 * Best-effort: la guía es una foto del trabajo real, no un formulario. Si la escritura falla, el
 * próximo `GET` vuelve a traer el estado del server y no se pierde nada que el coach haya hecho.
 */
export async function persistCoachOnboardingGuide(patch: Record<string, unknown>): Promise<void> {
  try {
    await apiFetch<{ ok: true }>('/api/mobile/coach/dashboard', {
      method: 'POST',
      authenticated: true,
      body: { action: 'persist_onboarding_guide', guide: patch },
    })
  } catch {
    // Telemetría/estado, nunca el camino crítico del coach.
  }
}

/** Emite un evento del funnel de onboarding (`coach_onboarding_events`). Best-effort. */
export async function postCoachOnboardingEvent(
  eventType: 'step_completed' | 'step_reopened' | 'aha_moment' | 'guide_engagement',
  metadata?: Record<string, string | number | boolean>,
  stepKey?: string,
): Promise<void> {
  try {
    await apiFetch<{ ok: true }>('/api/mobile/coach/dashboard', {
      method: 'POST',
      authenticated: true,
      body: {
        action: 'onboarding_event',
        stepKey: resolveOnboardingEventStepKey(metadata, stepKey),
        eventType,
        metadata,
      },
    })
  } catch {
    // Ídem: medir no puede romper la pantalla.
  }
}

type ClientRow = {
  id: string
  full_name: string
  created_at: string
  onboarding_completed?: boolean | null
}

type CheckInRow = {
  id: string
  client_id: string
  created_at: string
  date?: string | null
  weight?: number | null
  energy_level?: number | null
  reviewed_at?: string | null
}

type WorkoutLogRow = {
  id: string
  client_id: string
  logged_at: string
}

type ClientPaymentRow = {
  client_id: string | null
  payment_date: string
  amount: number | string
  status: string | null
  period_months: number | null
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function monthKeyFromYm(y: number, month0: number): string {
  return `${y}-${String(month0 + 1).padStart(2, '0')}`
}

function addWholeMonths(y: number, month0: number, delta: number): { y: number; month0: number } {
  const dt = new Date(y, month0 + delta, 1)
  return { y: dt.getFullYear(), month0: dt.getMonth() }
}

function parsePaymentAmount(amount: unknown): number {
  if (typeof amount === 'number' && !Number.isNaN(amount)) return amount
  if (typeof amount === 'string') {
    const n = Number.parseFloat(amount)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function parsePaymentYmd(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function isLastDayOfCalendarMonth(y: number, month1to12: number, day: number): boolean {
  return day === new Date(y, month1to12, 0).getDate()
}

function isPaidStatus(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase()
  return s === 'paid' || s === 'pagado' || s === 'completed'
}

function allocatePaymentToMonthKeys(
  paymentDateIso: string,
  amountRaw: unknown,
  periodMonths: number | null | undefined
): Record<string, number> {
  const ymd = parsePaymentYmd(paymentDateIso)
  if (!ymd) return {}

  const total = Math.round(parsePaymentAmount(amountRaw))
  if (total <= 0) return {}

  const pm = Math.max(1, periodMonths ?? 1)
  let startY = ymd.y
  let startM0 = ymd.m - 1

  if (isLastDayOfCalendarMonth(ymd.y, ymd.m, ymd.d)) {
    const next = addWholeMonths(startY, startM0, 1)
    startY = next.y
    startM0 = next.month0
  }

  const base = Math.floor(total / pm)
  const remainder = total - base * pm
  const out: Record<string, number> = {}

  for (let i = 0; i < pm; i += 1) {
    const { y, month0 } = addWholeMonths(startY, startM0, i)
    const key = monthKeyFromYm(y, month0)
    const slice = base + (i === pm - 1 ? remainder : 0)
    out[key] = (out[key] ?? 0) + slice
  }

  return out
}

function latestByClient<T extends { client_id: string }>(rows: T[], dateKey: keyof T): Map<string, T> {
  const out = new Map<string, T>()
  for (const row of rows) {
    const existing = out.get(row.client_id)
    if (!existing || new Date(String(row[dateKey])).getTime() > new Date(String(existing[dateKey])).getTime()) {
      out.set(row.client_id, row)
    }
  }
  return out
}

function buildClientPaymentSummary(payments: ClientPaymentRow[], clients: ClientRow[]): MobileClientPaymentSummary[] {
  const thirtyFiveDaysAgo = Date.now() - 35 * 24 * 60 * 60 * 1000
  const paidByClient = new Map<string, { payment_date: string; amount: number; period_months: number | null }>()

  for (const payment of payments) {
    if (!payment.client_id || !isPaidStatus(payment.status)) continue
    const existing = paidByClient.get(payment.client_id)
    if (!existing || new Date(payment.payment_date).getTime() > new Date(existing.payment_date).getTime()) {
      paidByClient.set(payment.client_id, {
        payment_date: payment.payment_date,
        amount: Math.round(parsePaymentAmount(payment.amount)),
        period_months: payment.period_months,
      })
    }
  }

  return clients
    .map((client) => {
      const last = paidByClient.get(client.id) ?? null
      let nextRenewalDate: string | null = null
      if (last?.period_months && last.period_months > 0) {
        const d = new Date(last.payment_date)
        d.setMonth(d.getMonth() + last.period_months)
        nextRenewalDate = d.toISOString().slice(0, 10)
      }
      return {
        clientId: client.id,
        clientName: client.full_name,
        lastPaymentDate: last?.payment_date ?? null,
        lastPaymentAmount: last?.amount ?? null,
        lastPaymentPeriodMonths: last?.period_months ?? null,
        nextRenewalDate,
        hasRecentPayment: last ? new Date(last.payment_date).getTime() > thirtyFiveDaysAgo : false,
      }
    })
    .sort((a, b) => {
      if (a.hasRecentPayment === b.hasRecentPayment) return 0
      // vencido/sin pago primero — igual que web
      return a.hasRecentPayment ? 1 : -1
    })
}

type RichAdherenceStat = {
  clientId: string
  clientName: string
  percentage: number
  completedSets: number
  totalSets: number
  lastPlan: string
  adherenceHistory4w?: number[]
  weightHistory30d?: { date: string; value: number }[]
  currentWeight?: number | null
  weightDelta7d?: number | null
  oneRMDelta?: number | null
  streak?: number
  latestEnergyLevel?: number | null
  planDaysRemaining?: number | null
  planCurrentWeek?: number | null
  planTotalWeeks?: number | null
  attentionScore?: number
}

type RichNutritionStat = {
  clientId: string
  clientName: string
  percentage: number
  consumed: { cal: number; prot?: number; carb?: number; fat?: number }
  target: { cal: number; prot?: number; carb?: number; fat?: number }
  lastPlan: string
}

type MobileDashboardApiResponse = {
  coach: CoachProfile
  publicCode?: { inviteCode: string; shouldConfirm: boolean }
  onboardingGuide?: Record<string, unknown>
  /**
   * Onboarding v2. `unknown` a propósito: lo sirve el gate de persona (W5-A) y un binario viejo
   * contra un deploy nuevo —o al revés— tiene que seguir arrancando. Lo normaliza
   * `parseMobileOnboardingV2`.
   */
  onboardingV2?: unknown
  dashboard: {
    kpi: MobileKpiSummary
    activePlans: number
    hasStudentSignal30d: boolean
    clientList: Array<{ id: string; name: string }>
    clientPaymentSummary: MobileClientPaymentSummary[]
    adherenceStats: RichAdherenceStat[]
    nutritionStats: RichNutritionStat[]
    topRiskClients: MobileRiskAlertItem[]
    agenda: MobileAgendaItem[]
    expiringPrograms: MobileExpiringProgramItem[]
    pendingCheckinsCount?: number
    recentActivities: Array<{
      id: string
      type: 'nuevo alumno' | 'check-in' | 'workout'
      title: string
      subtitle: string
      date: string
      href: string
      photoUrl?: string | null
      clientId?: string | null
      reviewed?: boolean
    }>
    areaData: MobileChartPoint[]
    barData: MobileChartPoint[]
  }
}

/**
 * Barrera de datos en la RAÍZ: `topRiskClients` y `agenda` alimentan CTAs que hacen
 * `router.push(`/coach/cliente/${clientId}`)`. Los tipos declaran `clientId: string`, pero nada lo
 * valida en runtime: una fila con id nulo produce la URL literal `/coach/cliente/null`, el param
 * llega como el STRING 'null' (truthy) y termina en un `invalid input syntax for type uuid` de
 * Postgres. Las filas sin uuid usable se descartan acá — no hay ficha que abrir con ellas.
 */
function dropRowsWithInvalidClientId<T extends { clientId: string }>(
  rows: T[] | undefined,
): { rows: T[]; dropped: number } {
  const list = rows ?? []
  const kept = list.filter((row) => isUuid(row.clientId))
  return { rows: kept, dropped: list.length - kept.length }
}

function mapApiDashboard(
  payload: MobileDashboardApiResponse,
  brandFallback?: { logoUrl?: string | null; logoUrlDark?: string | null } | null,
): MobileDashboardData {
  const adherenceByClient = new Map(payload.dashboard.adherenceStats.map((stat) => [stat.clientId, stat]))
  const nutritionByClient = new Map(payload.dashboard.nutritionStats.map((stat) => [stat.clientId, stat]))

  const clientIds = new Set([...adherenceByClient.keys(), ...nutritionByClient.keys()])
  const clientStats: MobileClientStats[] = [...clientIds].map((clientId) => {
    const stat = adherenceByClient.get(clientId)
    const nutrition = nutritionByClient.get(clientId)
    return {
      clientId,
      clientName: stat?.clientName ?? nutrition?.clientName ?? '',
      hasAdherenceData: Boolean(stat),
      hasNutritionData: Boolean(nutrition),
      adherencePct: stat?.percentage ?? 0,
      nutritionPct: nutrition?.percentage ?? 0,
      adherenceHint: stat ? `${stat.completedSets}/${stat.totalSets} sets · ${stat.lastPlan}` : '',
      nutritionHint: nutrition
        ? `${Math.round(nutrition.consumed.cal)} / ${Math.round(nutrition.target.cal)} kcal`
        : '',
      adherenceHistory4w: stat?.adherenceHistory4w ?? [],
      weightHistory30d: stat?.weightHistory30d ?? [],
      currentWeight: stat?.currentWeight ?? null,
      weightDelta7d: stat?.weightDelta7d ?? null,
      oneRMDelta: stat?.oneRMDelta ?? null,
      streak: stat?.streak ?? 0,
      latestEnergyLevel: stat?.latestEnergyLevel ?? null,
      planDaysRemaining: stat?.planDaysRemaining ?? null,
      planCurrentWeek: stat?.planCurrentWeek ?? null,
      planTotalWeeks: stat?.planTotalWeeks ?? null,
      attentionScore: stat?.attentionScore ?? 0,
    }
  })

  const recentActivities: MobileActivityItem[] = payload.dashboard.recentActivities.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle: item.subtitle,
    date: item.date,
    clientId: item.clientId ?? null,
    photoUrl: item.photoUrl ?? null,
    // Solo check-ins traen `reviewed`; se conserva undefined en el resto (no rompe el filtro del feed).
    reviewed: item.type === 'check-in' ? Boolean(item.reviewed) : undefined,
  }))

  const topRisk = dropRowsWithInvalidClientId(payload.dashboard.topRiskClients)
  const agenda = dropRowsWithInvalidClientId(payload.dashboard.agenda)
  const droppedRows = topRisk.dropped + agenda.dropped
  if (droppedRows > 0) {
    try {
      // UNA sola migaja con el conteo (nunca una por fila): un payload roto no debe inundar Sentry.
      Sentry.addBreadcrumb({
        category: 'nav-uuid-guard',
        level: 'warning',
        message: 'coach-dashboard: filas descartadas por clientId no-uuid',
        data: { topRiskClients: topRisk.dropped, agenda: agenda.dropped },
      })
    } catch {
      // Sentry no inicializado (sin DSN) / versión sin API → no-op silencioso.
    }
  }

  return {
    coach: parseMobileDashboardCoach(payload.coach, brandFallback),
    publicCode: payload.publicCode ?? null,
    onboardingGuide: payload.onboardingGuide ?? {},
    onboardingV2: parseMobileOnboardingV2(payload.onboardingV2, payload.onboardingGuide),
    activePlans: payload.dashboard.activePlans ?? 0,
    hasStudentSignal30d: Boolean(payload.dashboard.hasStudentSignal30d),
    clientList: payload.dashboard.clientList,
    clientPaymentSummary: payload.dashboard.clientPaymentSummary,
    clientStats,
    areaData: payload.dashboard.areaData ?? [],
    barData: payload.dashboard.barData ?? [],
    kpi: payload.dashboard.kpi,
    // El endpoint no sirve el conteo del gate; lo resuelve `getCoachDashboardDataMobile` con una
    // consulta propia y lo pisa. Acá arranca en el KPI para que el tipo nunca quede a medias.
    capClients: payload.dashboard.kpi.totalClients,
    topRiskClients: topRisk.rows,
    agenda: agenda.rows,
    expiringPrograms: payload.dashboard.expiringPrograms,
    recentActivities,
    pendingCheckinsCount: payload.dashboard.pendingCheckinsCount ?? 0,
  }
}

function buildAreaData(workoutLogs: WorkoutLogRow[]): MobileChartPoint[] {
  const countByDay = new Map<string, number>()
  const now = new Date()
  // últimos 30 días
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    countByDay.set(key, 0)
  }
  for (const log of workoutLogs) {
    const day = log.logged_at.slice(0, 10)
    if (countByDay.has(day)) {
      countByDay.set(day, (countByDay.get(day) ?? 0) + 1)
    }
  }
  return Array.from(countByDay.entries()).map(([dateStr, count]) => {
    const [, month, day] = dateStr.split('-')
    return { name: `${day}/${month}`, fullName: dateStr, sesiones: count }
  })
}

function buildBarData(clients: ClientRow[]): MobileChartPoint[] {
  const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const now = new Date()
  const countByMonth = new Map<string, { label: string; count: number }>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    countByMonth.set(key, { label: MONTH_ABBR[d.getMonth()], count: 0 })
  }
  for (const client of clients) {
    const month = client.created_at.slice(0, 7)
    if (countByMonth.has(month)) {
      const entry = countByMonth.get(month)!
      entry.count += 1
    }
  }
  return Array.from(countByMonth.values()).map(({ label, count }) => ({ name: label, alumnos: count }))
}

/**
 * Alumnos que ocupan cupo, con el MISMO predicado que el gate del server:
 * `is_archived = false AND is_demo = false` — sin `is_active` (un alumno pausado sigue ocupando
 * cupo) y sin contar al alumno de ejemplo del onboarding (`is_demo`, que el gate excluye).
 * Espejo de `countActiveStandaloneClients` (`apps/web/src/services/billing/capacity.service.ts`),
 * que es la fuente que decide el 402 `UPGRADE_REQUIRED` del alta.
 *
 * `head: true` + `count: 'exact'`: no trae filas. NUNCA lanza — devuelve `null` y el llamador
 * degrada al conteo del KPI: un banner con el número viejo es mejor que un dashboard que se cae
 * (y este conteo corre dentro del try que reintenta el endpoint entero).
 */
async function countCapClients(
  coachId: string,
  workspace: { orgId: string | null; teamId: string | null } | null,
): Promise<number | null> {
  try {
    let query: any = supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId)
      .eq('is_archived', false)
      .eq('is_demo', false)
    if (workspace?.orgId) query = query.eq('org_id', workspace.orgId).is('team_id', null)
    else if (workspace?.teamId) query = query.is('org_id', null).eq('team_id', workspace.teamId)
    else query = query.is('org_id', null).is('team_id', null)

    const { count, error } = await query
    if (error) return null
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

async function getCoachDashboardDataMobileLocal(): Promise<MobileDashboardData | null> {
  const coach = await getCoachProfile()
  if (!coach) return null

  const workspace = await getActiveCoachWorkspace()

  const now = new Date()
  const today = startOfDay(now)
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const paymentsLookbackStart = new Date(now.getFullYear(), now.getMonth() - 13, 1).toISOString()
  const expiringEndUpper = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const expiringEndLower = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  let clientsQuery: any = supabase
    .from('clients')
    .select('id, full_name, created_at, onboarding_completed')
    .eq('coach_id', coach.id)
    .eq('is_archived', false)
    .eq('is_active', true)
  if (workspace?.orgId) clientsQuery = clientsQuery.eq('org_id', workspace.orgId).is('team_id', null)
  else if (workspace?.teamId) clientsQuery = clientsQuery.is('org_id', null).eq('team_id', workspace.teamId)
  else clientsQuery = clientsQuery.is('org_id', null).is('team_id', null)

  const [
    clientsResult,
    plansCountResult,
    checkInsResult,
    workoutLogsResult,
    expiringProgramsResult,
    paymentsResult,
  ] = await Promise.all([
    clientsQuery,
    supabase
      .from('workout_plans')
      .select('id, client_id')
      .eq('coach_id', coach.id),
    // reviewed_at alimenta el badge/filtro de Novedades; puede faltar en DBs legacy → fallback sin ella.
    selectWithFallback<CheckInRow[]>(
      () => supabase
        .from('check_ins')
        .select('id, client_id, created_at, date, weight, energy_level, reviewed_at')
        .gte('created_at', thirtyDaysAgoIso)
        .order('created_at', { ascending: false })
        .limit(300) as unknown as PromiseLike<{ data: CheckInRow[] | null; error: { code?: string; message?: string } | null }>,
      () => supabase
        .from('check_ins')
        .select('id, client_id, created_at, date, weight, energy_level')
        .gte('created_at', thirtyDaysAgoIso)
        .order('created_at', { ascending: false })
        .limit(300) as unknown as PromiseLike<{ data: CheckInRow[] | null; error: { code?: string; message?: string } | null }>
    ),
    supabase
      .from('workout_logs')
      .select('id, client_id, logged_at')
      .gte('logged_at', thirtyDaysAgoIso)
      .order('logged_at', { ascending: false })
      .limit(500),
    supabase
      .from('workout_programs')
      .select('id, name, end_date, client_id')
      .eq('coach_id', coach.id)
      .eq('is_active', true)
      .not('end_date', 'is', null)
      .gte('end_date', expiringEndLower)
      .lte('end_date', expiringEndUpper)
      .order('end_date', { ascending: true })
      .limit(100),
    supabase
      .from('client_payments')
      .select('client_id, payment_date, amount, status, period_months')
      .eq('coach_id', coach.id)
      .gte('payment_date', paymentsLookbackStart),
  ])

  const clients = (clientsResult.data ?? []) as ClientRow[]
  const clientMap = new Map(clients.map((c) => [c.id, c]))
  const clientIds = new Set(clients.map((c) => c.id))
  const checkIns = ((checkInsResult.data ?? []) as CheckInRow[]).filter((row) => clientIds.has(row.client_id))
  const workoutLogs = ((workoutLogsResult.data ?? []) as WorkoutLogRow[]).filter((row) => clientIds.has(row.client_id))
  const payments = ((paymentsResult.data ?? []) as ClientPaymentRow[]).filter((row) => clientIds.has(row.client_id ?? ''))
  const activePlanCount = ((plansCountResult.data ?? []) as Array<{ id: string; client_id: string | null }>)
    .filter((row) => row.client_id != null && clientIds.has(row.client_id)).length

  const latestCheckIn = latestByClient(checkIns, 'created_at')
  const latestWorkout = latestByClient(workoutLogs, 'logged_at')

  // P6: métricas reforzadas client-side (antes solo llegaban por el endpoint) ───
  const checkInsByClient = new Map<string, CheckInRow[]>()
  for (const ci of checkIns) {
    const arr = checkInsByClient.get(ci.client_id) ?? []
    arr.push(ci)
    checkInsByClient.set(ci.client_id, arr)
  }
  function weightStatsFor(clientId: string): { current: number | null; delta7d: number | null; history: { date: string; value: number }[] } {
    const rows = (checkInsByClient.get(clientId) ?? [])
      .filter((c) => c.weight != null)
      .map((c) => ({ date: (c.date ?? c.created_at).slice(0, 10), value: Number(c.weight), ts: new Date(c.date ?? c.created_at).getTime() }))
      .sort((a, b) => a.ts - b.ts)
    if (!rows.length) return { current: null, delta7d: null, history: [] }
    const current = rows[rows.length - 1].value
    const sevenAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const prior = [...rows].reverse().find((r) => r.ts <= sevenAgo) ?? rows[0]
    const delta7d = Math.round((current - prior.value) * 10) / 10
    return { current, delta7d, history: rows.map((r) => ({ date: r.date, value: r.value })) }
  }
  function latestEnergyFor(clientId: string): number | null {
    const rows = (checkInsByClient.get(clientId) ?? []).filter((c) => c.energy_level != null)
    if (!rows.length) return null
    rows.sort((a, b) => new Date(b.date ?? b.created_at).getTime() - new Date(a.date ?? a.created_at).getTime())
    return Number(rows[0].energy_level)
  }
  // Streak de entrenos: días consecutivos (terminando hoy o ayer) con ≥1 log.
  const workoutDaysByClient = new Map<string, Set<string>>()
  for (const w of workoutLogs) {
    const set = workoutDaysByClient.get(w.client_id) ?? new Set<string>()
    set.add(w.logged_at.slice(0, 10))
    workoutDaysByClient.set(w.client_id, set)
  }
  function streakFor(clientId: string): number {
    const days = workoutDaysByClient.get(clientId)
    if (!days || days.size === 0) return 0
    let streak = 0
    const cursor = new Date(today)
    if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
    while (days.has(cursor.toISOString().slice(0, 10))) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }
  // Nutrición 7d: % de días (de 7) con ≥1 comida completada (directo de Supabase, RLS coach-scoped).
  const nutritionPctByClient = new Map<string, number>()
  try {
    const sevenAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: nutriRows } = await supabase
      .from('daily_nutrition_logs')
      .select('client_id, log_date, nutrition_meal_logs(is_completed)')
      .gte('log_date', sevenAgoDate)
    const daysByClient = new Map<string, Set<string>>()
    for (const row of (nutriRows ?? []) as Array<{ client_id: string; log_date: string; nutrition_meal_logs: { is_completed: boolean | null }[] | null }>) {
      if (!clientIds.has(row.client_id)) continue
      const meals = row.nutrition_meal_logs ?? []
      if (meals.some((m) => m.is_completed)) {
        const set = daysByClient.get(row.client_id) ?? new Set<string>()
        set.add(row.log_date)
        daysByClient.set(row.client_id, set)
      }
    }
    for (const [cid, set] of daysByClient) {
      nutritionPctByClient.set(cid, Math.round((set.size / 7) * 100))
    }
  } catch {
    // tabla/columna ausente → queda 0 (ya no hay banner)
  }

  const riskItems: MobileRiskAlertItem[] = []
  for (const client of clients) {
    const checkIn = latestCheckIn.get(client.id)
    const workout = latestWorkout.get(client.id)
    const noCheckIn30d = !checkIn
    const noWorkout7d = !workout || new Date(workout.logged_at).getTime() < new Date(sevenDaysAgoIso).getTime()

    if (noCheckIn30d) {
      riskItems.push({
        clientId: client.id,
        clientName: client.full_name,
        attentionScore: noWorkout7d ? 95 : 85,
        label: 'Adherencia critica - sin check-in en 1 mes',
        flags: noWorkout7d ? ['SIN_CHECKIN_1M', 'SIN_EJERCICIO_7D'] : ['SIN_CHECKIN_1M'],
      })
    } else if (noWorkout7d) {
      riskItems.push({
        clientId: client.id,
        clientName: client.full_name,
        attentionScore: 75,
        label: 'Adherencia critica - sin ejercicio en 7 dias',
        flags: ['SIN_EJERCICIO_7D'],
      })
    }
  }

  const topRiskClients = riskItems.sort((a, b) => b.attentionScore - a.attentionScore).slice(0, 5)

  const expiringPrograms = ((expiringProgramsResult.data ?? []) as Array<{
    id: string
    name: string
    end_date: string
    client_id: string | null
  }>)
    .map((program) => {
      const endDateParts = program.end_date.split('-')
      const endDate = new Date(
        Number.parseInt(endDateParts[0], 10),
        Number.parseInt(endDateParts[1], 10) - 1,
        Number.parseInt(endDateParts[2], 10)
      )
      const daysLeft = Math.round((endDate.getTime() - today.getTime()) / 86400000)
      const client = program.client_id ? clientMap.get(program.client_id) : null
      return {
        id: program.id,
        name: program.name,
        clientId: program.client_id ?? '',
        clientName: client?.full_name ?? 'Sin alumno',
        daysLeft,
      }
    })
    .filter((program) => program.clientId && program.daysLeft <= 3)
    .slice(0, 8)

  const agenda: MobileAgendaItem[] = [
    ...expiringPrograms.map((program) => ({
      id: `expire-${program.id}`,
      clientId: program.clientId,
      clientName: program.clientName,
      kind: 'programa_vence' as const,
      label: program.daysLeft <= 0 ? `${program.name} vencio` : `${program.name} vence en ${program.daysLeft}d`,
    })),
    ...topRiskClients.map((client) => ({
      id: `risk-${client.clientId}`,
      clientId: client.clientId,
      clientName: client.clientName,
      kind: client.label.includes('check-in') ? 'checkin_pendiente' as const : 'sin_ejercicio' as const,
      label: client.label,
    })),
  ].slice(0, 8)

  const revenueByMonth: Record<string, number> = {}
  for (const payment of payments) {
    if (!isPaidStatus(payment.status)) continue
    const slices = allocatePaymentToMonthKeys(payment.payment_date, payment.amount, payment.period_months)
    for (const [key, value] of Object.entries(slices)) {
      revenueByMonth[key] = (revenueByMonth[key] ?? 0) + value
    }
  }

  const currentMonthKey = monthKeyFromYm(now.getFullYear(), now.getMonth())
  const prevMonthRef = addWholeMonths(now.getFullYear(), now.getMonth(), -1)
  const prevMonthKey = monthKeyFromYm(prevMonthRef.y, prevMonthRef.month0)
  const mrrCurrentMonth = revenueByMonth[currentMonthKey] ?? 0
  const mrrPreviousMonth = revenueByMonth[prevMonthKey] ?? 0
  const mrrDeltaPct =
    mrrPreviousMonth > 0
      ? Math.round(((mrrCurrentMonth - mrrPreviousMonth) / mrrPreviousMonth) * 100)
      : mrrCurrentMonth > 0
        ? 100
        : 0

  const clientsWithWorkout30d = new Set(workoutLogs.map((row) => row.client_id)).size
  const avgAdherence = clients.length > 0 ? Math.round((clientsWithWorkout30d / clients.length) * 100) : 0

  const clientStats: MobileClientStats[] = clients.map((client) => {
    const latestWorkoutRow = latestWorkout.get(client.id)
    const latestCheckInRow = latestCheckIn.get(client.id)
    const hasWorkout30d = Boolean(latestWorkoutRow)
    const hasCheckIn30d = Boolean(latestCheckInRow)
    const hasWorkout7d = latestWorkoutRow
      ? new Date(latestWorkoutRow.logged_at).getTime() >= new Date(sevenDaysAgoIso).getTime()
      : false
    const adherencePct = hasWorkout7d ? 100 : hasWorkout30d ? 65 : hasCheckIn30d ? 45 : 0
    const weight = weightStatsFor(client.id)
    const nutritionPct = nutritionPctByClient.get(client.id) ?? 0

    return {
      clientId: client.id,
      clientName: client.full_name,
      hasAdherenceData: true,
      hasNutritionData: nutritionPctByClient.has(client.id),
      adherencePct,
      nutritionPct,
      adherenceHint: latestWorkoutRow ? `Ultimo entreno: ${latestWorkoutRow.logged_at.slice(0, 10)}` : 'Sin entrenos en 30 dias',
      nutritionHint: nutritionPct > 0 ? `${nutritionPct}% de adherencia (7d)` : 'Sin datos de nutricion',
      adherenceHistory4w: [],
      weightHistory30d: weight.history,
      currentWeight: weight.current,
      weightDelta7d: weight.delta7d,
      oneRMDelta: null,
      streak: streakFor(client.id),
      latestEnergyLevel: latestEnergyFor(client.id),
      planDaysRemaining: null,
      planCurrentWeek: null,
      planTotalWeeks: null,
      attentionScore: 0,
    }
  })

  const clientsWithNutrition = clientStats.filter((s) => s.nutritionPct > 0)
  const avgNutrition = clientsWithNutrition.length > 0
    ? Math.round(clientsWithNutrition.reduce((sum, s) => sum + s.nutritionPct, 0) / clientsWithNutrition.length)
    : 0

  const activities: MobileActivityItem[] = []
  clients.slice(0, 5).forEach((client) => {
    activities.push({
      id: `client-${client.id}`,
      type: 'nuevo alumno',
      title: `${client.full_name} se ha unido`,
      subtitle: client.onboarding_completed ? 'Onboarding completado' : 'Pendiente de onboarding',
      date: client.created_at,
      clientId: client.id,
      photoUrl: null,
    })
  })
  checkIns.slice(0, 5).forEach((checkIn) => {
    const client = clientMap.get(checkIn.client_id)
    if (!client) return
    activities.push({
      id: `checkin-${checkIn.id}`,
      type: 'check-in',
      title: `${client.full_name} subio su Check-in`,
      subtitle: 'Revisa su progreso semanal',
      date: checkIn.created_at,
      clientId: client.id,
      photoUrl: null,
      reviewed: Boolean(checkIn.reviewed_at),
    })
  })

  const seenWorkoutSessions = new Set<string>()
  workoutLogs.forEach((workout) => {
    const day = workout.logged_at.slice(0, 10)
    const sessionKey = `${workout.client_id}|${day}`
    if (seenWorkoutSessions.has(sessionKey)) return
    seenWorkoutSessions.add(sessionKey)
    const client = clientMap.get(workout.client_id)
    if (!client) return
    activities.push({
      id: `workout-${workout.client_id}-${day}`,
      type: 'workout',
      title: `${client.full_name} completo una sesion`,
      subtitle: 'Workout registrado',
      date: workout.logged_at,
      clientId: client.id,
      photoUrl: null,
    })
  })

  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // El conteo del gate NO se deriva de `clients`: esa lectura filtra `is_active = true` y el gate
  // no lo hace. Consulta aparte con el predicado del server; si falla, degrada al KPI.
  const capClients = await countCapClients(coach.id, workspace)

  return {
    // Mismo normalizador que el camino feliz: `getCoachProfile()` no lee `logo_url_dark`, así que
    // el logo oscuro solo puede venir de la caché de marca.
    coach: parseMobileDashboardCoach(coach, await loadStoredBranding()),
    publicCode: coach.inviteCode ? { inviteCode: coach.inviteCode, shouldConfirm: false } : null,
    onboardingGuide: {},
    // Camino degradado (endpoint caído): la guía no inventa progreso. Sin señales del server, la
    // pantalla muestra los 5 pasos pendientes en vez de tildar cosas que no puede comprobar.
    onboardingV2: parseMobileOnboardingV2(null),
    activePlans: activePlanCount,
    hasStudentSignal30d: checkIns.length > 0 || workoutLogs.length > 0,
    clientList: clients.map((client) => ({ id: client.id, name: client.full_name })),
    clientPaymentSummary: buildClientPaymentSummary(payments, clients),
    clientStats,
    areaData: buildAreaData(workoutLogs),
    barData: buildBarData(clients),
    kpi: {
      mrrCurrentMonth,
      mrrPreviousMonth,
      mrrDeltaPct,
      totalClients: clients.length,
      riskCount: topRiskClients.length,
      avgAdherence,
      avgNutrition,
    },
    capClients: capClients ?? clients.length,
    topRiskClients,
    agenda,
    expiringPrograms,
    recentActivities: activities.slice(0, 8),
    // "Por revisar": check-ins recientes (coach-scoped) sin reviewed_at — misma semantica que el endpoint V2.
    pendingCheckinsCount: checkIns.filter((c) => !c.reviewed_at).length,
    degraded: false,
  }
}

export async function getCoachDashboardDataMobile(): Promise<MobileDashboardData | null> {
  // D-F1: reintentar el endpoint una vez antes de degradar al cálculo local.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const workspace = await getActiveCoachWorkspace()
      const params = new URLSearchParams()
      if (workspace) {
        params.set('workspaceKind', workspace.kind)
        if (workspace.teamId) params.set('teamId', workspace.teamId)
        if (workspace.orgId) params.set('orgId', workspace.orgId)
      }
      const path = params.toString() ? `/api/mobile/coach/dashboard?${params.toString()}` : '/api/mobile/coach/dashboard'
      const payload = await apiFetch<MobileDashboardApiResponse>(path, {
        method: 'GET',
        authenticated: true,
      })
      // Caché local (AsyncStorage, cero red): respaldo del logo si el endpoint todavía no lo sirve.
      const mapped = mapApiDashboard(payload, await loadStoredBranding())
      // El endpoint sirve el KPI de alumnos ACTIVOS; el cupo se cuenta con el predicado del gate.
      // `countCapClients` no lanza, así que un conteo caído jamás dispara el reintento del bloque.
      const capClients = await countCapClients(mapped.coach.id, workspace ?? null)
      return capClients == null ? mapped : { ...mapped, capClients }
    } catch {
      // sigue al siguiente intento; si se agotan, cae al fallback degradado
    }
  }
  return getCoachDashboardDataMobileLocal()
}
