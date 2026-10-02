import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    chunked,
    COACH_ID_CHUNK,
    fetchAllPages,
    loadCohort,
    makeSelfInviteDetector,
    PAGE_SIZE,
    previousIsoWeekWindow,
    type CohortCoach,
} from './north-star-weekly.service'

/**
 * Embudo del coach nuevo por superficie de alta — B4 del plan «Activación»
 * (`docs/specs/coach-onboarding-v2/TASKS.md`). Viaja en el mismo correo del lunes que la North Star.
 *
 * Etapas, contadas desde las TABLAS y no desde los eventos de la guía (el evento «aha» cuenta de
 * menos: el 01-10 marcaba 3 donde había 7):
 *   registro  → la fila de `coaches` (misma cohorte que la North Star: sin org y sin cuentas de prueba);
 *   demo      → entró a «Vive tu app» (`coach_onboarding_events.vive_tu_app_entered`);
 *   sumó      → tiene al menos un alumno real (predicado de SPEC §2.1, sin autoinvitados);
 *   entró     → ese alumno inició sesión alguna vez (`clients.first_login_at`);
 *   la usa    → ese alumno registró algo (`workout_logs` o `nutrition_intake_entries`).
 * Todas las etapas se leen contra el corte (`now`), igual que la North Star.
 *
 * Superficie: `coaches.signup_surface`. Las altas anteriores al 02-10 la tienen reconstruida
 * (sesión de auth + PostHog) y las que no tenían evidencia quedan en «Sin dato».
 *
 * PII: la salida son solo conteos.
 */

type Admin = SupabaseClient<Database>

const DAY_MS = 24 * 60 * 60 * 1000

/** Filas fijas del cuadro, en orden. `app_unknown` y «sin dato» solo se imprimen si tienen altas. */
export const SURFACE_ROWS = [
    { key: 'web_desktop', label: 'Web escritorio', alwaysShow: true },
    { key: 'web_mobile', label: 'Teléfono (navegador / PWA)', alwaysShow: true },
    { key: 'app_ios', label: 'App iPhone', alwaysShow: true },
    { key: 'app_android', label: 'App Android', alwaysShow: true },
    { key: 'app_unknown', label: 'App (sistema sin identificar)', alwaysShow: false },
    { key: 'sin_dato', label: 'Sin dato', alwaysShow: false },
] as const

export type SurfaceRowKey = (typeof SURFACE_ROWS)[number]['key']

export type FunnelCounts = {
    registros: number
    demo: number
    sumo: number
    entro: number
    usa: number
}

export type SurfaceFunnel = {
    desde: string
    hasta: string
    rows: Array<{ key: SurfaceRowKey; label: string; counts: FunnelCounts }>
    total: FunnelCounts
}

export type SurfaceFunnelReport = {
    corte: string
    semana: SurfaceFunnel
    cuatroSemanas: SurfaceFunnel
}

type CoachStages = { demo: boolean; sumo: boolean; entro: boolean; usa: boolean }

const emptyCounts = (): FunnelCounts => ({ registros: 0, demo: 0, sumo: 0, entro: 0, usa: 0 })

export function surfaceRowKey(signupSurface: string | null): SurfaceRowKey {
    const known = SURFACE_ROWS.find((r) => r.key === signupSurface && r.key !== 'sin_dato')
    return known ? known.key : 'sin_dato'
}

type IdRow = { id: string }

async function loadDemoCoachIds(admin: Admin, coachIds: string[], corte: Date): Promise<Set<string>> {
    const out = new Set<string>()
    for (const chunk of chunked(coachIds, COACH_ID_CHUNK)) {
        const rows = await fetchAllPages<IdRow & { coach_id: string }>(
            (from, to) =>
                admin
                    .from('coach_onboarding_events')
                    .select('id, coach_id')
                    .in('coach_id', chunk)
                    .eq('event_type', 'vive_tu_app_entered')
                    .lte('created_at', corte.toISOString())
                    .order('id', { ascending: true })
                    .range(from, to),
            PAGE_SIZE
        )
        for (const r of rows) out.add(r.coach_id)
    }
    return out
}

type FunnelClientRow = {
    id: string
    coach_id: string | null
    email: string | null
    first_login_at: string | null
}

