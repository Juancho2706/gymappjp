'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Tables } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CreateClientSchema, UpdateClientDataSchema } from '@eva/schemas'
import { getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import {
    buildClientWelcomeEmail,
    buildUpgradeRequiredEmail,
    buildClientArchivedEmail,
    buildClientUnarchivedEmail,
} from '@/lib/email/transactional-templates'
import { resolveStudentEmailBranding } from '@/lib/email/email-brand'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    sanitizePlatformEmail,
} from '@/lib/auth/platform-email'
import { buildCoachStudentUrl, getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
// F3: single source of truth for coach scope + org filtering (replaces the local copies).
import { resolveCoachScope as getCoachClientScope, applyOrgScope as applyClientScope } from '@/services/auth/coach-scope.service'
import { createClientIdentity } from '@/infrastructure/db/client-membership.repository'
import { generateStudentTempPassword } from '@/lib/auth/temp-credentials'

export type CreateClientState = {
    error?: string
    success?: boolean
    fieldErrors?: Record<string, string[]>
    newClientPhone?: string
    loginUrl?: string
    clientName?: string
    upgradeRequired?: boolean
    currentLimit?: number
}

export async function createClientAction(
    _prev: CreateClientState,
    formData: FormData
): Promise<CreateClientState> {
    const raw = {
        full_name: formData.get('full_name') as string,
        email: formData.get('email') as string,
        phone: formData.get('phone') as string,
        subscription_start_date: formData.get('subscription_start_date') as string,
        temp_password: formData.get('temp_password') as string,
        age_confirmed: formData.get('age_confirmed') as string,
    }

    const parsed = CreateClientSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    const { data: rawCoachData } = await supabase
        .from('coaches')
        .select('id, slug, invite_code, full_name, brand_name, welcome_message, subscription_tier, max_clients, active_org_id, primary_color, logo_url')
        .eq('id', coachUser.id)
        .maybeSingle()

    const coach = rawCoachData as Pick<Tables<'coaches'>, 'id' | 'slug' | 'invite_code' | 'full_name' | 'brand_name' | 'welcome_message' | 'subscription_tier' | 'max_clients' | 'primary_color' | 'logo_url'> & { active_org_id?: string | null } | null

    if (!coach) return { error: 'Coach no encontrado.' }

    const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
    const maxClients = coach.max_clients ?? getTierMaxClients(tier)
    let activeClientsQuery = supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('is_archived', false)
    activeClientsQuery = applyClientScope(activeClientsQuery, scope.orgId)
    const { count: activeClientsCount, error: countError } = await activeClientsQuery

    if (countError) {
        return { error: 'No pudimos validar el límite de alumnos de tu plan.' }
    }
    // Cap del tier personal: solo standalone (enterprise y team pagan centralizado).
    if (!scope.isEnterprise && !scope.activeTeamId && (activeClientsCount ?? 0) >= maxClients) {
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const { subject, html } = buildUpgradeRequiredEmail({
            coachName: coach.full_name ?? 'Coach',
            brandName: coach.brand_name ?? 'EVA',
            currentLimit: maxClients,
            subscriptionUrl: `${appUrl}/coach/subscription`,
        })
        sendTransactionalEmail({ to: coachUser.email!, subject, html }).catch(() => null)

        return {
            error: `Alcanzaste el límite de ${maxClients} alumnos de tu plan actual.`,
            upgradeRequired: true,
            currentLimit: maxClients,
        }
    }

    // R3 (auditoria 2026-06-11): solo GoTrue Admin API necesita la service key; las queries
    // PostgREST de esta accion pasan RLS del coach y van con el cliente user-scoped `supabase`.
    const authAdmin = createServiceRoleClient()
    const emailSan = sanitizePlatformEmail(parsed.data.email)
    // RPC SECURITY DEFINER con GRANT a authenticated → el cliente user-scoped alcanza.
    const availability = await assertPlatformEmailAvailable(supabase, parsed.data.email)
    if (!availability.ok) {
        return { error: availability.error }
    }

    const { data: newAuthUser, error: authError } = await authAdmin.auth.admin.createUser({
        email: emailSan,
        password: parsed.data.temp_password,
        email_confirm: true,
    })

    if (authError) {
        if (isAuthDuplicateEmailMessage(authError.message)) {
            return { error: 'Este correo ya está registrado en la plataforma. Usa otro correo o inicia sesión si ya tienes cuenta.' }
        }
        return { error: `Error al crear el usuario: ${authError.message}` }
    }

    // INSERT user-scoped: el WITH CHECK de RLS (standalone/team/org-coach) es el techo real.
    const { error: dbError } = await supabase.from('clients').insert({
        id: newAuthUser.user.id,
        coach_id: coach.id,
        full_name: parsed.data.full_name,
        email: emailSan,
        phone: parsed.data.phone || null,
        subscription_start_date: parsed.data.subscription_start_date || null,
        force_password_change: true,
        age_confirmed_at: new Date().toISOString(),
        org_id: scope.orgId,
        // Contexto team: el alumno nace EN el pool (todo el equipo lo ve; consent gate en /t).
        team_id: scope.activeTeamId,
    })

    if (dbError) {
        await authAdmin.auth.admin.deleteUser(newAuthUser.user.id)
        if (dbError.code === '23505') {
            return { error: 'Este correo ya está registrado en la plataforma. Usa otro correo o inicia sesión si ya tienes cuenta.' }
        }
        return { error: 'Error al guardar el alumno en la base de datos.' }
    }

    // F1: materialize identity (account + membership). Non-fatal — reads fall back to clients.
    const identity = await createClientIdentity({
        accountId: newAuthUser.user.id,
        clientId: newAuthUser.user.id,
        coachId: coach.id,
        orgId: scope.orgId,
        teamId: scope.activeTeamId,
    })
    if (!identity.ok) console.error('createClientIdentity (non-fatal):', identity.error)

    if (scope.orgId) {
        // R1 (auditoria 2026-06-11): no existe policy de INSERT en coach_client_assignments para
        // coaches (a proposito: seria escalada horizontal) y el admin client con cookies corre
        // como el coach => RLS bloqueaba este insert en silencio y el alumno quedaba invisible.
        // Service role REAL acotado (org y coach ya validados por resolveCoachScope) y FATAL con
        // rollback: un alumno enterprise sin asignacion es un alumno huerfano.
        const serviceDb = createServiceRoleClient()
        const { error: assignErr } = await serviceDb.from('coach_client_assignments').insert({
            org_id: scope.orgId,
            coach_id: coach.id,
            client_id: newAuthUser.user.id,
            assigned_by: coachUser.id,
        })
        if (assignErr) {
            console.error('Failed to create coach_client_assignment (rolling back):', assignErr)
            await serviceDb.from('clients').delete().eq('id', newAuthUser.user.id)
            await authAdmin.auth.admin.deleteUser(newAuthUser.user.id)
            return { error: 'No se pudo asignar el alumno a tu cuenta. Intenta de nuevo.' }
        }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
    // Contexto team: el alumno entra por /t/[team]/login con la marca del TEAM (no la personal).
    let loginPath: string
    let emailBrandName = coach.brand_name
    if (scope.activeTeamId) {
        const { data: team } = await supabase
            .from('teams')
            .select('slug, name')
            .eq('id', scope.activeTeamId)
            .maybeSingle()
        loginPath = `/t/${team?.slug ?? ''}/login`
        emailBrandName = team?.name ?? coach.brand_name
    } else {
        loginPath = `/c/${getCoachPublicIdentifier(coach)}/login`
    }
    const loginUrl = appUrl ? `${appUrl}${loginPath}` : `https://app.tu-dominio.com${loginPath}`
    // White-label (W2): el header/CTA del email usan la marca del coach solo si es standalone Pro+
    // (team/org tienen su propia marca, no threadeada acá → fallback EVA).
    const emailBrand = resolveStudentEmailBranding({
        isStandalone: !scope.orgId && !scope.activeTeamId,
        tier: coach.subscription_tier,
        logoUrl: coach.logo_url,
        primaryColor: coach.primary_color,
    })
    const welcomeEmail = buildClientWelcomeEmail({
        brandName: emailBrandName,
        coachName: coach.full_name,
        clientName: parsed.data.full_name,
        loginUrl,
        tempPassword: parsed.data.temp_password,
        welcomeMessage: coach.welcome_message,
        logoUrl: emailBrand.logoUrl,
        primaryColor: emailBrand.primaryColor,
    })
    const emailResult = await sendTransactionalEmail({
        to: emailSan,
        subject: welcomeEmail.subject,
        html: welcomeEmail.html,
    })
    if (!emailResult.ok) {
        console.error('Welcome email delivery error:', emailResult.error)
    }

    revalidatePath('/coach/clients')
    return {
        success: true,
        newClientPhone: parsed.data.phone || undefined,
        loginUrl,
        clientName: parsed.data.full_name,
    }
}

export type ClientIntakeData = {
    full_name: string
    phone: string | null
    weight_kg: number | null
    height_cm: number | null
    goals: string | null
    experience_level: string | null
    availability: string | null
    injuries: string | null
    medical_conditions: string | null
}

export async function getClientIntakeAction(clientId: string): Promise<{ data?: ClientIntakeData; error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    let clientQuery = supabase
        .from('clients')
        .select('full_name, phone, coach_id, client_intake(weight_kg, height_cm, goals, experience_level, availability, injuries, medical_conditions)')
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    clientQuery = applyClientScope(clientQuery, scope.orgId)
    const { data: client } = await clientQuery.maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    const intake = Array.isArray(client.client_intake) ? client.client_intake[0] : client.client_intake

    return {
        data: {
            full_name: client.full_name,
            phone: client.phone ?? null,
            weight_kg: intake?.weight_kg ?? null,
            height_cm: intake?.height_cm ?? null,
            goals: intake?.goals ?? null,
            experience_level: intake?.experience_level ?? null,
            availability: intake?.availability ?? null,
            injuries: intake?.injuries ?? null,
            medical_conditions: intake?.medical_conditions ?? null,
        },
    }
}

export type UpdateClientDataState = {
    error?: string
    success?: boolean
    fieldErrors?: Record<string, string[]>
}

export async function updateClientDataAction(
    _prev: UpdateClientDataState,
    formData: FormData
): Promise<UpdateClientDataState> {
    const raw = {
        client_id: formData.get('client_id') as string,
        full_name: formData.get('full_name') as string,
        phone: formData.get('phone') as string,
        weight_kg: formData.get('weight_kg') as string,
        height_cm: formData.get('height_cm') as string,
        goals: formData.get('goals') as string,
        experience_level: formData.get('experience_level') as string,
        availability: formData.get('availability') as string,
        injuries: formData.get('injuries') as string,
        medical_conditions: formData.get('medical_conditions') as string,
    }

    const parsed = UpdateClientDataSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    let updateClientQuery = supabase
        .from('clients')
        .update({
            full_name: parsed.data.full_name,
            phone: parsed.data.phone || null,
        })
        .eq('id', parsed.data.client_id)
        .eq('coach_id', coachUser.id)
    updateClientQuery = applyClientScope(updateClientQuery, scope.orgId)
    const { error: clientErr } = await updateClientQuery

    if (clientErr) return { error: 'Error al actualizar datos del alumno.' }

    const intakePayload = {
        client_id: parsed.data.client_id,
        weight_kg: parsed.data.weight_kg !== '' ? Number(parsed.data.weight_kg) : 0,
        height_cm: parsed.data.height_cm !== '' ? Number(parsed.data.height_cm) : 0,
        goals: parsed.data.goals || '',
        experience_level: parsed.data.experience_level || '',
        availability: parsed.data.availability || '',
        injuries: parsed.data.injuries || null,
        medical_conditions: parsed.data.medical_conditions || null,
    }

    const { error: intakeErr } = await supabase
        .from('client_intake')
        .upsert(intakePayload, { onConflict: 'client_id' })

    if (intakeErr) return { error: 'Error al actualizar datos de onboarding.' }

    revalidatePath('/coach/clients')
    revalidatePath(`/coach/clients/${parsed.data.client_id}`)
    return { success: true }
}

export async function deleteClientAction(clientId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    let clientQuery = supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    clientQuery = applyClientScope(clientQuery, scope.orgId)
    const { data: client } = await clientQuery.maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    // Edge coach-como-cliente: el SELECT en coaches es publico y el DELETE pasa la RLS propia
    // del coach → cliente user-scoped. Solo deleteUser (GoTrue Admin) exige la service key.
    const { data: coachProfile } = await supabase.from('coaches').select('id').eq('id', clientId).maybeSingle()

    if (coachProfile) {
        let deleteQuery = supabase
            .from('clients')
            .delete()
            .eq('id', clientId)
            .eq('coach_id', coachUser.id)
        deleteQuery = applyClientScope(deleteQuery, scope.orgId)
        const { error: delErr } = await deleteQuery
        if (delErr) return { error: delErr.message }
    } else {
        const authAdmin = createServiceRoleClient()
        const { error } = await authAdmin.auth.admin.deleteUser(clientId)
        if (error) return { error: error.message }
    }

    revalidatePath('/coach/clients')
    return {}
}

export async function resetClientPasswordAction(clientId: string): Promise<{ error?: string, tempPassword?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    let clientQuery = supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    clientQuery = applyClientScope(clientQuery, scope.orgId)
    const { data: client } = await clientQuery.maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    // PIN puro (6 dígitos numéricos) lo rechaza la protección HIBP de Supabase
    // con 422 "Password is known to be weak". Patrón Eva${pin}! pasa el filtro.
    const tempPassword = generateStudentTempPassword()

    // GoTrue Admin API: aqui si se necesita (y se tiene) admin real.
    const authAdmin = createServiceRoleClient()
    const { error: authError } = await authAdmin.auth.admin.updateUserById(clientId, {
        password: tempPassword,
    })

    if (authError) return { error: `Error al actualizar: ${authError.message}` }

    let resetQuery = supabase
        .from('clients')
        .update({ force_password_change: true })
        .eq('id', clientId)
    resetQuery = applyClientScope(resetQuery, scope.orgId)
    const { error: dbError } = await resetQuery

    if (dbError) return { error: 'Error al actualizar base de datos.' }

    revalidatePath('/coach/clients')
    return { tempPassword }
}

export async function archiveClientAction(clientId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    let clientQuery = supabase
        .from('clients')
        .select('id, full_name, email, coach_id')
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    clientQuery = applyClientScope(clientQuery, scope.orgId)
    const { data: client } = await clientQuery.maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    let archiveQuery = supabase
        .from('clients')
        .update({ is_archived: true })
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    archiveQuery = applyClientScope(archiveQuery, scope.orgId)
    const { error } = await archiveQuery

    if (error) return { error: error.message }

    if (client.email) {
        const { data: coach } = await supabase
            .from('coaches')
            .select('full_name, brand_name, slug, invite_code, subscription_tier, primary_color, logo_url')
            .eq('id', coachUser.id)
            .maybeSingle()

        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
        const emailBrand = resolveStudentEmailBranding({
            isStandalone: !scope.orgId && !scope.activeTeamId,
            tier: coach?.subscription_tier,
            logoUrl: coach?.logo_url,
            primaryColor: coach?.primary_color,
        })
        const { subject, html } = buildClientArchivedEmail({
            clientName: client.full_name,
            coachBrandName: coach?.brand_name ?? coach?.full_name ?? 'EVA',
            coachName: coach?.full_name ?? 'Tu entrenador',
            coachEmail: coachUser.email ?? null,
            coachPublicUrl: buildCoachStudentUrl(appUrl, coach),
            logoUrl: emailBrand.logoUrl,
            primaryColor: emailBrand.primaryColor,
        })
        sendTransactionalEmail({ to: client.email, subject, html }).catch(() => null)
    }

    revalidatePath('/coach/clients')
    return {}
}

export async function unarchiveClientAction(clientId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    let clientQuery = supabase
        .from('clients')
        .select('id, full_name, email, coach_id')
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    clientQuery = applyClientScope(clientQuery, scope.orgId)
    const { data: client } = await clientQuery.maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, max_clients, subscription_tier')
        .eq('id', coachUser.id)
        .maybeSingle()

    if (!coach) return { error: 'Coach no encontrado.' }

    const maxClients = coach.max_clients ?? getTierMaxClients((coach.subscription_tier ?? 'starter') as SubscriptionTier)
    let activeCountQuery = supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachUser.id)
        .eq('is_archived', false)
    activeCountQuery = applyClientScope(activeCountQuery, scope.orgId)
    const { count: activeCount } = await activeCountQuery

    if (!scope.isEnterprise && (activeCount ?? 0) >= maxClients) {
        return { error: `Alcanzaste el límite de ${maxClients} alumnos activos. Archiva otro alumno antes de reactivar este.` }
    }

    let unarchiveQuery = supabase
        .from('clients')
        .update({ is_archived: false })
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    unarchiveQuery = applyClientScope(unarchiveQuery, scope.orgId)
    const { error } = await unarchiveQuery

    if (error) return { error: error.message }

    if (client.email) {
        const { data: coachInfo } = await supabase
            .from('coaches')
            .select('full_name, brand_name, slug, invite_code, primary_color, logo_url')
            .eq('id', coachUser.id)
            .maybeSingle()

        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
        const emailBrand = resolveStudentEmailBranding({
            isStandalone: !scope.orgId && !scope.activeTeamId,
            tier: coach.subscription_tier,
            logoUrl: coachInfo?.logo_url,
            primaryColor: coachInfo?.primary_color,
        })
        const { subject, html } = buildClientUnarchivedEmail({
            clientName: client.full_name,
            coachBrandName: coachInfo?.brand_name ?? coachInfo?.full_name ?? 'EVA',
            coachName: coachInfo?.full_name ?? 'Tu entrenador',
            loginUrl: buildCoachStudentUrl(appUrl, coachInfo, '/login'),
            logoUrl: emailBrand.logoUrl,
            primaryColor: emailBrand.primaryColor,
        })
        sendTransactionalEmail({ to: client.email, subject, html }).catch(() => null)
    }

    revalidatePath('/coach/clients')
    return {}
}

const BulkArchiveClientsSchema = z.array(z.guid()).min(1).max(200)

export async function bulkArchiveClientsAction(clientIds: string[]): Promise<{ archived?: number; error?: string }> {
    const parsed = BulkArchiveClientsSchema.safeParse(clientIds)
    if (!parsed.success) return { error: 'Selección de alumnos inválida.' }

    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    let archiveQuery = supabase
        .from('clients')
        .update({ is_archived: true })
        .in('id', parsed.data)
        .eq('coach_id', coachUser.id)
    archiveQuery = applyClientScope(archiveQuery, scope.orgId)
    const { data: archived, error } = await archiveQuery.select('id, full_name, email')

    if (error) return { error: error.message }

    const rows = archived ?? []
    const withEmail = rows.filter((r) => r.email)

    if (withEmail.length > 0) {
        const { data: coach } = await supabase
            .from('coaches')
            .select('full_name, brand_name, slug, invite_code, subscription_tier, primary_color, logo_url')
            .eq('id', coachUser.id)
            .maybeSingle()

        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
        const emailBrand = resolveStudentEmailBranding({
            isStandalone: !scope.orgId && !scope.activeTeamId,
            tier: coach?.subscription_tier,
            logoUrl: coach?.logo_url,
            primaryColor: coach?.primary_color,
        })
        const coachPublicUrl = buildCoachStudentUrl(appUrl, coach)
        void Promise.allSettled(
            withEmail.map((r) => {
                const { subject, html } = buildClientArchivedEmail({
                    clientName: r.full_name,
                    coachBrandName: coach?.brand_name ?? coach?.full_name ?? 'EVA',
                    coachName: coach?.full_name ?? 'Tu entrenador',
                    coachEmail: coachUser.email ?? null,
                    coachPublicUrl,
                    logoUrl: emailBrand.logoUrl,
                    primaryColor: emailBrand.primaryColor,
                })
                return sendTransactionalEmail({ to: r.email!, subject, html })
            })
        )
    }

    revalidatePath('/coach/clients')
    return { archived: rows.length }
}

export async function toggleClientStatusAction(clientId: string, isActive: boolean): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    let statusQuery = supabase
        .from('clients')
        .update({ is_active: isActive })
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    statusQuery = applyClientScope(statusQuery, scope.orgId)
    const { error } = await statusQuery

    if (error) {
        return { error: `Error al actualizar el estado: ${error.message}` }
    }

    revalidatePath('/coach/clients')
    return {}
}
