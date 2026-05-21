'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type OrgLoginState = {
    error?: string
}

export async function loginOrgAction(_prevState: OrgLoginState, formData: FormData): Promise<OrgLoginState> {
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')

    if (!email || !password) {
        return { error: 'Email y contrasena requeridos.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
        return { error: 'Credenciales invalidas.' }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'No se pudo iniciar sesion.' }
    }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role, org_id')
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

    if (!membership?.org_id) {
        await supabase.auth.signOut()
        return { error: 'No tienes acceso a ninguna organizacion.' }
    }

    const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', membership.org_id)
        .is('deleted_at', null)
        .maybeSingle()

    if (!org?.slug) {
        await supabase.auth.signOut()
        return { error: 'Organizacion no encontrada.' }
    }

    redirect(`/org/${org.slug}`)
}
