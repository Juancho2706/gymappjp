'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { createClient } from '@/lib/supabase/server'
import { getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'

const PaymentStatusSchema = z.enum(['paid', 'pending', 'overdue', 'scholarship', 'paused'])

const RecordEnterprisePaymentSchema = z.object({
    client_id: z.guid(),
    amount: z.coerce.number().int().min(0).max(99999999),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: PaymentStatusSchema,
    service_description: z.string().max(120).optional().or(z.literal('')),
})

async function resolveAdminContext(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const }
    return getOrgAdminContext(supabase, user.id, orgSlug)
}

export async function recordEnterpriseClientPaymentAction(orgSlug: string, formData: FormData) {
    const parsed = RecordEnterprisePaymentSchema.safeParse({
        client_id: formData.get('client_id'),
        amount: formData.get('amount'),
        payment_date: formData.get('payment_date'),
        status: formData.get('status'),
        service_description: formData.get('service_description') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }

    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const admin = createServiceRoleClient()
    const { data: client } = await admin
        .from('clients')
        .select('id, coach_id, full_name')
        .eq('id', parsed.data.client_id)
        .eq('org_id', ctx.org.id)
        .maybeSingle()
    if (!client) return { error: 'Alumno no encontrado en esta empresa' }
    if (!client.coach_id) return { error: 'Asigna un coach antes de registrar pagos' }

    const { data: coachMembership } = await admin
        .from('organization_members')
        .select('id')
        .eq('org_id', ctx.org.id)
        .eq('coach_id', client.coach_id)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!coachMembership) return { error: 'El coach asignado no esta activo en esta empresa' }

    const description = parsed.data.service_description?.trim() || 'Registro operacional enterprise'
    const { data: payment, error } = await admin
        .from('client_payments')
        .insert({
            client_id: client.id,
            coach_id: client.coach_id,
            amount: parsed.data.amount,
            payment_date: parsed.data.payment_date,
            status: parsed.data.status,
            service_description: description,
            period_months: 1,
        })
        .select('id')
        .single()

    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'client_payment.recorded',
        targetType: 'client_payment',
        targetId: payment.id,
        metadata: {
            client_id: client.id,
            coach_id: client.coach_id,
            amount: parsed.data.amount,
            status: parsed.data.status,
            payment_date: parsed.data.payment_date,
            legal_scope: 'operational_record_not_tax_invoice',
        },
    })

    revalidatePath(`/org/${orgSlug}/payments`)
    revalidatePath(`/org/${orgSlug}/reports`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

export async function recordEnterpriseClientPaymentFormAction(orgSlug: string, formData: FormData): Promise<void> {
    await recordEnterpriseClientPaymentAction(orgSlug, formData)
}
