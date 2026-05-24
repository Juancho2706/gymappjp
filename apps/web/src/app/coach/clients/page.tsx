import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CoachClientsShell } from './CoachClientsShell'
import type { Metadata } from 'next'
import { getCoach } from '@/lib/coach/get-coach'
import { getCoachClientsWithPrograms, getCoachClientsPulse } from './_data/clients.queries'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

export const metadata: Metadata = {
    title: 'Alumnos | EVA',
}

export default async function CoachClientsPage() {
    const coachSession = await getCoach()
    if (!coachSession) redirect('/login')

    const supabase = await createClient()
    const workspace = await resolvePreferredWorkspace(supabase, coachSession.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

    const [clients, headersList, pulse] = await Promise.all([
        getCoachClientsWithPrograms(coachSession.id, orgId),
        headers(),
        getCoachClientsPulse(coachSession.id, orgId),
    ])

    const coach = { slug: coachSession.slug, invite_code: coachSession.invite_code }
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const appUrl = `${protocol}://${host}`

    return (
        <div className="mx-auto max-w-[1600px] w-full min-w-0 animate-fade-in space-y-12 mb-24 md:mb-0">
            <CoachClientsShell clients={clients} coach={coach} appUrl={appUrl} pulse={pulse} />
        </div>
    )
}

