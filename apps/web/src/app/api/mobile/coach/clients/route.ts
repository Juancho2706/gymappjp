import { NextRequest, NextResponse } from 'next/server'
import { CreateClientSchema } from '@eva/schemas'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Tables } from '@/lib/database.types'
import { getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import {
    buildClientWelcomeEmail,
    buildUpgradeRequiredEmail,
} from '@/lib/email/transactional-templates'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    sanitizePlatformEmail,
} from '@/lib/auth/platform-email'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = CreateClientSchema.safeParse({
        full_name: body?.fullName ?? body?.full_name ?? '',
        email: body?.email ?? '',
        phone: body?.phone ?? '',
        subscription_start_date: body?.subscriptionStartDate ?? body?.subscription_start_date ?? '',
        temp_password: body?.tempPassword ?? body?.temp_password ?? '',
        age_confirmed: body?.ageConfirmed === true || body?.age_confirmed === 'on' ? 'on' : '',
    })

    if (!parsed.success) {
        return NextResponse.json(
            {
                error: 'Datos invalidos.',
                code: 'VALIDATION_ERROR',
                fieldErrors: parsed.error.flatten().fieldErrors,
            },
            { status: 400 }
        )
    }

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const coachUser = userData.user

    if (userError || !coachUser) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    const { data: rawCoachData, error: coachError } = await admin
        .from('coaches')
        .select('id, slug, invite_code, full_name, brand_name, welcome_message, subscription_tier, max_clients, active_org_id')
        .eq('id', coachUser.id)
        .maybeSingle()

    const coach = rawCoachData as Pick<
        Tables<'coaches'>,
        'id' | 'slug' | 'invite_code' | 'full_name' | 'brand_name' | 'welcome_message' | 'subscription_tier' | 'max_clients'
    > & { active_org_id?: string | null } | null

    if (coachError) {
        return NextResponse.json({ error: 'No se pudo cargar el coach.', code: 'COACH_LOAD_FAILED' }, { status: 500 })
    }
    if (!coach) {
        return NextResponse.json({ error: 'Coach no encontrado.', code: 'COACH_NOT_FOUND' }, { status: 404 })
    }

    const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
    const maxClients = coach.max_clients ?? getTierMaxClients(tier)
    const { count: activeClientsCount, error: countError } = await admin
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('is_archived', false)

    if (countError) {
        return NextResponse.json(
            { error: 'No pudimos validar el limite de alumnos de tu plan.', code: 'CLIENT_LIMIT_CHECK_FAILED' },
            { status: 500 }
        )
    }

    if ((activeClientsCount ?? 0) >= maxClients) {
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const { subject, html } = buildUpgradeRequiredEmail({
            coachName: coach.full_name ?? 'Coach',
            brandName: coach.brand_name ?? 'EVA',
            currentLimit: maxClients,
            subscriptionUrl: `${appUrl}/coach/subscription`,
        })
        if (coachUser.email) {
            sendTransactionalEmail({ to: coachUser.email, subject, html }).catch(() => null)
        }

        return NextResponse.json(
            {
                error: `Alcanzaste el limite de ${maxClients} alumnos de tu plan actual.`,
                code: 'UPGRADE_REQUIRED',
                currentLimit: maxClients,
            },
            { status: 402 }
        )
    }

    const emailSan = sanitizePlatformEmail(parsed.data.email)
    const availability = await assertPlatformEmailAvailable(admin, parsed.data.email)
    if (!availability.ok) {
        return NextResponse.json({ error: availability.error, code: 'EMAIL_UNAVAILABLE' }, { status: 409 })
    }

    const { data: newAuthUser, error: authError } = await admin.auth.admin.createUser({
        email: emailSan,
        password: parsed.data.temp_password,
        email_confirm: true,
    })

    if (authError) {
        if (isAuthDuplicateEmailMessage(authError.message)) {
            return NextResponse.json(
                {
                    error: 'Este correo ya esta registrado en la plataforma. Usa otro correo o inicia sesion si ya tienes cuenta.',
                    code: 'EMAIL_UNAVAILABLE',
                },
                { status: 409 }
            )
        }
        return NextResponse.json({ error: `Error al crear el usuario: ${authError.message}`, code: 'AUTH_CREATE_FAILED' }, { status: 500 })
    }

    const { error: dbError } = await admin.from('clients').insert({
        id: newAuthUser.user.id,
        coach_id: coach.id,
        full_name: parsed.data.full_name,
        email: emailSan,
        phone: parsed.data.phone || null,
        subscription_start_date: parsed.data.subscription_start_date || null,
        force_password_change: true,
        age_confirmed_at: new Date().toISOString(),
        ...(coach.active_org_id ? { org_id: coach.active_org_id } : {}),
    })

    if (dbError) {
        await admin.auth.admin.deleteUser(newAuthUser.user.id)
        if (dbError.code === '23505') {
            return NextResponse.json(
                {
                    error: 'Este correo ya esta registrado en la plataforma. Usa otro correo o inicia sesion si ya tienes cuenta.',
                    code: 'EMAIL_UNAVAILABLE',
                },
                { status: 409 }
            )
        }
        return NextResponse.json({ error: 'Error al guardar el alumno en la base de datos.', code: 'CLIENT_INSERT_FAILED' }, { status: 500 })
    }

    if (coach.active_org_id) {
        const { error: assignErr } = await admin.from('coach_client_assignments').insert({
            org_id: coach.active_org_id,
            coach_id: coach.id,
            client_id: newAuthUser.user.id,
            assigned_by: coachUser.id,
        })
        if (assignErr) {
            console.error('Failed to create coach_client_assignment (non-fatal):', assignErr)
        }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
    const publicIdentifier = getCoachPublicIdentifier(coach)
    const loginUrl = appUrl ? `${appUrl}/c/${publicIdentifier}/login` : `https://app.tu-dominio.com/c/${publicIdentifier}/login`
    const welcomeEmail = buildClientWelcomeEmail({
        brandName: coach.brand_name ?? 'EVA',
        coachName: coach.full_name ?? 'Tu entrenador',
        clientName: parsed.data.full_name,
        loginUrl,
        tempPassword: parsed.data.temp_password,
        welcomeMessage: coach.welcome_message,
    })
    const emailResult = await sendTransactionalEmail({
        to: emailSan,
        subject: welcomeEmail.subject,
        html: welcomeEmail.html,
    })
    if (!emailResult.ok) {
        console.error('Welcome email delivery error:', emailResult.error)
    }

    return NextResponse.json({
        ok: true,
        clientName: parsed.data.full_name,
        newClientPhone: parsed.data.phone || null,
        loginUrl,
    })
}
