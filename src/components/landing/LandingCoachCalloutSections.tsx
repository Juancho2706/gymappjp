'use client'

import { LandingCalloutShowcase } from '@/components/landing/LandingCalloutShowcase'
import {
    DioramaBrand,
    DioramaClients,
    DioramaExercises,
    DioramaNutrition,
    DioramaPrograms,
    DioramaDashboard,
} from '@/components/landing/landing-coach-dioramas'

/** Trazos en viewBox 0 0 100 100: izquierda 3, derecha 3 (índices 0–2 left, 3–5 right) */
const PATHS_DASHBOARD = [
    'M 4 17 L 26 17 L 26 23 L 38 23',
    'M 4 48 L 25 48 L 25 53 L 38 53',
    'M 4 80 L 22 80 L 22 74 L 38 74',
    'M 96 19 L 74 19 L 74 24 L 62 24',
    'M 96 49 L 73 49 L 73 54 L 62 54',
    'M 96 78 L 76 78 L 76 72 L 62 72',
]

const PATHS_CLIENTS = [
    'M 5 20 L 28 20 L 28 26 L 38 26',
    'M 5 50 L 24 50 L 24 55 L 38 55',
    'M 5 78 L 26 78 L 26 73 L 38 73',
    'M 95 22 L 72 22 L 72 28 L 62 28',
    'M 95 50 L 71 50 L 71 56 L 62 56',
    'M 95 77 L 75 77 L 75 71 L 62 71',
]

const PATHS_PROGRAMS = PATHS_DASHBOARD
const PATHS_EXERCISES = PATHS_CLIENTS
const PATHS_NUTRITION = PATHS_DASHBOARD
const PATHS_BRAND = PATHS_CLIENTS

