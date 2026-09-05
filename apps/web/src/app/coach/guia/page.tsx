import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import type { Json } from '@/lib/database.types'
import { getCoach } from '@/lib/coach/get-coach'
import { parseSubscriptionTier, showsEvaBadge } from '@eva/tiers'
import { getCoachOnboardingV2Data } from '../dashboard/_data/dashboard.queries'
import { parseOnboardingGuide } from '../dashboard/_lib/onboarding-guide-state'
import { GuideScreen } from './_components/GuideScreen'
import { PanelListoModal } from './_components/PanelListoModal'
import { RegistrationMirror } from '../_components/RegistrationMirror'

export const metadata: Metadata = { title: 'Tus primeros pasos' }

/**
 * `/coach/guia` — «Tus primeros pasos», la guía de inicio en su PANTALLA PROPIA.
 *
 * Decisión del owner (22-08) que manda sobre SPEC §Diseño v2 («guía arriba del dashboard», D5=A):
 * el dashboard del día 1 se ve LLENO y la guía se muda acá. En el dashboard queda solo la píldora
 * flotante (`components/coach/GuidePill.tsx`), y TODO coach —Free, Pro, Elite o lo que sea— aterriza
 * en esta pantalla en su PRIMERA entrada al panel (el redirect vive en `coach/dashboard/page.tsx`
 * con el resolver puro `shouldRedirectToGuide`).
 *
 * No duplica ninguna señal: reusa `getCoachOnboardingV2Data`, el mismo lote de consultas que
 * alimentaba la guía cuando vivía en el dashboard (marca, «vive tu app», artefacto por persona,
 * alumno real, actividad real). El dashboard ya NO lo pide: la consulta se mudó con la guía.
 */

/** Misma referencia entre renders RSC para no re-disparar la hidratación del hook con un `{}` nuevo. */
const DEFAULT_COACH_ONBOARDING_GUIDE: Json = {}

export default async function CoachGuiaPage({
    searchParams,
}: {
    /**
     * `?bienvenida=1` — lo pone la pantalla de persona: banda de bienvenida en vez de modal.
     * `?welcome=free&eid=` — espejo browser del alta por Google (Meta + PostHog), reenviado por la
     * pantalla de persona; se dispara una vez y se limpia de la URL.
     * `?panel_listo=1` — one-shot del modal «Tu panel quedó listo 💪»: lo pone la pantalla de
     * persona SOLO cuando la elección apagó dominios, y el propio modal lo limpia al cerrarse.
     */
    searchParams: Promise<{ bienvenida?: string; welcome?: string; eid?: string; panel_listo?: string }>
}) {
    const [coach, params] = await Promise.all([getCoach(), searchParams])
    if (!coach) redirect('/login')

    // Coach administrado por org/team: la guía de inicio no es suya (su panel lo define el tenant),
    // igual que el gate de persona. Se lo manda al panel en vez de mostrarle pasos que no aplican.
    if (coach.subscription_status === 'org_managed' || coach.subscription_status === 'team_managed') {
        redirect('/coach/dashboard')
    }

    const onboarding = await getCoachOnboardingV2Data(coach.id)
    const tier = parseSubscriptionTier(coach.subscription_tier)
    const guide = parseOnboardingGuide(coach.onboarding_guide)

    const registrationEid =
        params.welcome === 'free' && typeof params.eid === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(params.eid)
            ? params.eid
            : null

    return (
        <>
            {registrationEid ? <RegistrationMirror eid={registrationEid} /> : null}
            {/* El modal del panel achicado solo aparece con el param que pone la pantalla de
                persona y con una persona ya elegida (el coach viejo sin persona no eligió nada que
                explicar). Si la elección no apagó ningún dominio, el propio modal se borra solo. */}
            {params.panel_listo === '1' && onboarding.persona !== null ? (
                <PanelListoModal persona={onboarding.persona} alsoOther={onboarding.personaAlsoOther} />
            ) : null}
        <GuideScreen
            coachId={coach.id}
            firstName={(coach.full_name ?? coach.brand_name ?? 'Coach').split(' ')[0] || 'Coach'}
            persona={onboarding.persona}
            demo={onboarding.demo}
            brand={onboarding.brand}
            needsBrand={onboarding.needsBrand}
            showsEvaBadge={showsEvaBadge(tier)}
            signals={onboarding.signals}
            initialGuide={coach.onboarding_guide ?? DEFAULT_COACH_ONBOARDING_GUIDE}
            guideSeenAt={guide.guideSeenAt}
            welcome={params.bienvenida === '1'}
        />
        </>
    )
}
