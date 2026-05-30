import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

interface Params {
    params: Promise<{ slug: string }>
}

function csvCell(value: unknown): string {
    const text = value == null ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
}

function csvRow(cells: unknown[]): string {
    return cells.map(csvCell).join(',')
}

function reportFilename(slug: string): string {
    const stamp = new Date().toISOString().slice(0, 10)
    return `eva-${slug}-reporte-semanal-${stamp}.csv`
}

export async function GET(req: NextRequest, { params }: Params) {
    const { slug } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const context = await getOrgAdminContext(supabase, user.id, slug, ['org_owner', 'org_admin'])
    if ('error' in context) return NextResponse.json({ error: context.error }, { status: 403 })

    const { org } = context
    const admin = createServiceRoleClient()
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString()

    // --- Gather data (tenant-isolated via org_id) ---

    const [membersRes, clientsRes] = await Promise.all([
        admin.from('organization_members')
            .select('id, user_id, coach_id, role, status')
            .eq('org_id', org.id)
            .is('deleted_at', null),
        admin.from('clients')
            .select('id, full_name, email, is_active, coach_id, created_at')
            .eq('org_id', org.id),
    ])

    const members = membersRes.data ?? []
    const clients = clientsRes.data ?? []
    const activeCoaches = members.filter(m => m.status === 'active' && m.role === 'coach' && m.coach_id)
    const activeClients = clients.filter(c => c.is_active)

    // Workout logs (adherence)
    const clientIds = activeClients.map(c => c.id)
    const { data: logs30 } = clientIds.length > 0
        ? await admin.from('workout_logs').select('client_id, logged_at').in('client_id', clientIds).gte('logged_at', thirtyDaysAgo)
        : { data: [] }

    const recentIds7 = new Set((logs30 ?? []).filter(l => l.logged_at >= sevenDaysAgo).map(l => l.client_id))
    const adherence7d = activeClients.length > 0 ? Math.round((recentIds7.size / activeClients.length) * 100) : 0

    // Coach performance table
    const assignmentsRes = await admin.from('coach_client_assignments')
        .select('coach_id, client_id')
        .eq('org_id', org.id)
        .is('deleted_at', null)

    const assignedByCoach: Record<string, number> = {}
    for (const a of assignmentsRes.data ?? []) {
        if (a.coach_id) assignedByCoach[a.coach_id] = (assignedByCoach[a.coach_id] ?? 0) + 1
    }

    // --- Build CSV with metadata header ---
    const lines: string[] = []

    // Metadata block
    lines.push(`# Reporte Semanal EVA Enterprise`)
    lines.push(`# Organización: ${org.name}`)
    lines.push(`# Exportado: ${now.toISOString()}`)
    lines.push(`# Período: últimos 30 días`)
    lines.push(`# Exportado por: ${user.email ?? user.id}`)
    lines.push('')

    // Section 1: KPI Summary
    lines.push('## RESUMEN OPERACIONAL')
    lines.push(csvRow(['Métrica', 'Valor']))
    lines.push(csvRow(['Coaches activos', activeCoaches.length]))
    lines.push(csvRow(['Total alumnos', clients.length]))
    lines.push(csvRow(['Alumnos activos', activeClients.length]))
    lines.push(csvRow(['Alumnos sin coach', clients.filter(c => !c.coach_id && c.is_active).length]))
    lines.push(csvRow(['Adherencia 7d (%)', adherence7d]))
    lines.push(csvRow(['Alumnos entrenaron esta semana', recentIds7.size]))
    lines.push(csvRow(['Alumnos sin actividad 7d', activeClients.length - recentIds7.size]))
    lines.push('')

    // Section 2: Coach performance
    lines.push('## RENDIMIENTO POR COACH')
    lines.push(csvRow(['Coach', 'Rol', 'Alumnos asignados', 'Estado']))
    for (const m of activeCoaches) {
        lines.push(csvRow([
            m.coach_id ?? m.user_id,
            m.role,
            assignedByCoach[m.coach_id!] ?? 0,
            m.status,
        ]))
    }
    lines.push('')

    // Section 3: Students at risk
    const atRisk = activeClients.filter(c => !recentIds7.has(c.id))
    lines.push('## ALUMNOS SIN ACTIVIDAD (7 DÍAS)')
    lines.push(csvRow(['Nombre', 'Email', 'Coach asignado', 'Activo']))
    for (const c of atRisk) {
        lines.push(csvRow([c.full_name, c.email, c.coach_id ?? 'Sin coach', c.is_active ? 'Sí' : 'No']))
    }
    lines.push('')

    // Section 4: All students
    lines.push('## LISTADO COMPLETO DE ALUMNOS')
    lines.push(csvRow(['Nombre', 'Email', 'Coach', 'Activo', 'Fecha alta']))
    for (const c of clients) {
        lines.push(csvRow([c.full_name, c.email, c.coach_id ?? 'Sin coach', c.is_active ? 'Sí' : 'No', c.created_at?.slice(0, 10)]))
    }

    const csv = lines.join('\n')

    // Audit event (fail-closed: if audit fails, don't deliver export)
    try {
        await writeOrgAuditEvent(admin, {
            orgId: org.id,
            actorId: user.id,
            action: 'report.exported',
            targetType: 'organization',
            targetId: org.id,
            metadata: {
                report_type: 'weekly_brief',
                active_coaches: activeCoaches.length,
                active_clients: activeClients.length,
                at_risk: atRisk.length,
                adherence_7d: adherence7d,
                row_count: clients.length,
            },
        })
    } catch {
        return NextResponse.json({ error: 'Error al registrar auditoría del export.' }, { status: 500 })
    }

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${reportFilename(slug)}"`,
            'Cache-Control': 'no-store',
        },
    })
}