/** Alumnos reales de la cohorte: predicado canónico de SPEC §2.1 y sin autoinvitados. */
async function loadRealClients(
    admin: Admin,
    cohort: CohortCoach[],
    corte: Date
): Promise<FunnelClientRow[]> {
    const isSelfInvite = makeSelfInviteDetector(cohort)
    const out: FunnelClientRow[] = []
    for (const chunk of chunked(cohort.map((c) => c.id), COACH_ID_CHUNK)) {
        const rows = await fetchAllPages<FunnelClientRow>(
            (from, to) =>
                admin
                    .from('clients')
                    .select('id, coach_id, email, first_login_at')
                    .in('coach_id', chunk)
                    .not('is_demo', 'is', true)
                    .eq('is_archived', false)
                    .is('org_id', null)
                    .is('team_id', null)
                    .lte('created_at', corte.toISOString())
                    .order('id', { ascending: true })
                    .range(from, to),
            PAGE_SIZE
        )
        for (const r of rows) {
            if (!r.coach_id || isSelfInvite(r.coach_id, r.email)) continue
            out.push(r)
        }
    }
    return out
}

/** Ids de alumno con al menos un registro en `table` hasta el corte. */
async function loadClientsWithActivity(
    admin: Admin,
    table: 'workout_logs' | 'nutrition_intake_entries',
    clientIds: string[]
): Promise<Set<string>> {
    const out = new Set<string>()
    for (const chunk of chunked(clientIds, COACH_ID_CHUNK)) {
        const rows = await fetchAllPages<IdRow & { client_id: string }>(
            (from, to) =>
                admin
                    .from(table)
                    .select('id, client_id')
                    .in('client_id', chunk)
                    .order('id', { ascending: true })
                    .range(from, to),
            PAGE_SIZE
        )
        for (const r of rows) out.add(r.client_id)
    }
    return out
}

async function loadStages(
    admin: Admin,
    cohort: CohortCoach[],
    corte: Date
): Promise<Map<string, CoachStages>> {
    const stages = new Map<string, CoachStages>(
        cohort.map((c) => [c.id, { demo: false, sumo: false, entro: false, usa: false }] as const)
    )
    if (cohort.length === 0) return stages

    const demo = await loadDemoCoachIds(admin, cohort.map((c) => c.id), corte)
    for (const id of demo) {
        const s = stages.get(id)
        if (s) s.demo = true
    }

    const clients = await loadRealClients(admin, cohort, corte)
    const clientIds = clients.map((c) => c.id)
    // La actividad no se corta por fecha: el corte es «ahora» y el cron corre una vez por semana.
    const withWorkouts = await loadClientsWithActivity(admin, 'workout_logs', clientIds)
    const withNutrition = await loadClientsWithActivity(admin, 'nutrition_intake_entries', clientIds)

    const corteMs = corte.getTime()
    for (const client of clients) {
        const s = client.coach_id ? stages.get(client.coach_id) : undefined
        if (!s) continue
        s.sumo = true
        if (client.first_login_at !== null && new Date(client.first_login_at).getTime() <= corteMs) {
            s.entro = true
        }
        if (withWorkouts.has(client.id) || withNutrition.has(client.id)) s.usa = true
    }
    return stages
}

export function tabulateSurfaceFunnel(
    cohort: ReadonlyArray<Pick<CohortCoach, 'id' | 'signup_surface'>>,
    stages: ReadonlyMap<string, CoachStages>,
    window: { desde: Date; hasta: Date }
): SurfaceFunnel {
    const byKey = new Map<SurfaceRowKey, FunnelCounts>(SURFACE_ROWS.map((r) => [r.key, emptyCounts()]))
    const total = emptyCounts()
    for (const coach of cohort) {
        const counts = byKey.get(surfaceRowKey(coach.signup_surface))!
        const s = stages.get(coach.id)
        for (const target of [counts, total]) {
            target.registros++
            if (s?.demo) target.demo++
            if (s?.sumo) target.sumo++
            if (s?.entro) target.entro++
            if (s?.usa) target.usa++
        }
    }
    return {
        desde: window.desde.toISOString(),
        hasta: window.hasta.toISOString(),
        rows: SURFACE_ROWS.filter((r) => r.alwaysShow || byKey.get(r.key)!.registros > 0).map((r) => ({
            key: r.key,
            label: r.label,
            counts: byKey.get(r.key)!,
        })),
        total,
    }
}

