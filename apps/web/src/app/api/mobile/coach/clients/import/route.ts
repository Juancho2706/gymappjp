import { randomInt } from 'node:crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClientInternal } from '@/app/coach/clients/_lib/create-client-internal'
import { getTierCapabilities, getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import type { Database, Json } from '@/lib/database.types'
import { sanitizeCell } from '@/lib/import/csv-injection'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

const MAX_ROWS = 1_000
const CHUNK_SIZE = 10
const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

const requestedWorkspaceSchema = z.object({
    kind: z.enum(['standalone', 'team_owner', 'team_member', 'enterprise']),
    teamId: z.string().uuid().nullable().optional(),
    orgId: z.string().uuid().nullable().optional(),
})

const requestSchema = z.object({
    rows: z.array(z.object({
        full_name: z.unknown().optional(),
        email: z.unknown().optional(),
        phone: z.unknown().optional().nullable(),
        subscription_start_date: z.unknown().optional().nullable(),
        source_row: z.number().int().positive().optional(),
    }).passthrough()).min(1).max(MAX_ROWS),
    filename: z.string().trim().min(1).max(255),
    consentConfirmed: z.literal(true),
    // RN mantiene la selección en AsyncStorage; no necesariamente coincide con
    // workspace_preferences web. Los ids son solo una pista: se autorizan abajo contra DB.
    workspace: requestedWorkspaceSchema.optional(),
})

const importRowSchema = z.object({
    full_name: z.string().min(2, 'Nombre muy corto').max(100),
    email: z.string().email('Email inválido'),
    phone: z.string().max(50).optional().nullable(),
    subscription_start_date: z.string().max(50).optional().nullable(),
})

type ImportRowError = {
    row: number
    email: string
    full_name: string
    error: string
}

type RequestedWorkspace = z.infer<typeof requestedWorkspaceSchema>
type ImportWorkspace =
    | { type: 'coach_standalone' }
    | { type: 'coach_team'; teamId: string }
    | { type: 'enterprise_staff'; orgId: string; memberId: string; role: 'org_owner' | 'org_admin' }

async function resolveExplicitWorkspace(
    admin: ReturnType<typeof createServiceRoleClient>,
    userId: string,
    requested: RequestedWorkspace,
): Promise<ImportWorkspace | null> {
    if (requested.kind === 'standalone') {
        if (requested.teamId || requested.orgId) return null
        const { data: coach } = await admin
            .from('coaches')
            .select('id, subscription_status')
            .eq('id', userId)
            .maybeSingle()
        if (!coach || coach.subscription_status === 'org_managed' || coach.subscription_status === 'team_managed') return null
        return { type: 'coach_standalone' }
    }

    if (requested.kind === 'team_owner' || requested.kind === 'team_member') {
        if (!requested.teamId || requested.orgId) return null
        const [{ data: membership }, { data: team }] = await Promise.all([
            admin
                .from('team_members')
                .select('id')
                .eq('team_id', requested.teamId)
                .eq('coach_id', userId)
                .eq('status', 'active')
                .is('deleted_at', null)
                .maybeSingle(),
            admin
                .from('teams')
                .select('owner_coach_id')
                .eq('id', requested.teamId)
                .is('deleted_at', null)
                .is('suspended_at', null)
                .maybeSingle(),
        ])
        if (!membership || !team) return null
        // Rechaza una selección local obsoleta/manipulada; el cliente debe refrescar su contexto.
        const canonicalKind = team.owner_coach_id === userId ? 'team_owner' : 'team_member'
        if (requested.kind !== canonicalKind) return null
        return { type: 'coach_team', teamId: requested.teamId }
    }

    if (!requested.orgId || requested.teamId) return null
    const { data: membership } = await admin
        .from('organization_members')
        .select('id, role')
        .eq('org_id', requested.orgId)
        .eq('user_id', userId)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership || (membership.role !== 'org_owner' && membership.role !== 'org_admin')) return null
    return { type: 'enterprise_staff', orgId: requested.orgId, memberId: membership.id, role: membership.role }
}