export function LandingCoachCalloutSections() {
    return (
        <div id="panel-coach" className="w-full scroll-mt-28">
            <LandingCalloutShowcase
                eyebrowKey="landing.coachSection.dashboard.eyebrow"
                titleKey="landing.coachSection.dashboard.title"
                left={[
                    { titleKey: 'landing.coachCallout.dashboard.mrr.title', bodyKey: 'landing.coachCallout.dashboard.mrr.body' },
                    { titleKey: 'landing.coachCallout.dashboard.clients.title', bodyKey: 'landing.coachCallout.dashboard.clients.body' },
                    { titleKey: 'landing.coachCallout.dashboard.alerts.title', bodyKey: 'landing.coachCallout.dashboard.alerts.body' },
                ]}
                right={[
                    { titleKey: 'landing.coachCallout.dashboard.adherence.title', bodyKey: 'landing.coachCallout.dashboard.adherence.body' },
                    { titleKey: 'landing.coachCallout.dashboard.nutrition.title', bodyKey: 'landing.coachCallout.dashboard.nutrition.body' },
                    { titleKey: 'landing.coachCallout.dashboard.control.title', bodyKey: 'landing.coachCallout.dashboard.control.body' },
                ]}
                svgPaths={PATHS_DASHBOARD}
            >
                <DioramaDashboard />
            </LandingCalloutShowcase>

            <LandingCalloutShowcase
                className="!bg-background"
                eyebrowKey="landing.coachSection.clients.eyebrow"
                titleKey="landing.coachSection.clients.title"
                left={[
                    { titleKey: 'landing.coachCallout.clients.directory.title', bodyKey: 'landing.coachCallout.clients.directory.body' },
                    { titleKey: 'landing.coachCallout.clients.pulse.title', bodyKey: 'landing.coachCallout.clients.pulse.body' },
                    { titleKey: 'landing.coachCallout.clients.program.title', bodyKey: 'landing.coachCallout.clients.program.body' },
                ]}
                right={[
                    { titleKey: 'landing.coachCallout.clients.link.title', bodyKey: 'landing.coachCallout.clients.link.body' },
                    { titleKey: 'landing.coachCallout.clients.onboard.title', bodyKey: 'landing.coachCallout.clients.onboard.body' },
                    { titleKey: 'landing.coachCallout.clients.detail.title', bodyKey: 'landing.coachCallout.clients.detail.body' },
                ]}
                svgPaths={PATHS_CLIENTS}
            >
                <DioramaClients />
            </LandingCalloutShowcase>

            <LandingCalloutShowcase
                eyebrowKey="landing.coachSection.programs.eyebrow"
                titleKey="landing.coachSection.programs.title"
                left={[
                    { titleKey: 'landing.coachCallout.programs.library.title', bodyKey: 'landing.coachCallout.programs.library.body' },
                    { titleKey: 'landing.coachCallout.programs.assign.title', bodyKey: 'landing.coachCallout.programs.assign.body' },
                    { titleKey: 'landing.coachCallout.programs.builder.title', bodyKey: 'landing.coachCallout.programs.builder.body' },
                ]}
                right={[
                    { titleKey: 'landing.coachCallout.programs.weeks.title', bodyKey: 'landing.coachCallout.programs.weeks.body' },
                    { titleKey: 'landing.coachCallout.programs.templates.title', bodyKey: 'landing.coachCallout.programs.templates.body' },
                    { titleKey: 'landing.coachCallout.programs.cta.title', bodyKey: 'landing.coachCallout.programs.cta.body' },
                ]}
                svgPaths={PATHS_PROGRAMS}
            >
                <DioramaPrograms />
            </LandingCalloutShowcase>

            <LandingCalloutShowcase
                className="!bg-background"
                eyebrowKey="landing.coachSection.exercises.eyebrow"
                titleKey="landing.coachSection.exercises.title"
                left={[
                    { titleKey: 'landing.coachCallout.exercises.catalog.title', bodyKey: 'landing.coachCallout.exercises.catalog.body' },
                    { titleKey: 'landing.coachCallout.exercises.gif.title', bodyKey: 'landing.coachCallout.exercises.gif.body' },
                    { titleKey: 'landing.coachCallout.exercises.custom.title', bodyKey: 'landing.coachCallout.exercises.custom.body' },
                ]}
                right={[
                    { titleKey: 'landing.coachCallout.exercises.groups.title', bodyKey: 'landing.coachCallout.exercises.groups.body' },
                    { titleKey: 'landing.coachCallout.exercises.builder.title', bodyKey: 'landing.coachCallout.exercises.builder.body' },
                    { titleKey: 'landing.coachCallout.exercises.coach.title', bodyKey: 'landing.coachCallout.exercises.coach.body' },
                ]}
                svgPaths={PATHS_EXERCISES}
            >
                <DioramaExercises />
            </LandingCalloutShowcase>

            <LandingCalloutShowcase
                eyebrowKey="landing.coachSection.nutrition.eyebrow"
                titleKey="landing.coachSection.nutrition.title"
                left={[
                    { titleKey: 'landing.coachCallout.nutrition.plans.title', bodyKey: 'landing.coachCallout.nutrition.plans.body' },
                    { titleKey: 'landing.coachCallout.nutrition.track.title', bodyKey: 'landing.coachCallout.nutrition.track.body' },
                    { titleKey: 'landing.coachCallout.nutrition.macros.title', bodyKey: 'landing.coachCallout.nutrition.macros.body' },
                ]}
                right={[
                    { titleKey: 'landing.coachCallout.nutrition.tier.title', bodyKey: 'landing.coachCallout.nutrition.tier.body' },
                    { titleKey: 'landing.coachCallout.nutrition.templates.title', bodyKey: 'landing.coachCallout.nutrition.templates.body' },
                    { titleKey: 'landing.coachCallout.nutrition.client.title', bodyKey: 'landing.coachCallout.nutrition.client.body' },
                ]}
                svgPaths={PATHS_NUTRITION}
            >
                <DioramaNutrition />
            </LandingCalloutShowcase>

            <LandingCalloutShowcase
                className="!bg-background"
                eyebrowKey="landing.coachSection.brand.eyebrow"
                titleKey="landing.coachSection.brand.title"
                left={[
                    { titleKey: 'landing.coachCallout.brand.logo.title', bodyKey: 'landing.coachCallout.brand.logo.body' },
                    { titleKey: 'landing.coachCallout.brand.color.title', bodyKey: 'landing.coachCallout.brand.color.body' },
                    { titleKey: 'landing.coachCallout.brand.url.title', bodyKey: 'landing.coachCallout.brand.url.body' },
                ]}
                right={[
                    { titleKey: 'landing.coachCallout.brand.pwa.title', bodyKey: 'landing.coachCallout.brand.pwa.body' },
                    { titleKey: 'landing.coachCallout.brand.student.title', bodyKey: 'landing.coachCallout.brand.student.body' },
                    { titleKey: 'landing.coachCallout.brand.welcome.title', bodyKey: 'landing.coachCallout.brand.welcome.body' },
                ]}
                svgPaths={PATHS_BRAND}
            >
                <DioramaBrand />
            </LandingCalloutShowcase>
        </div>
    )
}
