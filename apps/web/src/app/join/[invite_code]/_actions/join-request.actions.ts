'use server'

import { headers } from 'next/headers'
import { z } from 'zod/v4'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rateLimitInviteAccept } from '@/lib/rate-limit'
import { resolveInvite } from '../_lib/resolve-invite'
import { resolveJoinReferral } from '../_lib/join-referral'
import { buildLeadContactFilter, leadDedupSince } from '../_lib/lead-dedup'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import { notifyCoachOfLead } from '@/lib/email/coach-lead-notification'

/**
 * `/join/[código]` con invitación STANDALONE ya no da de alta a nadie: deja una SOLICITUD.
 *
 * Decisión del owner (2026-08-21, textual): «el join debería llegarle al WhatsApp del coach, o al
 * correo, no registrarse de una porque cada coach quiere controlar a los estudiantes igual».
 * Revierte el alta directa standalone reabierta el 20-08 (`723b7acb`). Team y org NO se tocan:
 * su autoalta sigue en `joinViaInviteAction`.
 *
 * Este action NO crea `auth.user` ni fila en `clients`. Escribe una fila en `coach_leads` con
 * service_role (la tabla no tiene policy de insert a propósito: un form público con INSERT directo
 * sería spam gratis) y le avisa al coach por correo con botón a WhatsApp.
 */

export type LeadRequestState = {
    error?: string
    success?: true
}

const LeadRequestSchema = z.object({
    full_name: z
        .string()
        .min(2, 'Escribe tu nombre completo.')
        .max(120, 'El nombre es demasiado largo.'),
    // Obligatorio: es el canal por el que el coach responde (la app no mensajea, el contacto real
    // de los coaches de EVA es WhatsApp).
    phone: z
        .string()
        .min(6, 'Escribe tu WhatsApp para que el coach pueda responderte.')
        .max(30, 'El WhatsApp es demasiado largo.'),
    email: z.email('El correo no parece válido.').max(254, 'El correo es demasiado largo.').optional(),
    message: z.string().max(500, 'El mensaje no puede superar los 500 caracteres.').optional(),
})

