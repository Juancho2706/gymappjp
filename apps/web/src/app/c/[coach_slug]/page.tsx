import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function CoachRootPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        redirect(`/c/${coach_slug}/dashboard`)
    }

    redirect(`/c/${coach_slug}/login`)
}
