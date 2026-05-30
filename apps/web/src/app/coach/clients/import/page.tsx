import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { getCoachOrgContext } from '@/lib/coach-context'
import { UpsellGate } from '@/components/upgrade/UpsellGate'
import { ImportWizard } from './_components/ImportWizard'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Importar Alumnos | EVA',
}

export default async function ImportClientsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const ctx = await getCoachOrgContext()

    // Enterprise coach (role='coach' within org) cannot import clients
    if (ctx?.isOrgUser && !ctx.isOrgAdmin) {
        redirect('/coach/clients')
    }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, slug, subscription_tier, max_clients')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) redirect('/login')

    const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
    const caps = getTierCapabilities(tier)

    // Org admins always have import access (org manages billing)
    if (!ctx?.isOrgAdmin && !caps.canImportClients) {
        return <UpsellGate variant="client_import" currentTier={tier} />
    }

    const orgId = ctx?.isOrgAdmin ? ctx.orgId : null

    // Count active clients (scoped by context)
    const countQuery = supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', false)
    if (orgId) countQuery.eq('org_id', orgId)
    else countQuery.eq('coach_id', coach.id)
    const { count: activeCount } = await countQuery

    return (
        <ImportWizard
            coachId={coach.id}
            orgId={orgId}
            maxClients={coach.max_clients ?? 10}
            activeCount={activeCount ?? 0}
        />
    )
}
