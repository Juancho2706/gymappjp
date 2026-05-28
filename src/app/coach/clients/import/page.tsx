import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
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

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, subscription_tier, max_clients')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) redirect('/login')

    const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
    const caps = getTierCapabilities(tier)

    if (!caps.canImportClients) {
        return <UpsellGate variant="client_import" currentTier={tier} />
    }

    const { count: activeCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('is_archived', false)

    return (
        <ImportWizard
            coachId={coach.id}
            maxClients={coach.max_clients ?? 10}
            activeCount={activeCount ?? 0}
        />
    )
}
