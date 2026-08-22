'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Tables } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CreateClientSchema, UpdateClientDataSchema } from '@eva/schemas'
import { studentCountLabel, tierMaxClientsFor, type SubscriptionTier } from '@/lib/constants'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import {
    buildClientWelcomeEmail,
    buildClientArchivedEmail,
    buildClientUnarchivedEmail,
} from '@/lib/email/transactional-templates'
import { sendClientLimitReachedEmail } from '@/services/billing/sales-emails.service'
import { resolveStudentEmailBranding } from '@/lib/email/email-brand'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    isEmailTakenReason,
    sanitizePlatformEmail,
    EMAIL_TAKEN_CLIENT_CREATE_ES,
} from '@/lib/auth/platform-email'
import { buildCoachStudentUrl, getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
// F3: single source of truth for coach scope + org filtering (replaces the local copies).
import { resolveCoachScope as getCoachClientScope, applyCoachClientScope } from '@/services/auth/coach-scope.service'
import { createClientIdentity } from '@/infrastructure/db/client-membership.repository'
import { deleteClientHard } from '@/services/client/client-deletion.service'
import {
    archiveClient,
    bulkArchiveClients,
    setClientAccessState,
    unarchiveClient,
    type ClientArchiveWorkspace,
} from '@/services/client/client-archive.service'
import { generateStudentTempPassword } from '@/lib/auth/temp-credentials'

function archiveWorkspaceFromCoachScope(scope: {
    orgId: string | null
    activeTeamId: string | null
    isEnterprise: boolean
}): ClientArchiveWorkspace {
    if (scope.activeTeamId) return { type: 'team', teamId: scope.activeTeamId }
    if (scope.isEnterprise && scope.orgId) return { type: 'enterprise', orgId: scope.orgId }
    return { type: 'standalone' }
}

export type CreateClientState = {
    error?: string
    success?: boolean
    fieldErrors?: Record<string, string[]>
    newClientPhone?: string
    loginUrl?: string
    clientName?: string
    /**
     * Id del alumno recién creado. Lo consume el inbox «Solicitudes» (LeadsInbox) para cerrar el
     * lead con `markLeadConvertedAction(leadId, clientId)` — sin esto el modal no tiene forma de
     * decirle a quien lo abrió a QUÉ ficha corresponde el alta.
     */
    newClientId?: string
    upgradeRequired?: boolean
    currentLimit?: number
    /**
     * Contexto del rechazo por cupo, para el evento `upgrade_gate_hit` del modal (sin PII):
     * `currentTier` = tier del coach al momento del rechazo · `activeCount` = alumnos activos
     * contados por el MISMO query que gateó. Solo vienen cuando `upgradeRequired` es true.
     */
    currentTier?: SubscriptionTier
    activeCount?: number
    /** 'email_taken' ⇒ el modal muestra estado informativo (no error destructivo). */
    code?: 'email_taken'
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
        .select('id, created_at, slug, invite_code, full_name, brand_name, welcome_message, subscription_tier, max_clients, active_org_id, primary_color, logo_url')
        .eq('id', coachUser.id)
        .maybeSingle()

    const coach = rawCoachData as Pick<Tables<'coaches'>, 'id' | 'created_at' | 'slug' | 'invite_code' | 'full_name' | 'brand_name' | 'welcome_message' | 'subscription_tier' | 'max_clients' | 'primary_color' | 'logo_url'> & { active_org_id?: string | null } | null

    if (!coach) return { error: 'Coach no encontrado.' }

    const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
    // Pricing v2 (P2): la columna max_clients SIGUE ganando; el fallback usa el helper con la fecha
    // de creación (grandfather) — nunca el catálogo de venta plano para un coach existente.
    const maxClients = coach.max_clients ?? tierMaxClientsFor(tier, coach.created_at)
    let activeClientsQuery = supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('is_archived', false)
        // Onboarding v2: el alumno de ejemplo NO ocupa cupo (con Free = 1, contarlo dejaría al
        // coach nuevo lleno antes de dar de alta a nadie).
        .eq('is_demo', false)
    activeClientsQuery = applyCoachClientScope(activeClientsQuery, scope)
    const { count: activeClientsCount, error: countError } = await activeClientsQuery

    if (countError) {
        return { error: 'No pudimos validar el límite de alumnos de tu plan.' }
    }
    // Cap del tier personal: solo standalone (enterprise y team pagan centralizado).
    if (!scope.isEnterprise && !scope.activeTeamId && (activeClientsCount ?? 0) >= maxClients) {
        // Correo de VENTA (el CTA de pago ya no puede vivir en la app móvil — compliance de tiendas).
        // `await` a propósito (embudo Free→Pro W0): el helper NUNCA lanza (pinneado por test), así que
        // no puede romper el rechazo; y sin await el envío se pierde al cerrar la request — el mismo
        // patrón fire-and-forget que perdió 2 de 5 bienvenidas el 19-08 (auth/confirm/route.ts).
        await sendClientLimitReachedEmail(createServiceRoleClient(), {
            coachId: coach.id,
            coachEmail: coachUser.email,
            coachName: coach.full_name,
            tier,
            currentLimit: maxClients,
            source: 'web_create',
        })

        return {
            error: `Alcanzaste el límite de ${studentCountLabel(maxClients)} de tu plan actual.`,
            upgradeRequired: true,
            currentLimit: maxClients,
            // Contexto para `upgrade_gate_hit` (el modal lo emite): sin esto el evento no podía
            // decir DESDE qué plan se choca el muro ni con cuántos alumnos.
            currentTier: tier,
            activeCount: activeClientsCount ?? 0,
        }
    }

    // R3 (auditoria 2026-06-11): solo GoTrue Admin API necesita la service key; las queries
    // PostgREST de esta accion pasan RLS del coach y van con el cliente user-scoped `supabase`.
    const authAdmin = createServiceRoleClient()
    const emailSan = sanitizePlatformEmail(parsed.data.email)
    // RPC SECURITY DEFINER con GRANT a authenticated → el cliente user-scoped alcanza.
    const availability = await assertPlatformEmailAvailable(supabase, parsed.data.email)
    if (!availability.ok) {
        if (isEmailTakenReason(availability.reason)) {
            return { error: EMAIL_TAKEN_CLIENT_CREATE_ES, code: 'email_taken' }
        }
        return { error: availability.error }
    }

    const { data: newAuthUser, error: authError } = await authAdmin.auth.admin.createUser({
        email: emailSan,
        password: parsed.data.temp_password,
        email_confirm: true,
    })

    if (authError) {
        if (isAuthDuplicateEmailMessage(authError.message)) {
            return { error: EMAIL_TAKEN_CLIENT_CREATE_ES, code: 'email_taken' }
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
            return { error: EMAIL_TAKEN_CLIENT_CREATE_ES, code: 'email_taken' }
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
        showsEvaBadge: emailBrand.showsEvaBadge,
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
        newClientId: newAuthUser.user.id,
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
    clientQuery = applyCoachClientScope(clientQuery, scope)
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
    updateClientQuery = applyCoachClientScope(updateClientQuery, scope)
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
        .select('id, is_archived')
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
    clientQuery = applyCoachClientScope(clientQuery, scope)
    const { data: client } = await clientQuery.maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }
    if (client.is_archived) return { error: 'Los alumnos archivados son de solo lectura. Desarchívalo para volver a gestionarlo.' }

    // El borrado vive en el service (misma logica que la API movil y que el borrado de cuenta del
    // coach). La rama coach-como-alumno antes usaba el cliente user-scoped (RLS): pasar a service
    // role es equivalente porque el SELECT scoped de arriba ya verifico ownership + org/team scope.
    const { error: deleteError } = await deleteClientHard(createServiceRoleClient(), clientId)
    if (deleteError) return { error: deleteError }

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
    clientQuery = applyCoachClientScope(clientQuery, scope)
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
    resetQuery = applyCoachClientScope(resetQuery, scope)
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

    const result = await archiveClient(createServiceRoleClient(), {
        coachId: coachUser.id,
        workspace: archiveWorkspaceFromCoachScope(scope),
    }, clientId)
    if (!result.ok) return { error: result.error }
    const client = result.client

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
            clientName: client.fullName,
            coachBrandName: coach?.brand_name ?? coach?.full_name ?? 'EVA',
            coachName: coach?.full_name ?? 'Tu entrenador',
            coachEmail: coachUser.email ?? null,
            coachPublicUrl: buildCoachStudentUrl(appUrl, coach),
            logoUrl: emailBrand.logoUrl,
            primaryColor: emailBrand.primaryColor,
            showsEvaBadge: emailBrand.showsEvaBadge,
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

    const result = await unarchiveClient(createServiceRoleClient(), {
        coachId: coachUser.id,
        workspace: archiveWorkspaceFromCoachScope(scope),
    }, clientId)
    if (!result.ok) return { error: result.error }
    const client = result.client

    if (client.email) {
        const { data: coachInfo } = await supabase
            .from('coaches')
            .select('full_name, brand_name, slug, invite_code, subscription_tier, primary_color, logo_url')
            .eq('id', coachUser.id)
            .maybeSingle()

        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
        const emailBrand = resolveStudentEmailBranding({
            isStandalone: !scope.orgId && !scope.activeTeamId,
            tier: coachInfo?.subscription_tier,
            logoUrl: coachInfo?.logo_url,
            primaryColor: coachInfo?.primary_color,
        })
        const { subject, html } = buildClientUnarchivedEmail({
            clientName: client.fullName,
            coachBrandName: coachInfo?.brand_name ?? coachInfo?.full_name ?? 'EVA',
            coachName: coachInfo?.full_name ?? 'Tu entrenador',
            loginUrl: buildCoachStudentUrl(appUrl, coachInfo, '/login'),
            logoUrl: emailBrand.logoUrl,
            primaryColor: emailBrand.primaryColor,
            showsEvaBadge: emailBrand.showsEvaBadge,
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

    const archived = await bulkArchiveClients(createServiceRoleClient(), {
        coachId: coachUser.id,
        workspace: archiveWorkspaceFromCoachScope(scope),
    }, parsed.data)
    if (!archived.ok) return { error: archived.error }

    const rows = archived.clients
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
                    clientName: r.fullName,
                    coachBrandName: coach?.brand_name ?? coach?.full_name ?? 'EVA',
                    coachName: coach?.full_name ?? 'Tu entrenador',
                    coachEmail: coachUser.email ?? null,
                    coachPublicUrl,
                    logoUrl: emailBrand.logoUrl,
                    primaryColor: emailBrand.primaryColor,
                    showsEvaBadge: emailBrand.showsEvaBadge,
                })
                return sendTransactionalEmail({ to: r.email!, subject, html })
            })
        )
    }

    revalidatePath('/coach/clients')
    if (archived.authFailures.length > 0) {
        return {
            archived: rows.length,
            error: `${archived.authFailures.length} alumno(s) quedaron archivados, pero falta sincronizar Auth. Reintenta el archivado para cerrar sus sesiones.`,
        }
    }
    return { archived: rows.length }
}

export async function toggleClientStatusAction(clientId: string, isActive: boolean): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }
    const scope = await getCoachClientScope(supabase, coachUser.id)
    if (!scope.ok) return { error: scope.error }

    const result = await setClientAccessState(createServiceRoleClient(), {
        coachId: coachUser.id,
        workspace: archiveWorkspaceFromCoachScope(scope),
    }, clientId, isActive)
    if (!result.ok) return { error: result.error }

    revalidatePath('/coach/clients')
    return {}
}
