import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientsHeader } from './ClientsHeader'
import { ClientsDirectoryClient } from './ClientsDirectoryClient'
import type { Tables } from '@/lib/database.types'

type Client = Tables<'clients'>
type WorkoutProgram = Tables<'workout_programs'>

interface ClientWithProgram extends Client {
    workout_programs: Pick<WorkoutProgram, 'name' | 'start_date' | 'weeks_to_repeat' | 'is_active'>[]
}
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Alumnos | COACH OP',
}

export default async function CoachClientsPage() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [coachResponse, clientsResponse, headersList] = await Promise.all([
        supabase.from('coaches').select('slug').eq('id', user.id).maybeSingle(),
        supabase
            .from('clients')
            .select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false }),
        headers()
    ])

    const coach = coachResponse.data as { slug: string } | null
    const clients = (clientsResponse.data ?? []) as ClientWithProgram[]

    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const appUrl = `${protocol}://${host}`

    const stats = {
        total: clients.length,
        active: clients.filter((c) => !c.force_password_change && c.is_active !== false).length,
        pending: clients.filter((c) => c.force_password_change).length
    }

    return (
        <div className="max-w-[1600px] animate-fade-in mb-24 md:mb-0 space-y-12">
            <ClientsHeader 
                coachSlug={coach?.slug} 
                appUrl={appUrl} 
                stats={stats}
            />

            <ClientsDirectoryClient 
                clients={clients}
                coach={coach}
                appUrl={appUrl}
            />
        </div>
    )
}