function bearerToken(request: NextRequest): string | null {
    const authorization = request.headers.get('authorization')
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

function normalizeImportDate(raw: string | null | undefined): string | null {
    if (!raw) return null
    const value = raw.trim()
    if (!value) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

    const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        ?? value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-')
}

function generateTempPassword(): string {
    return Array.from({ length: 12 }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join('')
}

function rawText(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsedRequest = requestSchema.safeParse(body)
    if (!parsedRequest.success) {
        const consentMissing = body?.consentConfirmed !== true
        return NextResponse.json({
            error: consentMissing
                ? 'Debes confirmar el consentimiento de protección de datos (Ley 19.628) para continuar.'
                : 'Datos inválidos.',
            code: consentMissing ? 'CONSENT_REQUIRED' : 'VALIDATION_ERROR',
            fieldErrors: parsedRequest.error.flatten().fieldErrors,
        }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const user = userData.user
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    const userClient = createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        },
    )

    const requestedWorkspace = parsedRequest.data.workspace
    const workspace = requestedWorkspace
        ? await resolveExplicitWorkspace(admin, user.id, requestedWorkspace)
        : await resolvePreferredWorkspace(admin, user.id)
    if (!workspace) {
        return NextResponse.json({
            error: requestedWorkspace ? 'Workspace inválido o sin autorización.' : 'Workspace no autorizado.',
            code: requestedWorkspace ? 'WORKSPACE_MISMATCH' : 'WORKSPACE_NOT_ALLOWED',
        }, { status: 403 })
    }

    let orgId: string | null = null
    let teamId: string | null = null
    let team: { name: string; slug: string } | null = null
    let enterpriseAdmin = false

    if (workspace.type === 'coach_team') {
        teamId = workspace.teamId
        const { data: teamRow } = await admin
            .from('teams')
            .select('name, slug')
            .eq('id', teamId)
            .is('deleted_at', null)
            .maybeSingle()
        if (!teamRow) {
            return NextResponse.json({ error: 'Equipo no encontrado.', code: 'TEAM_NOT_FOUND' }, { status: 404 })
        }
        team = teamRow
    } else if (workspace.type === 'enterprise_staff') {
        if (workspace.role !== 'org_owner' && workspace.role !== 'org_admin') {
            return NextResponse.json({ error: 'Tu rol no permite importar alumnos.', code: 'ROLE_NOT_ALLOWED' }, { status: 403 })
        }
        const { data: membership } = await admin
            .from('organization_members')
            .select('id')
            .eq('id', workspace.memberId)
            .eq('org_id', workspace.orgId)
            .eq('user_id', user.id)
            .in('role', ['org_owner', 'org_admin'])
            .eq('status', 'active')
            .is('deleted_at', null)
            .maybeSingle()
        if (!membership) {
            return NextResponse.json({ error: 'Tu rol no permite importar alumnos.', code: 'ROLE_NOT_ALLOWED' }, { status: 403 })
        }
        orgId = workspace.orgId
        enterpriseAdmin = true
    } else if (workspace.type !== 'coach_standalone') {
        // El coach enterprise gestionado no importa; esa facultad pertenece al owner/admin.
        return NextResponse.json({ error: 'Tu rol no permite importar alumnos.', code: 'ROLE_NOT_ALLOWED' }, { status: 403 })
    }

    const { data: coach } = await admin
        .from('coaches')
        .select('id, slug, full_name, brand_name, welcome_message, subscription_tier, max_clients, primary_color, logo_url')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach && !enterpriseAdmin) {
        return NextResponse.json({ error: 'Coach no encontrado.', code: 'COACH_NOT_FOUND' }, { status: 404 })
    }

    const tier = (coach?.subscription_tier ?? 'free') as SubscriptionTier
    if (!teamId && !enterpriseAdmin && !getTierCapabilities(tier).canImportClients) {
        return NextResponse.json({ error: 'upgrade_required', code: 'UPGRADE_REQUIRED' }, { status: 402 })
    }

    const rows = parsedRequest.data.rows
    if (!teamId && !orgId) {
        const maxClients = coach?.max_clients ?? getTierMaxClients(tier)
        const { count, error: countError } = await admin
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', user.id)
            .is('org_id', null)
            .is('team_id', null)
            .eq('is_archived', false)

        if (countError) {
            return NextResponse.json({ error: 'No pudimos validar el límite de alumnos de tu plan.', code: 'CLIENT_LIMIT_CHECK_FAILED' }, { status: 500 })
        }
        if ((count ?? 0) + rows.length > maxClients) {
            return NextResponse.json({
                error: `Tu plan permite ${maxClients} alumnos activos. Tienes ${count ?? 0} y quieres importar ${rows.length}. Actualiza tu plan o reduce la cantidad de filas.`,
                code: 'UPGRADE_REQUIRED',
                currentLimit: maxClients,
            }, { status: 402 })
        }
    }

    let org: { name: string } | null = null
    if (orgId) {
        const { data } = await admin.from('organizations').select('name').eq('id', orgId).is('deleted_at', null).maybeSingle()
        if (!data) return NextResponse.json({ error: 'Organización no encontrada.', code: 'ORG_NOT_FOUND' }, { status: 404 })
        org = data
    }

    const filename = sanitizeCell(parsedRequest.data.filename).value
    const importInsert = orgId
        ? { org_id: orgId, coach_id: null, filename, total_rows: rows.length, status: 'processing', consent_confirmed_at: new Date().toISOString() }
        : { org_id: null, coach_id: user.id, filename, total_rows: rows.length, status: 'processing', consent_confirmed_at: new Date().toISOString() }
    const { data: importRecord, error: importError } = await userClient
        .from('client_imports')
        .insert(importInsert)
        .select('id')
        .single()

    if (importError || !importRecord) {
        console.error('mobile client_imports insert error:', importError)
        return NextResponse.json({ error: 'Error al registrar el import.', code: 'IMPORT_AUDIT_FAILED' }, { status: 500 })
    }

    const emails = rows.map(row => rawText(row.email).toLowerCase().trim()).filter(Boolean)
    let existingQuery = userClient.from('clients').select('email').in('email', emails)
    if (orgId) existingQuery = existingQuery.eq('org_id', orgId)
    else if (teamId) existingQuery = existingQuery.eq('team_id', teamId)
    else existingQuery = existingQuery.eq('coach_id', user.id).is('org_id', null).is('team_id', null)
    const { data: existingClients } = await existingQuery
    const existingEmails = new Set((existingClients ?? []).map(row => row.email.toLowerCase()))

    const actor = coach ?? {
        id: user.id,
        slug: '',
        full_name: user.email ?? 'Administrador',
        brand_name: org?.name ?? 'EVA',
        welcome_message: null,
        subscription_tier: null,
        primary_color: null,
        logo_url: null,
    }
    const rowErrors: ImportRowError[] = []
    const seenInBatch = new Set<string>()
    let succeeded = 0
    let skipped = 0

    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
        const chunk = rows.slice(offset, offset + CHUNK_SIZE)
        await Promise.allSettled(chunk.map(async (rawRow, chunkIndex) => {
            const rowNumber = rawRow.source_row ?? offset + chunkIndex + 1
            const sanitizedName = sanitizeCell(rawRow.full_name).value
            const sanitizedEmail = sanitizeCell(rawRow.email).value
            const sanitizedPhone = rawRow.phone == null ? null : sanitizeCell(rawRow.phone).value
            const sanitizedDate = rawRow.subscription_start_date == null
                ? null
                : sanitizeCell(rawRow.subscription_start_date).value
            const parsedRow = importRowSchema.safeParse({
                full_name: sanitizedName,
                email: sanitizedEmail,
                phone: sanitizedPhone || null,
                subscription_start_date: sanitizedDate || null,
            })

            if (!parsedRow.success) {
                rowErrors.push({
                    row: rowNumber,
                    email: rawText(rawRow.email),
                    full_name: rawText(rawRow.full_name),
                    error: Object.values(parsedRow.error.flatten().fieldErrors).flat().join(', '),
                })
                return
            }

            const emailKey = parsedRow.data.email.toLowerCase().trim()
            if (existingEmails.has(emailKey) || seenInBatch.has(emailKey)) {
                skipped++
                return
            }
            seenInBatch.add(emailKey)

            const result = await createClientInternal(userClient, admin, {
                ...actor,
                brand_name: team?.name ?? org?.name ?? actor.brand_name,
                orgId,
                teamId,
                loginPath: team ? `/t/${team.slug}/login` : null,
            }, {
                full_name: parsedRow.data.full_name,
                email: parsedRow.data.email,
                phone: parsedRow.data.phone,
                subscription_start_date: normalizeImportDate(parsedRow.data.subscription_start_date),
                temp_password: generateTempPassword(),
            }, {
                // En enterprise el alta crea un alumno de pool: sus credenciales se emiten al asignarlo.
                sendEmail: !enterpriseAdmin,
            })

            if (result.ok) succeeded++
            else rowErrors.push({
                row: rowNumber,
                email: parsedRow.data.email,
                full_name: parsedRow.data.full_name,
                error: result.error,
            })
        }))

        await userClient
            .from('client_imports')
            .update({ success_count: succeeded, error_count: rowErrors.length })
            .eq('id', importRecord.id)
    }

    await userClient
        .from('client_imports')
        .update({
            status: rowErrors.length === rows.length ? 'failed' : 'completed',
            success_count: succeeded,
            error_count: rowErrors.length,
            errors: rowErrors as unknown as Json,
            completed_at: new Date().toISOString(),
        })
        .eq('id', importRecord.id)

    return NextResponse.json({
        ok: true,
        success: true,
        importId: importRecord.id,
        summary: { total: rows.length, succeeded, failed: rowErrors.length, skipped },
        rowErrors,
    })
}
