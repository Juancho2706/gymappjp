import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CoachClientsShell } from './CoachClientsShell'
import { LeadsInbox } from './LeadsInbox'
import type { Metadata } from 'next'
import { getCoach } from '@/lib/coach/get-coach'
import { getCoachClientsWithPrograms, getCoachClientsPulse } from './_data/clients.queries'
import { getCoachLeads } from './_data/leads.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { createClient } from '@/lib/supabase/server'
import { getCoachOnboardingEmptyContext } from '../_data/onboarding-empty.queries'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
import { showsEvaBadge, type SubscriptionTier } from '@/lib/constants'
import { BRAND_PRIMARY_COLOR } from '@/lib/brand-assets'
import { countRealClients } from './_lib/add-student-invite'
import type { AddStudentFlowConfig } from './_components/add-student-flow-context'
import { parseStatusDirectoryFilter } from './directory-types'

export const metadata: Metadata = {
    title: 'Alumnos',
}

export default async function CoachClientsPage({
    searchParams,
}: {
    // `?solicitudes=1` — lo pone el CTA «Ver solicitudes» del correo que avisa una solicitud nueva.
    // `?invite=1` — destino del paso 4 de la guía (`@eva/onboarding`, WEB.invite): abre el alta
    // guiada de 3 pasos. `?alta=1` es su alias.
    // `?status=archived` — deep link al directorio ya filtrado (los archivados NO salen en la
    // vista por defecto, así que sin esto el link llegaba a una lista donde el alumno no está).
    searchParams: Promise<{ solicitudes?: string; invite?: string; alta?: string; status?: string }>
}) {
    const coachSession = await getCoach()
    if (!coachSession) redirect('/login')

    const workspace = await getPreferredWorkspaceForRender(coachSession.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    // El acceso a Funciones (`/coach/settings/funciones`) vive en «Más» / el hub de ajustes: el
    // directorio de alumnos ya no lo repite (QA owner 01-09), así que esta pantalla tampoco
    // resuelve el gate de módulos.
    const supabase = await createClient()

    const [clients, headersList, pulse, leads, params, onboarding, authUser] = await Promise.all([
        getCoachClientsWithPrograms(coachSession.id, { orgId, activeTeamId }),
        headers(),
        getCoachClientsPulse(coachSession.id, { orgId, activeTeamId }),
        // Solicitudes del `/join` standalone (coach_leads). Lectura RLS con el cliente del usuario.
        getCoachLeads(coachSession.id),
        searchParams,
        // Persona del coach: da el sustantivo de la etiqueta del alumno de ejemplo
        // («Alumno/Paciente/Atleta de ejemplo», onboarding v2 F3.7). Memoizado por request.
        getCoachOnboardingEmptyContext(),
        // Correo del coach para el aviso de auto-alta («Vive tu app» directo §5): la tabla
        // `coaches` NO lo guarda, así que sale de la sesión. Va en el mismo `Promise.all` para no
        // sumar un round-trip serie a la página del directorio.
        supabase.auth.getUser(),
    ])

    const coach = { slug: coachSession.slug, invite_code: coachSession.invite_code }
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const appUrl = `${protocol}://${host}`

    // Desktop = full-bleed (sin cap de ancho ni space-y: el master-detail/tabla llena la región).
    // Móvil conserva el cap + el espaciado war-room/directorio + margen inferior para la cápsula.
    // Alta guiada «Sumar un {alumno} en 3 pasos» (onboarding v2 F4.1). Todo sale de datos que la
    // página YA leyó: cero queries nuevas. El programa del alumno de ejemplo es «lo que ya tienes
    // armado» que se le muestra al coach en la tercera columna.
    const demoClient = clients.find((c) => c.is_demo === true)
    const demoProgram =
        demoClient?.workout_programs?.find((p) => p.is_active)?.name ??
        demoClient?.workout_programs?.[0]?.name ??
        null
    const addStudentFlow: AddStudentFlowConfig = {
        persona: onboarding.effectivePersona,
        inviteCode: getCoachPublicIdentifier(coach),
        brand: {
            name: coachSession.brand_name || coachSession.full_name || 'Tu marca',
            logoUrl: coachSession.logo_url ?? null,
            primaryColor: coachSession.primary_color || BRAND_PRIMARY_COLOR,
            showsEvaBadge: showsEvaBadge((coachSession.subscription_tier ?? 'free') as SubscriptionTier),
        },
        firstContent: { programName: demoProgram, demoName: onboarding.demoName },
        realClientCount: countRealClients(clients),
        autoOpenGuided: params.invite === '1' || params.alta === '1',
        coachEmail: authUser.data.user?.email ?? null,
        // «No gasta cupo.» solo donde es verdad: Free standalone CON alumno de ejemplo. Fuera de
        // Free el remate sobra, y a un coach administrado (team/org) el link del demo le responde
        // 403 — la frase mentiría.
        showsCupo:
            (coachSession.subscription_tier ?? 'free') === 'free' &&
            !orgId &&
            !activeTeamId &&
            demoClient != null,
    }

    return (
        <div className="mx-auto w-full min-w-0 animate-fade-in max-w-[1600px] space-y-12 mb-24 md:mb-0 md:max-w-none md:space-y-0">
            {/* Inbox de solicitudes: SOLO si hay pendientes — un bloque vacío permanente sobre el
                roster sería ruido diario para el coach que no recibe ninguna. */}
            {leads.length > 0 ? (
                <div className="px-4 md:px-6 md:pt-6 md:pb-4">
                    <LeadsInbox
                        leads={leads}
                        brandName={coachSession.brand_name || coachSession.full_name || 'tu coach'}
                        autoOpen={params.solicitudes === '1'}
                    />
                </div>
            ) : null}
            <CoachClientsShell
                clients={clients}
                coach={coach}
                appUrl={appUrl}
                pulse={pulse}
                demoLabel={onboarding.demoLabel}
                addStudentFlow={addStudentFlow}
                initialStatusFilter={parseStatusDirectoryFilter(params.status)}
            />
        </div>
    )
}
