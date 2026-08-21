'use server'

import { headers } from 'next/headers'
import { z } from 'zod/v4'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rateLimitInviteAccept } from '@/lib/rate-limit'
import { resolveInvite } from '../_lib/resolve-invite'
import { checkJoinCapacity } from '../_lib/join-capacity'
import { resolveJoinReferral } from '../_lib/join-referral'
import { createClientIdentity } from '@/infrastructure/db/client-membership.repository'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'

const JoinSchema = z.object({
    full_name: z.string().min(2).max(120),
    email: z.email(),
    phone: z.string().max(30).optional().or(z.literal('')),
    password: z.string().min(8).max(72),
})

export async function joinViaInviteAction(inviteCode: string, _prev: unknown, formData: FormData) {
    const hdrs = await headers()
    const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const rl = await rateLimitInviteAccept(ip)
    if (!rl.ok) return { error: 'Demasiados intentos. Espera un momento antes de volver a intentar.' }

    const parsed = JoinSchema.safeParse({
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        phone: formData.get('phone') || undefined,
        password: formData.get('password'),
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const admin = createServiceRoleClient()

    // B-7/A.bis2: the code itself decides the scope. An ENTERPRISE code (organization_members
    // .invite_code) creates an org-scoped alumno (org_id set + coach assignment); a TEAM code
    // (teams.invite_code) creates a pool alumno (team_id set, coach = team owner); a STANDALONE
    // code (coaches.invite_code) creates a standalone alumno. Single source of truth.
    const invite = await resolveInvite(admin, inviteCode)
    if (!invite) return { error: 'Código de invitación inválido' }

    // Decisión del owner (2026-08-21): el código standalone ya NO da de alta a nadie — deja una
    // solicitud que el coach acepta o descarta (`requestJoinAction`, tabla `coach_leads`). La UI
    // de `/join` ni siquiera pinta este formulario cuando el scope es standalone; este corte es
    // defensa en profundidad: aunque alguien invoque el action viejo a mano, no crea nada.
    if (invite.scope === 'standalone') {
        return { error: 'Para entrenar con este coach envía una solicitud.' }
    }

    const { data: existing } = await admin
        .from('clients')
        .select('id')
        .eq('email', parsed.data.email)
        .maybeSingle()
    if (existing) return { error: 'Ya existe una cuenta con ese email' }

    // P7 (pricing v2): cerco de verdad — contar activos vs el cupo APLICABLE ANTES de crear
    // auth.user + fila (así no queda usuario huérfano que borrar). enterprise gatea por
    // organizations.client_limit; team no tiene cuota de alumnos (seat_limit es de coaches).
    // La rama standalone del helper quedó inalcanzable desde acá (el corte de arriba la ataja),
    // pero se conserva: el cupo standalone lo sigue necesitando el alta que el coach origina.
    // Fail-closed ante errores.
    const capacity = await checkJoinCapacity(admin, invite)
    if (!capacity.ok) {
        if (capacity.reason === 'limit_reached') {
            return { error: 'Este espacio ya alcanzó su límite de alumnos. Pídele a tu coach que libere un cupo.' }
        }
        return { error: 'No pudimos validar el cupo de alumnos. Intenta de nuevo en unos minutos.' }
    }

    // F6 (workout-share): atribución del alta que llegó por una tarjeta compartida. Los tres
    // parámetros vienen del link (`?ref&src=share_card&k=`) y sobreviven en inputs ocultos del
    // form, así que se validan contra la DB (existe + mismo espacio que el código) ANTES de
    // crear nada: si el helper fallara, el fallo ocurre cuando todavía no hay auth.user que
    // limpiar. Devuelve `null` ante cualquier duda y el alta sigue igual, sin atribución.
    const referral = await resolveJoinReferral(admin, invite, {
        ref: formData.get('ref'),
        src: formData.get('src'),
        k: formData.get('k'),
    })

    const { data: newUser, error: authErr } = await admin.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.full_name },
    })
    if (authErr) return { error: authErr.message }

    const { error: insertErr } = await admin.from('clients').insert({
        id: newUser.user.id,
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        coach_id: invite.coachId,
        org_id: invite.orgId,
        team_id: invite.teamId,
        is_active: true,
        force_password_change: false,
        age_confirmed_at: new Date().toISOString(),
        // Solo el server escribe estas tres columnas (no hay grant UPDATE: nadie las edita
        // después del alta). `...referral` no agrega nada cuando no hubo atribución válida.
        ...(referral ?? {}),
    })

    if (insertErr) {
        await admin.auth.admin.deleteUser(newUser.user.id)
        return { error: insertErr.message }
    }

    // F1: materialize identity (account + membership) with the scope the code resolved to.
    // Non-fatal — reads fall back to the clients row.
    const identity = await createClientIdentity({
        accountId: newUser.user.id,
        clientId: newUser.user.id,
        coachId: invite.coachId,
        orgId: invite.orgId,
        teamId: invite.teamId,
    })
    if (!identity.ok) console.error('createClientIdentity (non-fatal):', identity.error)

    // Enterprise self-signup: record the coach↔client assignment in the org.
    if (invite.scope === 'enterprise') {
        await admin.from('coach_client_assignments').insert({
            org_id: invite.orgId,
            client_id: newUser.user.id,
            coach_id: invite.coachId,
            assigned_by: invite.coachId,
        })
    }

    // F6.3: la métrica que prueba que compartir el entreno TRAE altas. Va al coach (su embudo),
    // solo cuando la fila quedó realmente escrita con atribución.
    //
    // Props mínimas a propósito (Ley 21.719): nada de salud (ni kg, ni músculos, ni ejercicios) y
    // NADA del alumno nuevo — ni su id, ni su email, ni su nombre. Solo quién refirió y con qué
    // preset de tarjeta.
    //
    // Se hace `await` en vez de `after()`: en este repo ya se comprobó en producción que el
    // callback de `after()` puede no ejecutarse (ver lib/meta/capi.ts). El helper nunca lanza y
    // corta a 1,5 s, así que esperarlo no puede romper ni colgar el alta.
    if (referral) {
        await capturePostHogServerEvent({
            event: 'coach_client_referred',
            distinctId: invite.coachId,
            properties: {
                referred_by_client_id: referral.referred_by_client_id,
                card_kind: referral.referral_card_kind,
            },
        })
    }

    return { success: true, loginHref: invite.loginHref }
}
