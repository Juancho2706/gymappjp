'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTierCapabilities, getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import { getCoachOrgContext } from '@/lib/coach-context'
import { resolveCoachScope } from '@/services/auth/coach-scope.service'
import { createClientInternal } from '../../_lib/create-client-internal'
import { sanitizeCell } from '@/lib/import/csv-injection'

const importRowSchema = z.object({
    full_name: z.string().min(2, 'Nombre muy corto').max(100),
    email: z.string().email('Email inválido'),
    phone: z.string().optional().nullable(),
    subscription_start_date: z.string().optional().nullable(),
})

export type ImportRow = {
    full_name: string
    email: string
    phone?: string | null
    subscription_start_date?: string | null
}

export type ImportRowError = {
    row: number
    email: string
    full_name: string
    error: string
}

export type ImportClientsState = {
    error?: string
    success?: boolean
    importId?: string
    summary?: {
        total: number
        succeeded: number
        failed: number
        skipped: number
    }
    rowErrors?: ImportRowError[]
}

function normalizeImportDate(raw: string | null | undefined): string | null {
    if (!raw) return null
    const s = raw.trim()
    if (!s) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, '0')}-${dmyDash[1].padStart(2, '0')}`
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    }
    return null
}

function generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function importClientsAction(
    rows: ImportRow[],
    filename: string,
    consentConfirmed: boolean
): Promise<ImportClientsState> {
    if (!consentConfirmed) {
        return { error: 'Debes confirmar el consentimiento de protección de datos (Ley 19.628) para continuar.' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const ctx = await getCoachOrgContext()

    // Enterprise coach (role='coach') has no import access
    if (ctx?.isOrgUser && !ctx.isOrgAdmin) {
        return { error: 'Tu rol no permite importar alumnos.' }
    }

    const orgId = ctx?.isOrgAdmin ? ctx.orgId : null

    // A.bis2: el import respeta el workspace ACTIVO — en contexto team las filas entran al POOL
    // (team_id), no a la cartera personal del coach.
    let activeTeamId: string | null = null
    let team: { slug: string; name: string } | null = null
    if (!orgId) {
        const scope = await resolveCoachScope(supabase, user.id)
        if (scope.ok && scope.activeTeamId) {
            activeTeamId = scope.activeTeamId
            const { data: teamRow } = await supabase
                .from('teams')
                .select('slug, name')
                .eq('id', activeTeamId)
                .maybeSingle()
            team = teamRow
        }
    }

    const { data: rawCoach } = await supabase
        .from('coaches')
        .select('id, slug, full_name, brand_name, welcome_message, subscription_tier, max_clients')
        .eq('id', user.id)
        .maybeSingle()

    if (!rawCoach) return { error: 'Coach no encontrado.' }

    const tier = (rawCoach.subscription_tier ?? 'free') as SubscriptionTier
    const caps = getTierCapabilities(tier)
    if (!orgId && !activeTeamId && !caps.canImportClients) return { error: 'upgrade_required' }

    if (!rows.length) return { error: 'No hay filas para importar.' }
    if (rows.length > 1000) return { error: 'El archivo supera el límite de 1.000 filas. Dividilo en partes.' }

    // Client cap check (org/team have no per-coach cap; standalone uses tier max)
    if (!orgId && !activeTeamId) {
        const maxClients = rawCoach.max_clients ?? getTierMaxClients(tier)
        const { count: activeCount } = await supabase
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', rawCoach.id)
            .eq('is_archived', false)

        if ((activeCount ?? 0) + rows.length > maxClients) {
            return {
                error: `Tu plan permite ${maxClients} alumnos activos. Tenés ${activeCount ?? 0} y querés importar ${rows.length}. Actualizá tu plan o reducí la cantidad de filas.`,
            }
        }
    }

    // Create import audit record
    const importInsert = orgId
        ? { org_id: orgId, coach_id: null, filename, total_rows: rows.length, status: 'processing' as const, consent_confirmed_at: new Date().toISOString() }
        : { coach_id: rawCoach.id, org_id: null, filename, total_rows: rows.length, status: 'processing' as const, consent_confirmed_at: new Date().toISOString() }

    const { data: importRecord, error: importInsertError } = await supabase
        .from('client_imports')
        .insert(importInsert)
        .select('id')
        .single()

    if (importInsertError || !importRecord) {
        console.error('client_imports insert error:', importInsertError)
        return { error: 'Error al registrar el import.' }
    }

    // Fetch existing emails to detect duplicates
    const emailsToCheck = rows.map((r) => r.email.toLowerCase().trim())
    const existingQuery = supabase
        .from('clients')
        .select('email')
        .in('email', emailsToCheck)
    if (orgId) existingQuery.eq('org_id', orgId)
    else if (activeTeamId) existingQuery.eq('team_id', activeTeamId)
    else existingQuery.eq('coach_id', rawCoach.id)
    const { data: existingClients } = await existingQuery

    const existingEmails = new Set((existingClients ?? []).map((c) => c.email.toLowerCase()))

    // R3 (auditoria 2026-06-11): los INSERT por fila pasan RLS del usuario (org admin manage /
    // team pool / standalone propio) con el cliente user-scoped; la service key queda SOLO para
    // GoTrue Admin (createUser/deleteUser) dentro de createClientInternal.
    const authAdmin = createServiceRoleClient()
    const rowErrors: ImportRowError[] = []
    let succeeded = 0
    let skipped = 0

    const seenInBatch = new Set<string>()

    const CHUNK_SIZE = 10
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE)
        await Promise.allSettled(
            chunk.map(async (rawRow, chunkIdx) => {
                const rowNum = i + chunkIdx + 1
                const emailKey = rawRow.email?.toLowerCase().trim()

                const sanitizedName = sanitizeCell(rawRow.full_name).value
                const sanitizedEmail = sanitizeCell(rawRow.email).value
                const sanitizedPhone = rawRow.phone ? sanitizeCell(rawRow.phone).value : null

                const parsed = importRowSchema.safeParse({
                    full_name: sanitizedName,
                    email: sanitizedEmail,
                    phone: sanitizedPhone || null,
                    subscription_start_date: rawRow.subscription_start_date || null,
                })

                if (!parsed.success) {
                    rowErrors.push({
                        row: rowNum,
                        email: rawRow.email ?? '',
                        full_name: rawRow.full_name ?? '',
                        error: Object.values(parsed.error.flatten().fieldErrors).flat().join(', '),
                    })
                    return
                }

                if (existingEmails.has(emailKey)) {
                    skipped++
                    return
                }

                if (seenInBatch.has(emailKey)) {
                    skipped++
                    return
                }
                seenInBatch.add(emailKey)

                const result = await createClientInternal(supabase, authAdmin, {
                    ...rawCoach,
                    brand_name: team?.name ?? rawCoach.brand_name ?? rawCoach.full_name,
                    orgId,
                    teamId: activeTeamId,
                    loginPath: team ? `/t/${team.slug}/login` : null,
                }, {
                    full_name: parsed.data.full_name,
                    email: parsed.data.email,
                    phone: parsed.data.phone,
                    subscription_start_date: normalizeImportDate(parsed.data.subscription_start_date),
                    temp_password: generateTempPassword(),
                })

                if (result.ok) {
                    succeeded++
                } else {
                    rowErrors.push({
                        row: rowNum,
                        email: parsed.data.email,
                        full_name: parsed.data.full_name,
                        error: result.error,
                    })
                }
            })
        )

        await supabase
            .from('client_imports')
            .update({ success_count: succeeded, error_count: rowErrors.length })
            .eq('id', importRecord.id)
    }

    await supabase
        .from('client_imports')
        .update({
            status: rowErrors.length === rows.length ? 'failed' : 'completed',
            success_count: succeeded,
            error_count: rowErrors.length,
            errors: rowErrors as unknown as import('@/lib/database.types').Json,
            completed_at: new Date().toISOString(),
        })
        .eq('id', importRecord.id)

    revalidatePath('/coach/clients')

    return {
        success: true,
        importId: importRecord.id,
        summary: {
            total: rows.length,
            succeeded,
            failed: rowErrors.length,
            skipped,
        },
        rowErrors,
    }
}
