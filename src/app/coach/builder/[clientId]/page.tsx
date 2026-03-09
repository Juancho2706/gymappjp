import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Client, Exercise } from '@/lib/database.types'
import type { Metadata } from 'next'
import { PlanBuilder } from './PlanBuilder'

export const metadata: Metadata = { title: 'Constructor de Rutina | OmniCoach OS' }

export default async function BuilderPage({
    params,
}: {
    params: Promise<{ clientId: string }>
}) {
    const { clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Verify client belongs to coach
    const { data: rawClient } = await supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
        .eq('coach_id', user.id)
        .maybeSingle()

    if (!rawClient) redirect('/coach/clients')
    const client = rawClient as Pick<Client, 'id' | 'full_name' | 'email'>

    // Fetch all exercises (global + coach's own)
    const { data: rawExercises } = await supabase
        .from('exercises')
        .select('*')
        .or(`coach_id.is.null,coach_id.eq.${user.id}`)
        .order('muscle_group')
        .order('name')

    const exercises = (rawExercises ?? []) as Exercise[]

    return <PlanBuilder client={client} exercises={exercises} />
}