export async function requestJoinAction(
    inviteCode: string,
    _prev: unknown,
    formData: FormData
): Promise<LeadRequestState> {
    const hdrs = await headers()
    const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const rl = await rateLimitInviteAccept(ip)
    if (!rl.ok) return { error: 'Demasiados intentos. Espera un momento antes de volver a intentar.' }

    // Turnstile — copiado tal cual de `registerAction` (app/(auth)/register/_actions), incluido el
    // camino sin secret: si el proyecto no tiene `TURNSTILE_SECRET_KEY` configurada no se verifica
    // nada (previews/local siguen usables). Ese es el comportamiento vigente del alta de coach y
    // acá no se inventa uno nuevo.
    if (process.env.TURNSTILE_SECRET_KEY) {
        const turnstileToken = formData.get('cf-turnstile-response') as string
        if (!turnstileToken) {
            return { error: 'Verificación de seguridad requerida. Recarga la página e intenta de nuevo.' }
        }
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken }),
        })
        const verifyData = (await verifyRes.json()) as { success: boolean }
        if (!verifyData.success) {
            return { error: 'Verificación de seguridad fallida. Intenta de nuevo.' }
        }
    }

    // Ley 21.719: el consentimiento es previo y explícito. Sin él no se guarda NADA — ni siquiera
    // para "avisarle al coach igual".
    if (!formData.get('consent')) {
        return { error: 'Debes aceptar que el coach reciba tus datos para poder contactarte.' }
    }

    const parsed = LeadRequestSchema.safeParse({
        full_name: readText(formData, 'full_name'),
        phone: readText(formData, 'phone'),
        email: readText(formData, 'email'),
        message: readText(formData, 'message'),
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario.' }

    const admin = createServiceRoleClient()

    const invite = await resolveInvite(admin, inviteCode)
    if (!invite) return { error: 'Código de invitación inválido' }
    // Team/org conservan su autoalta (pre-existente desde julio): ahí el dueño del espacio ya
    // delegó la puerta a propósito. La solicitud es SOLO el camino standalone.
    if (invite.scope !== 'standalone') {
        return { error: 'Este código no admite solicitudes. Usa el formulario de la página.' }
    }

    // F6 (workout-share): la atribución de la tarjeta compartida no se pierde, viaja en el lead y
    // se copia a `clients` recién cuando el coach CONVIERTE la solicitud (antes no hay alumno al
    // que atribuir). El helper valida contra la DB que el `ref` pertenezca al mismo coach y
    // devuelve `null` ante cualquier duda: un referido malo jamás puede costar una solicitud.
    const referral = await resolveJoinReferral(admin, invite, {
        ref: formData.get('ref'),
        src: formData.get('src'),
        k: formData.get('k'),
    })

    // Dedup 7 días: el mismo contacto insistiendo (o haciendo doble submit) no debe multiplicar
    // correos ni la lista del coach. Se responde el MISMO éxito: no se le confirma al emisor que
    // su solicitud ya existía (eso convertiría el form en un oráculo de "quién ya escribió acá").
    const { data: duplicate } = await admin
        .from('coach_leads')
        .select('id')
        .eq('coach_id', invite.coachId)
        .in('status', ['new', 'contacted'])
        .gte('created_at', leadDedupSince())
        .or(buildLeadContactFilter(parsed.data.phone, parsed.data.email))
        .limit(1)
        .maybeSingle()

    if (duplicate) return { success: true }

    const { error: insertErr } = await admin.from('coach_leads').insert({
        coach_id: invite.coachId,
        team_id: null,
        org_id: null,
        full_name: parsed.data.full_name,
        phone: parsed.data.phone,
        email: parsed.data.email ?? null,
        message: parsed.data.message ?? null,
        referred_by_client_id: referral?.referred_by_client_id ?? null,
        referral_source: referral?.referral_source ?? null,
        referral_card_kind: referral?.referral_card_kind ?? null,
    })
    if (insertErr) {
        console.error('[join-request] insert de coach_leads falló')
        return { error: 'No pudimos enviar tu solicitud. Intenta de nuevo en unos minutos.' }
    }

    // Nombre del referente SOLO para el correo (el coach necesita saber de dónde salió el
    // desconocido). Best-effort: si falla, el correo sale con el origen genérico.
    const referrerName = referral ? await readReferrerName(admin, referral.referred_by_client_id) : null

    // Se ESPERA el correo (no `after()`, no fire-and-forget): Vercel congela la invocación al
    // responder y el POST a Resend moriría ahí — medido en producción el 19-08. El helper nunca
    // lanza: si el correo falla, la fila ya está escrita y el coach la ve igual en su panel.
    await notifyCoachOfLead(admin, {
        coachId: invite.coachId,
        brandName: invite.brandName,
        fullName: parsed.data.full_name,
        phone: parsed.data.phone,
        email: parsed.data.email ?? null,
        message: parsed.data.message ?? null,
        referrerName,
    })

    // Métrica del embudo del coach. Props mínimas a propósito (Ley 21.719): NADA del solicitante
    // —ni nombre, ni teléfono, ni correo— y nada de salud. Solo si vino referido y con qué tarjeta.
    await capturePostHogServerEvent({
        event: 'coach_lead_received',
        distinctId: invite.coachId,
        properties: {
            referred: Boolean(referral),
            card_kind: referral?.referral_card_kind ?? null,
            source: referral?.referral_source ?? null,
        },
    })

    // Sin `revalidatePath`: quien escribe es un anónimo y la lista vive en `/coach/clients`, una
    // ruta dinámica por sesión del coach. No hay caché compartida que invalidar desde acá.
    return { success: true }
}

/** FormData → string limpio, o `undefined` si el campo vino vacío (los opcionales no se validan). */
function readText(formData: FormData, key: string): string | undefined {
    const raw = formData.get(key)
    if (typeof raw !== 'string') return undefined
    const trimmed = raw.trim()
    return trimmed ? trimmed : undefined
}

async function readReferrerName(
    admin: ReturnType<typeof createServiceRoleClient>,
    clientId: string
): Promise<string | null> {
    try {
        const { data } = await admin.from('clients').select('full_name').eq('id', clientId).maybeSingle()
        return data?.full_name ?? null
    } catch {
        return null
    }
}
