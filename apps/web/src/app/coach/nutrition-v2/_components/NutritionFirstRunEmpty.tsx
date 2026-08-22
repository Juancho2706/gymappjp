'use client'

import type { OnboardingTemplate } from '@eva/onboarding'
import {
    TemplateFirstEmptyState,
    TemplatePicker,
    type TemplatePickerClient,
} from '../../_components/TemplatePicker'

/**
 * Centro de Nutrición sin NINGÚN plan todavía (SPEC coach-onboarding-v2 §7, TASKS F3.6).
 *
 * Va arriba del roster: la primera pauta sale de una plantilla con porciones e intercambios ya
 * cargados, no de un editor en blanco. El escape es el editor del alumno de ejemplo (o el CTA
 * «Nuevo plan» del encabezado cuando todavía no hay a quién).
 */
export function NutritionFirstRunEmpty({
    templates,
    clients,
    demoClientId,
    demoName,
    demoLabel,
    noun,
}: {
    templates: readonly OnboardingTemplate[]
    clients: readonly TemplatePickerClient[]
    demoClientId: string | null
    demoName: string | null
    demoLabel: string
    noun: string
}) {
    return (
        <TemplateFirstEmptyState
            eyebrow="Tu primera pauta"
            title="Arma tu primera pauta desde una plantilla"
            description={`Porciones e intercambios ya cargados: ajustas lo que haga falta y la publicas. Tu ${noun} la ve en su app al toque.`}
            subject={demoName ? `Empieza con ${demoName}, tu ${demoLabel.toLowerCase()}` : null}
            escape={
                demoClientId
                    ? {
                          // `primera=1`: misma tarea guiada del paso 3 (W4 F4.3). El editor decide
                          // server-side si abre la pauta vigente o una nueva.
                          href: `/coach/nutrition-v2/${demoClientId}/editor?primera=1`,
                          label: 'Empezar desde cero',
                      }
                    : undefined
            }
        >
            <TemplatePicker
                templates={templates}
                clients={clients}
                defaultClientId={demoClientId}
                demoLabel={demoLabel}
                noun={noun}
            />
        </TemplateFirstEmptyState>
    )
}
