import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BrandSettingsForm } from './BrandSettingsForm'
import { LogoUploadForm } from './LogoUploadForm'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Mi Marca | OmniCoach OS',
}

export default async function CoachSettingsPage() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: rawCoach } = await supabase
        .from('coaches')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

    if (!rawCoach) redirect('/login')
    const coach = rawCoach as Coach

    return (
        <div className="p-8 max-w-3xl animate-fade-in">
            <div className="mb-8">
                <h1 className="text-2xl font-extrabold text-foreground">
                    Mi Marca
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Personaliza la experiencia que verán tus alumnos en su app.
                </p>
            </div>

            <div className="space-y-6">
                {/* Logo upload */}
                <LogoUploadForm
                    currentLogoUrl={coach.logo_url}
                    brandName={coach.brand_name}
                />

                {/* Brand settings form */}
                <BrandSettingsForm coach={coach} />
            </div>
        </div>
    )
}
