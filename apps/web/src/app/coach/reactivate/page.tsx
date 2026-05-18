import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReactivateClient } from './ReactivateClient'
import type { SubscriptionTier } from '@/lib/constants'

export default async function ReactivatePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [coachResult, clientCountResult] = await Promise.all([
        supabase
            .from('coaches')
            .select('subscription_tier, subscription_status, max_clients, subscription_mp_id')
            .eq('id', user.id)
            .maybeSingle(),
        supabase
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', user.id)
            .eq('is_archived', false),
    ])

    const currentTier = (coachResult.data?.subscription_tier ?? 'starter') as SubscriptionTier
    const subscriptionStatus = coachResult.data?.subscription_status ?? null
    const activeClientCount = clientCountResult.count ?? 0

    return (
        <Suspense>
            <ReactivateClient
                currentTier={currentTier}
                activeClientCount={activeClientCount}
                subscriptionStatus={subscriptionStatus}
            />
        </Suspense>
    )
}
