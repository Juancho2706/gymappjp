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
import {
    applyOperatorKillSwitch,
    getCoachEnabledModules,
    getTeamEnabledModules,
} from '@/services/entitlements.service'
import { getCoachOnboardingEmptyContext } from '../_data/onboarding-empty.queries'

export const metadata: Metadata = {
    title: 'Alumnos | EVA',
}

export default async function CoachClientsPage({
    searchParams,
}: {
    // `?solicitudes=1` — lo pone el CTA «Ver solicitudes» del correo que avisa una solicitud nueva.
    searchParams: Promise<{ solicitudes?: string }>
}) {
    const coachSession = await getCoach()
    if (!coachSession) redirect('/login')

    const workspace = await getPreferredWorkspaceForRender(coachSession.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    // Acceso a Herramientas (hub /coach/tools) — MISMO gate que el sidebar y las páginas de
    // módulo: enabled_modules del contexto activo (team manda; standalone usa los flags del
    // coach; enterprise v1 ⇒ ninguno) + kill-switch de operador. Solo se muestra el acceso si
    // ≥1 de los módulos del hub (cardio/movimiento/composición) está activo.
    const supabase = await createClient()
    const resolveToolsEnabled = async (): Promise<boolean> => {
        if (workspace?.type === 'enterprise_coach') return false
        const raw = activeTeamId
            ? await getTeamEnabledModules(supabase, activeTeamId)
            : await getCoachEnabledModules(supabase, coachSession.id)
        const modules = applyOperatorKillSwitch(raw)
        return (
            modules.cardio === true ||
            modules.movement_assessment === true ||
            modules.body_composition === true
        )
    }

    const [clients, headersList, pulse, toolsEnabled, leads, params, onboarding] = await Promise.all([
        getCoachClientsWithPrograms(coachSession.id, { orgId, activeTeamId }),
        headers(),
        getCoachClientsPulse(coachSession.id, { orgId, activeTeamId }),
        resolveToolsEnabled(),
        // Solicitudes del `/join` standalone (coach_leads). Lectura RLS con el cliente del usuario.
        getCoachLeads(coachSession.id),
        searchParams,
        // Persona del coach: da el sustantivo de la etiqueta del alumno de ejemplo
        // («Alumno/Paciente/Atleta de ejemplo», onboarding v2 F3.7). Memoizado por request.
        getCoachOnboardingEmptyContext(),
    ])

    const coach = { slug: coachSession.slug, invite_code: coachSession.invite_code }
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const appUrl = `${protocol}://${host}`

    // Desktop = full-bleed (sin cap de ancho ni space-y: el master-detail/tabla llena la región).
    // Móvil conserva el cap + el espaciado war-room/directorio + margen inferior para la cápsula.
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
                toolsEnabled={toolsEnabled}
                demoLabel={onboarding.demoLabel}
            />
        </div>
    )
}
