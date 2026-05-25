'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { redirect } from 'next/navigation'
import { ClientLoginSchema, ChangePasswordSchema } from '@eva/schemas'
import type { Tables } from '@/lib/database.types'
import type { WorkspaceSummary } from '@/domain/auth/types'
import { setLastWorkspace } from '@/services/auth/workspace.service'

type Coach = Tables<'coaches'>
type Client = Tables<'clients'>

export type ClientLoginState = {
    error?: string
    success?: boolean
    redirectUrl?: string
}

export async function clientLoginAction(
    _prev: ClientLoginState,
    formData: FormData
): Promise<ClientLoginState> {
    const raw = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        coach_slug: formData.get('coach_slug') as string,
    }

    const parsed = ClientLoginSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const { email, password, coach_slug } = parsed.data
    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        return { error: 'Email o contraseña incorrectos.' }
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return { error: 'Error al obtener sesión.' }
    }

    const rawAdmin = await createRawAdminClient()

    const INVITE_CODE_RE = /^[A-Z2-9]{5}$/
    const coachQuery = rawAdmin.from('coaches').select('id')
    const { data: coachData, error: coachError } = await (
        INVITE_CODE_RE.test(coach_slug)
            ? coachQuery.eq('invite_code', coach_slug).maybeSingle()
            : coachQuery.eq('slug', coach_slug).maybeSingle()
    )

    if (coachError) {
        console.error('[LoginAction] Error fetching coach (admin):', coachError)
    }

    const coach = coachData as Pick<Coach, 'id'> | null

    if (!coach) {
        await supabase.auth.signOut()
        return { error: 'Coach no encontrado.' }
    }

    const { data: clientData, error: clientError } = await rawAdmin
        .from('clients')
        .select('id, force_password_change, is_active, coach_id, org_id')
        .eq('id', user.id)
        .maybeSingle()

    if (clientError) {
        console.error('[LoginAction] Error fetching client (admin):', clientError)
    }

    type ClientRow = Pick<Client, 'id' | 'force_password_change' | 'is_active'> & { coach_id?: string | null; org_id?: string | null }
    const rawClient = clientData as ClientRow | null

    let client: Pick<Client, 'id' | 'force_password_change' | 'is_active'> | null = null
    let matchedWorkspace: WorkspaceSummary | null = null

    if (rawClient) {
        if (rawClient.coach_id === coach.id) {
            client = rawClient
            matchedWorkspace = rawClient.org_id
                ? {
                    type: 'student_enterprise',
                    userId: user.id,
                    clientId: rawClient.id,
                    orgId: rawClient.org_id,
                    coachId: rawClient.coach_id,
                    label: 'Alumno enterprise',
                    brandName: null,
                    slug: coach_slug,
                }
                : {
                    type: 'student_standalone',
                    userId: user.id,
                    clientId: rawClient.id,
                    coachId: rawClient.coach_id,
                    label: 'Alumno',
                    brandName: null,
                    slug: coach_slug,
                }
        } else if (rawClient.org_id) {
            const { data: orgMember } = await rawAdmin
                .from('organization_members')
                .select('id, organizations(name)')
                .eq('org_id', rawClient.org_id)
                .eq('coach_id', coach.id)
                .eq('status', 'active')
                .is('deleted_at', null)
                .maybeSingle()
            if (orgMember) {
                client = rawClient
                const org = Array.isArray(orgMember.organizations) ? orgMember.organizations[0] : orgMember.organizations
                matchedWorkspace = {
                    type: 'student_enterprise',
                    userId: user.id,
                    clientId: rawClient.id,
                    orgId: rawClient.org_id,
                    coachId: coach.id,
                    label: org?.name ? `Entrenar con ${org.name}` : 'Alumno enterprise',
                    brandName: org?.name ?? null,
                    slug: coach_slug,
                }
            }
        }
    }

    if (!client) {
        await supabase.auth.signOut()
        return { error: 'No tienes acceso a esta plataforma.' }
    }

    if (client.is_active === false) {
        await supabase.auth.signOut()
        return { error: 'Tu cuenta ha sido pausada. Contacta a tu coach para más información.' }
    }

    if (matchedWorkspace) {
        await setLastWorkspace(supabase, matchedWorkspace)
    }

    const redirectUrl = client.force_password_change
        ? `/c/${coach_slug}/change-password`
        : `/c/${coach_slug}/dashboard`

    return { success: true, redirectUrl }
}

export type ChangePasswordState = {
    error?: string
    success?: boolean
}

export async function changePasswordAction(
    _prev: ChangePasswordState,
    formData: FormData
): Promise<ChangePasswordState> {
    const raw = {
        password: formData.get('password') as string,
        confirm_password: formData.get('confirm_password') as string,
        coach_slug: formData.get('coach_slug') as string,
    }

    const parsed = ChangePasswordSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const { password, coach_slug } = parsed.data
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada. Por favor inicia sesión de nuevo.' }

    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) return { error: authError.message }

    const rawAdmin = await createRawAdminClient()
    await rawAdmin
        .from('clients')
        .update({ force_password_change: false })
        .eq('id', user.id)

    redirect(`/c/${coach_slug}/dashboard`)
}
