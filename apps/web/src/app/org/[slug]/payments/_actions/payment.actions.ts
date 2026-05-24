'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { createClient } from '@/lib/supabase/server'
import { writeOrgAuditEvent } from '@/services/org/org.service'

const PaymentStatusSchema = z.enum(['paid', 'pending', 'overdue', 'scholarship', 'paused'])

const RecordEnterprisePaymentSchema = z.object({
    client_id: z.uuid(),
    amount: z.coerce.number().int().min(0).max(99999999),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: PaymentStatusSchema,
    service_description: z.string().max(120).optional().or(z.literal('')),
})

export async function recordEnterpriseClientPaymentAction(orgSlug: string, formData: FormData) {
    const supabase = await createClient()
    const admin = createServiceRoleClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const parsed = RecordEnterprisePaymentSchema.safeParse({
        client_id: formData.get('client_id'),
        amount: formData.get('amount'),
        payment_date: formData.get('payment_date'),
        status: formData.get('status'),
        service_description: formData.get('service_description') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .is('deleted_at', null)
        .maybeSingle()
    if (!org) return { error: 'Organizacion no encontrada' }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos de administrador' }

    const { data: client } = await admin
        .from('clients')
        .select('id, coach_id, full_name')
        .eq('id', parsed.data.client_id)
        .eq('org_id', org.id)
        .maybeSingle()
    if (!client) return { error: 'Alumno no encontrado en esta empresa' }
    if (!client.coach_id) return { error: 'Asigna un coach antes de registrar pagos' }

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
        orgId: org.id,
        actorId: user.id,
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
