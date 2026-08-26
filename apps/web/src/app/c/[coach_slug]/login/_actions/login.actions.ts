'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { redirect } from 'next/navigation'
import { ClientLoginSchema, ChangePasswordSchema, passwordRejectionMessage } from '@eva/schemas'
import type { Tables } from '@/lib/database.types'
import type { WorkspaceSummary } from '@/domain/auth/types'
import { setLastWorkspace } from '@/services/auth/workspace.service'
import { getClientBasePath } from '@/lib/client/base-path'
import { recordStudentFirstLogin } from '@/services/client/student-login-signal.service'
import {
    COACH_ACCOUNT_ACTION,
    coachAccountMessage,
    type StudentLoginAction,
} from '@/lib/auth/student-login-messages'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'

type Coach = Tables<'coaches'>
type Client = Tables<'clients'>

export type ClientLoginState = {
    error?: string
    success?: boolean
    redirectUrl?: string
    /** Discrimina el error para que el form pueda tratarlo distinto («Vive tu app» directo §4). */
    kind?: 'coach_account'
    /** Salida acompañando al mensaje: el form la pinta como link. */
    action?: StudentLoginAction
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

    // R3 (auditoria 2026-06-11, corregido 2026-08-26): las lecturas de `coaches` y `clients` de
    // acá pasan RLS del usuario recien logueado (coaches tiene SELECT publico y self; clients
    // permite self) → cliente user-scoped. El UNICO service_role del archivo es el de
    // `organization_members` mas abajo, acotado a la verificacion org+coach+activo.

    // «Vive tu app» directo §4 (D4 = B): el coach que entra con SU cuenta al login de sus alumnos
    // no es un extraño. Va ANTES de resolver el slug a proposito — con el slug de OTRO coach, la
    // rama `!coach` de abajo lo despachaba con «Coach no encontrado.», que es el mismo callejon.
    // Se cierra la sesion (local: solo este dispositivo) porque este login no tiene fail-counter,
    // turnstile ni jitter; dejarla abierta lo convertiria en un segundo login de coach sin defensas.
    const { data: selfCoachData, error: selfCoachError } = await supabase
        .from('coaches')
        .select('id, persona, slug, invite_code')
        .eq('id', user.id)
        .maybeSingle()

    if (selfCoachError) {
        console.error('[LoginAction] Error checking coach account:', selfCoachError)
    }

    const selfCoach = selfCoachData as Pick<Coach, 'id' | 'persona' | 'slug' | 'invite_code'> | null

    const INVITE_CODE_RE = /^[A-Z2-9]{5}$/

    if (selfCoach) {
        await supabase.auth.signOut({ scope: 'local' })
        // `own_slug` sale de comparar contra el propio identificador del coach: saber si llegó a su
        // marca o a la de otro cambia el diagnostico y no cuesta una query extra. Sin correo ni slug
        // en las props (regla 5 de la SPEC: la analitica no lleva PII).
        await capturePostHogServerEvent({
            event: 'student_login_coach_account',
            distinctId: selfCoach.id,
            properties: {
                surface: 'web',
                own_slug: INVITE_CODE_RE.test(coach_slug)
                    ? selfCoach.invite_code === coach_slug
                    : selfCoach.slug === coach_slug,
            },
        })
        return {
            kind: 'coach_account',
            error: coachAccountMessage(selfCoach.persona),
            action: COACH_ACCOUNT_ACTION,
        }
    }

    const coachQuery = supabase.from('coaches').select('id')
    const { data: coachData, error: coachError } = await (
        INVITE_CODE_RE.test(coach_slug)
            ? coachQuery.eq('invite_code', coach_slug).maybeSingle()
            : coachQuery.eq('slug', coach_slug).maybeSingle()
    )

    if (coachError) {
        console.error('[LoginAction] Error fetching coach:', coachError)
    }

    const coach = coachData as Pick<Coach, 'id'> | null

    if (!coach) {
        await supabase.auth.signOut({ scope: 'local' })
        return { error: 'Coach no encontrado.' }
    }

    const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, force_password_change, is_active, is_archived, coach_id, org_id')
        .eq('id', user.id)
        .maybeSingle()

    if (clientError) {
        console.error('[LoginAction] Error fetching client:', clientError)
    }

    type ClientRow = Pick<Client, 'id' | 'force_password_change' | 'is_active' | 'is_archived'> & { coach_id?: string | null; org_id?: string | null }
    const rawClient = clientData as ClientRow | null

    let client: Pick<Client, 'id' | 'force_password_change' | 'is_active' | 'is_archived'> | null = null
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
            // R2 (auditoria 2026-06-11): el alumno NO tiene lectura RLS sobre organization_members
            // y rawAdmin corre con la sesion del alumno recien creada => esta rama (entrar por el
            // slug de OTRO coach de su misma org) devolvia siempre null. Service role REAL,
            // acotado a la verificacion exacta org+coach+activo.
            const serviceDb = createServiceRoleClient()
            const { data: orgMember } = await serviceDb
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
        // `scope: 'local'` (SPEC §4): el alcance global deslogueaba al alumno en TODOS sus
        // dispositivos por equivocarse de slug.
        await supabase.auth.signOut({ scope: 'local' })
        return { error: 'No tienes acceso a esta plataforma.' }
    }

    // V3.13 / FCN W1.4: la señal de la North Star se sella ANTES de cualquier redirect — también el
    // alumno pausado que logra loguearse ENTRÓ. El servicio exige service_role a propósito (la columna
    // es default-deny por columna: este action user-scoped no podría escribirla), nunca lanza, y se
    // ESPERA — una promesa flotante se pierde cuando Vercel congela la invocación al responder
    // (SPEC §5 regla 3). El id es la PK de `clients`, no el uid de auth.
    await recordStudentFirstLogin(createServiceRoleClient(), client.id)

    // Alumno pausado o archivado: NO se cierra la sesion. Entra y aterriza en la pantalla de cuenta
    // suspendida, que explica el estado con la marca de su coach/equipo y ofrece el contacto. Cerrar
    // sesion con un texto de error lo dejaba sin ningun camino; el proxy ya sirve esa misma pantalla
    // para el resto del arbol /c, asi que este era el unico punto de entrada que faltaba.
    if (client.is_active === false || client.is_archived === true) {
        const suspendedBase = await getClientBasePath(coach_slug)
        const reason = client.is_archived === true ? 'archived' : 'paused'
        return { success: true, redirectUrl: `${suspendedBase}/suspended?reason=${reason}` }
    }

    if (matchedWorkspace) {
        await setLastWorkspace(supabase, matchedWorkspace)
    }

    // Mismo criterio que la rama `suspended` de arriba: el base path real (el alumno de pool/team
    // vive bajo `/t/[team_slug]`), no `/c` hardcodeado, que lo volcaba a la marca personal del coach.
    const base = await getClientBasePath(coach_slug)
    const redirectUrl = client.force_password_change
        ? `${base}/change-password`
        : `${base}/dashboard`

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
    if (authError) {
        return {
            error: passwordRejectionMessage(authError)
                ?? 'No se pudo guardar la contraseña. Intenta de nuevo en unos minutos.',
        }
    }

    // UPDATE self: la policy "Client can update their own profile" lo cubre → user-scoped.
    await supabase
        .from('clients')
        .update({ force_password_change: false })
        .eq('id', user.id)

    // Respeta el base path real del alumno (pool/team → /t/[team_slug]) en vez de
    // hardcodear /c, que volcaria a un alumno de team a la marca personal del coach.
    redirect(`${await getClientBasePath(coach_slug)}/dashboard`)
}
