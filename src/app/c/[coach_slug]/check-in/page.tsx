import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { CheckInForm } from './CheckInForm'

export const metadata: Metadata = { title: 'Check-in Semanal | OmniCoach OS' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function ClientCheckInPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    // Verify client belongs to this coach and extract primary color for branding
    const { data: client } = await supabase
        .from('clients')
        .select(`
            id,
            coaches!inner ( slug, primary_color )
        `)
        .eq('id', user.id)
        .eq('coaches.slug', coach_slug)
        .maybeSingle()

    if (!client) redirect(`/c/${coach_slug}/dashboard`)

    const typedClient = client as unknown as { coaches: { primary_color: string } | { primary_color: string }[] }
    const coachInfo = Array.isArray(typedClient.coaches) ? typedClient.coaches[0] : typedClient.coaches
    const coachPrimaryColor = coachInfo?.primary_color || '#8B5CF6'

    return (
        <div className="min-h-screen pb-20">
            {/* Header */}
            <header className="border-b border-zinc-800 px-4 py-4">
                <Link href={`/c/${coach_slug}/dashboard`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium mb-4 transition-colors hover:opacity-80"
                    style={{ color: coachPrimaryColor }}>
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
                <h1 className="text-2xl font-bold text-zinc-50" style={{ fontFamily: 'var(--font-outfit)' }}>
                    Check-in Semanal
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                    Registra tu progreso para que tu coach pueda ajustar tu plan.
                </p>
            </header>

            <main className="px-4 py-6 max-w-lg mx-auto">
                <CheckInForm coachSlug={coach_slug} coachPrimaryColor={coachPrimaryColor} />
            </main>
        </div>
    )
}
