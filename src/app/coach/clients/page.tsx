import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CoachClientsShell } from './CoachClientsShell'
import { getCachedDirectoryPulse } from '@/lib/coach/directory-pulse-cache'
import type { Tables } from '@/lib/database.types'
import type { Metadata } from 'next'

type Client = Tables<'clients'>
type WorkoutProgram = Tables<'workout_programs'>

interface ClientWithProgram extends Client {
    workout_programs: Pick<
        WorkoutProgram,
        'name' | 'start_date' | 'weeks_to_repeat' | 'is_active'
    >[]
}

export const metadata: Metadata = {
    title: 'Alumnos | COACH OP',
}

export default async function CoachClientsPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [coachResponse, clientsResponse, headersList, pulse] = await Promise.all([
        supabase.from('coaches').select('slug').eq('id', user.id).maybeSingle(),
        supabase
            .from('clients')
            .select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false }),
        headers(),
        getCachedDirectoryPulse(user.id),
    ])

    const coach = coachResponse.data as { slug: string } | null
    const clients = (clientsResponse.data ?? []) as ClientWithProgram[]

    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const appUrl = `${protocol}://${host}`

    return (
        <div className="max-w-[1600px] animate-fade-in mb-24 md:mb-0 space-y-12">
            <CoachClientsShell clients={clients} coach={coach} appUrl={appUrl} pulse={pulse} />
        </div>
    )
}
