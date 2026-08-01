#!/usr/bin/env tsx
/**
 * Gate de corte Nutrition V1 -> V2 para standalone y Team.
 *
 * Default: solo lectura + reporte JSON/MD.
 * --strict: termina con código 1 ante cualquier blocker.
 * --deactivate-verified-v1: operación remota explícita. Requiere --strict, cero blockers
 * y NUTRITION_V2_CUTOVER_CONFIRM='yes'. Solo desactiva planes V1 ya verificados; nunca
 * borra filas V1, logs, alimentos ni identidades.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateNutritionV2Cutover,
  type CutoverConversionLink,
  type CutoverV1Plan,
  type CutoverV2Plan,
  type CutoverV2Version,
  type CutoverWorkspace,
} from './cutover-preflight.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../../apps/web/.env.local') })
config({ path: resolve(__dirname, '../../.env.local'), override: false })

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  return value && !value.startsWith('--') ? value : undefined
}

const STRICT = process.argv.includes('--strict')
const DEACTIVATE_VERIFIED = process.argv.includes('--deactivate-verified-v1')
const OUT_DIR = flagValue('--out') ?? resolve(__dirname, '../../tmp/nutrition-v2-cutover')

type RawClient = {
  id: string
  team_id: string | null
  org_id: string | null
  is_archived: boolean | null
  is_active: boolean | null
}

type RawV1Plan = {
  id: string
  client_id: string
  coach_id: string
  updated_at: string
  client: RawClient | RawClient[] | null
}

type RawLink = {
  v1_plan_id: string
  v2_plan_id: string
  v2_version_id: string
  client_id: string
  coach_id: string
  last_synced_v1_updated_at: string
}

type RawV2Plan = {
  id: string
  client_id: string
  coach_id: string
  lifecycle_status: string
  current_published_version_id: string | null
}

type RawV2Version = { id: string; plan_id: string; status: string }

function oneClient(value: RawV1Plan['client']): RawClient | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function workspaceOf(client: RawClient | null): CutoverWorkspace {
  if (!client) return 'unknown'
  if (client.is_archived === true) return 'archived'
  if (client.org_id) return 'enterprise'
  return client.team_id ? 'team' : 'standalone'
}

function toV1Plan(row: RawV1Plan): CutoverV1Plan {
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    updatedAt: row.updated_at,
    workspace: workspaceOf(oneClient(row.client)),
  }
}

function toLink(row: RawLink): CutoverConversionLink {
  return {
    v1PlanId: row.v1_plan_id,
    v2PlanId: row.v2_plan_id,
    v2VersionId: row.v2_version_id,
    clientId: row.client_id,
    coachId: row.coach_id,
    lastSyncedV1UpdatedAt: row.last_synced_v1_updated_at,
  }
}

function toV2Plan(row: RawV2Plan): CutoverV2Plan {
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    lifecycleStatus: row.lifecycle_status,
    currentPublishedVersionId: row.current_published_version_id,
  }
}

function toV2Version(row: RawV2Version): CutoverV2Version {
  return { id: row.id, planId: row.plan_id, status: row.status }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function reportMarkdown(input: {
  generatedAt: string
  strict: boolean
  deactivationRequested: boolean
  report: ReturnType<typeof evaluateNutritionV2Cutover>
}): string {
  const lines = [
    '# Preflight de corte Nutrition V1 → V2',
    '',
    `- Generado: ${input.generatedAt}`,
    `- Modo estricto: ${input.strict ? 'sí' : 'no'}`,
    `- Desactivación solicitada: ${input.deactivationRequested ? 'sí' : 'no'}`,
    `- Planes V1 verificados para desactivar: ${input.report.verifiedPlanIds.length}`,
    `- Blockers: ${input.report.blockerCount}`,
    `- Fuera de alcance (Enterprise): ${input.report.outOfScopeCount}`,
    '',
    '| Plan V1 | Workspace | Estado | Motivo | Detalle |',
    '| --- | --- | --- | --- | --- |',
  ]

  for (const assessment of input.report.assessments) {
    lines.push(
      `| ${assessment.v1PlanId} | ${assessment.workspace} | ${assessment.status} | ${assessment.blocker ?? '—'} | ${assessment.detail ?? '—'} |`,
    )
  }
  lines.push('')
  lines.push('Solo los estados `verified` de standalone/Team pueden ser desactivados por esta herramienta.')
  return lines.join('\n')
}

async function loadPreflightData(db: SupabaseClient) {
  const [v1Result, linksResult, v2PlansResult, v2VersionsResult] = await Promise.all([
    db
      .from('nutrition_plans')
      .select('id, client_id, coach_id, updated_at, client:clients(id, team_id, org_id, is_archived, is_active)')
      .eq('is_active', true),
    db
      .from('nutrition_v2_conversion_links')
      .select('v1_plan_id, v2_plan_id, v2_version_id, client_id, coach_id, last_synced_v1_updated_at'),
    db
      .from('nutrition_plans_v2')
      .select('id, client_id, coach_id, lifecycle_status, current_published_version_id'),
    db.from('nutrition_plan_versions_v2').select('id, plan_id, status'),
  ])

  for (const [name, result] of [
    ['nutrition_plans', v1Result],
    ['nutrition_v2_conversion_links', linksResult],
    ['nutrition_plans_v2', v2PlansResult],
    ['nutrition_plan_versions_v2', v2VersionsResult],
  ] as const) {
    if (result.error) throw new Error(`${name}: ${result.error.message}`)
  }

  return {
    activeV1Plans: ((v1Result.data ?? []) as unknown as RawV1Plan[]).map(toV1Plan),
    links: ((linksResult.data ?? []) as unknown as RawLink[]).map(toLink),
    v2Plans: ((v2PlansResult.data ?? []) as unknown as RawV2Plan[]).map(toV2Plan),
    v2Versions: ((v2VersionsResult.data ?? []) as unknown as RawV2Version[]).map(toV2Version),
  }
}

async function deactivateVerifiedV1Plans(db: SupabaseClient, planIds: readonly string[]): Promise<void> {
  const chunkSize = 100
  for (let index = 0; index < planIds.length; index += chunkSize) {
    const ids = planIds.slice(index, index + chunkSize)
    const { error } = await db
      .from('nutrition_plans')
      .update({ is_active: false })
      .in('id', ids)
      .eq('is_active', true)
    if (error) throw new Error(`deactivate nutrition_plans: ${error.message}`)
  }
}

async function main(): Promise<void> {
  if (DEACTIVATE_VERIFIED && !STRICT) {
    throw new Error('--deactivate-verified-v1 exige --strict para que el preflight sea bloqueante.')
  }
  if (DEACTIVATE_VERIFIED && process.env.NUTRITION_V2_CUTOVER_CONFIRM !== 'yes') {
    throw new Error("--deactivate-verified-v1 requiere NUTRITION_V2_CUTOVER_CONFIRM='yes'.")
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  }

  const db = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
  const report = evaluateNutritionV2Cutover(await loadPreflightData(db))
  const generatedAt = new Date().toISOString()
  const base = `nutrition-v2-cutover-preflight-${stamp()}`
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(
    resolve(OUT_DIR, `${base}.json`),
    JSON.stringify({ generatedAt, strict: STRICT, deactivationRequested: DEACTIVATE_VERIFIED, ...report }, null, 2),
  )
  writeFileSync(
    resolve(OUT_DIR, `${base}.md`),
    reportMarkdown({ generatedAt, strict: STRICT, deactivationRequested: DEACTIVATE_VERIFIED, report }),
  )

  console.log(
    `Preflight: verified=${report.verifiedPlanIds.length} blockers=${report.blockerCount} enterprise=${report.outOfScopeCount}`,
  )
  console.log(`Reporte: ${resolve(OUT_DIR, `${base}.{json,md}`)}`)

  if (report.blockerCount > 0) {
    const message = 'Preflight con bloqueos: corrige o reconcilia cada caso antes de desactivar V1.'
    if (STRICT) console.error(message)
    else console.warn(`${message} Este modo solo generó el reporte; no se modificó V1.`)
    if (STRICT) process.exitCode = 1
    return
  }

  if (DEACTIVATE_VERIFIED && report.verifiedPlanIds.length > 0) {
    await deactivateVerifiedV1Plans(db, report.verifiedPlanIds)
    console.log(`Desactivados ${report.verifiedPlanIds.length} planes V1 verificados de standalone/Team.`)
  }
}

main().catch((error) => {
  console.error('Falló el preflight de corte:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