/**
 * Dos cuadros: la semana ISO recién cerrada (la misma cohorte de la North Star) y las últimas
 * cuatro semanas cerradas, porque con ~15 altas por semana repartidas en cuatro superficies una
 * sola semana casi nunca alcanza para comparar.
 */
export async function computeSurfaceFunnelReport(
    admin: Admin,
    opts: { now: Date }
): Promise<SurfaceFunnelReport> {
    const { desde: weekStart, hasta, corte } = previousIsoWeekWindow(opts.now)
    const fourWeeksStart = new Date(hasta.getTime() - 28 * DAY_MS)

    const cohort = await loadCohort(admin, fourWeeksStart, hasta)
    const stages = await loadStages(admin, cohort, corte)
    const weekStartIso = weekStart.toISOString()
    const weekCohort = cohort.filter((c) => new Date(c.created_at).toISOString() >= weekStartIso)

    return {
        corte: corte.toISOString(),
        semana: tabulateSurfaceFunnel(weekCohort, stages, { desde: weekStart, hasta }),
        cuatroSemanas: tabulateSurfaceFunnel(cohort, stages, { desde: fourWeeksStart, hasta }),
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** «n (p %)» sobre los registros de la misma fila; solo «n» cuando no hay registros. */
function cell(n: number, base: number): string {
    if (base <= 0) return String(n)
    const pct = Math.round((100 * n) / base)
    return `${n} <span style="color:#71717a">(${pct} %)</span>`
}

function funnelTable(title: string, funnel: SurfaceFunnel): string {
    const th = 'style="text-align:left;padding:6px 8px;border-bottom:2px solid #d4d4d8;font-size:12px"'
    const td = 'style="padding:6px 8px;border-bottom:1px solid #e4e4e7;font-size:13px"'
    const tdTotal = 'style="padding:6px 8px;border-top:2px solid #d4d4d8;font-size:13px;font-weight:700"'
    const row = (label: string, c: FunnelCounts, style: string) => `<tr>
        <td ${style}>${escapeHtml(label)}</td>
        <td ${style}>${c.registros}</td>
        <td ${style}>${cell(c.demo, c.registros)}</td>
        <td ${style}>${cell(c.sumo, c.registros)}</td>
        <td ${style}>${cell(c.entro, c.registros)}</td>
        <td ${style}>${cell(c.usa, c.registros)}</td>
      </tr>`
    return `
    <p style="margin:14px 0 6px;font-size:13px;color:#3f3f46"><strong>${escapeHtml(title)}</strong>
      · altas del ${funnel.desde.slice(0, 10)} al ${funnel.hasta.slice(0, 10)} (UTC)</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:640px">
      <tr><th ${th}>Superficie</th><th ${th}>Registros</th><th ${th}>Demo</th><th ${th}>Sumó alumno</th><th ${th}>Alumno entró</th><th ${th}>Lo usa</th></tr>
      ${funnel.rows.map((r) => row(r.label, r.counts, td)).join('')}
      ${row('Total', funnel.total, tdTotal)}
    </table>`
}

/** Sección HTML para el correo del lunes. `null` = el cálculo falló: se avisa en vez de omitirlo. */
export function buildSurfaceFunnelSection(report: SurfaceFunnelReport | null): string {
    const heading =
        '<h3 style="margin:22px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#52525b">Embudo por superficie</h3>'
    if (!report) {
        return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  ${heading}
  <p style="margin:0;font-size:13px;color:#b91c1c">No se pudo calcular esta semana; el resto del reporte sí.</p>
</div>`
    }
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  ${heading}
  ${funnelTable('Semana cerrada', report.semana)}
  ${funnelTable('Últimas 4 semanas', report.cuatroSemanas)}
  <p style="margin:12px 0 0;color:#71717a;font-size:11px;max-width:640px">
    Porcentajes sobre los registros de cada fila. Demo = entró a «Vive tu app»; sumó alumno = al menos
    un alumno real (sin autoinvitados); entró = ese alumno inició sesión; lo usa = registró un
    entrenamiento o una comida. Las altas anteriores al 02-10-2026 tienen la superficie reconstruida
    (sesión de inicio + PostHog); «Sin dato» = sin evidencia.
  </p>
</div>`
}
