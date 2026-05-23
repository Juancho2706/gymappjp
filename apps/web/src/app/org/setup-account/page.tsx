import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { SetupAccountForm } from './SetupAccountForm'
import { Building2 } from 'lucide-react'

export const metadata: Metadata = { title: 'Activar cuenta — EVA Enterprise' }

export default async function SetupAccountPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/org/login')
    }

    // If user already has org access, redirect to their org
    const { data: membership } = await supabase
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    if (!membership?.org_id) {
        redirect('/org/login')
    }

    return (
        <div className="min-h-dvh flex items-center justify-center bg-background p-4">
            <div className="w-full max-w-md space-y-6">
                <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-violet-600/10 flex items-center justify-center mx-auto">
                        <Building2 className="w-6 h-6 text-violet-600" />
                    </div>
                    <h1 className="text-2xl font-black text-foreground">Activa tu cuenta</h1>
                    <p className="text-sm text-muted-foreground">
                        Configura tu contraseña para acceder al panel enterprise de EVA.
                    </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <SetupAccountForm />
                </div>

                <p className="text-center text-xs text-muted-foreground">
                    ¿Necesitas ayuda?{' '}
                    <a href="mailto:soporte@eva-app.cl" className="underline underline-offset-2 hover:text-foreground">
                        soporte@eva-app.cl
                    </a>
                </p>
            </div>
        </div>
    )
}
