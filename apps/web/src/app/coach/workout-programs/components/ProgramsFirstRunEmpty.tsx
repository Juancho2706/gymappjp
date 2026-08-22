'use client'

import type { OnboardingTemplate } from '@eva/onboarding'
import {
    TemplateFirstEmptyState,
    type TemplatePickerClient,
} from '../../_components/TemplatePicker'
import { FirstRoutinePicker } from './FirstRoutinePicker'

/**
 * Biblioteca de programas SIN nada todavía (SPEC coach-onboarding-v2 §7, TASKS F3.6).
 *
 * Reemplaza el «Tu biblioteca está vacía» + botón: el coach nuevo no ve un builder en blanco,
 * ve las plantillas de su rama y a su alumno de ejemplo como sujeto. El escape («Empezar desde
 * cero») sigue llevando al builder de plantillas de siempre.
 */
export function ProgramsFirstRunEmpty({
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
            eyebrow="Tu primera rutina"
            title="Arma tu primera rutina desde una plantilla"
            description={`Elige una, cámbiale lo que quieras y queda lista para asignar a tu ${noun}. No hace falta empezar con la hoja en blanco.`}
            subject={demoName ? `Empieza con ${demoName}, tu ${demoLabel.toLowerCase()}` : null}
            escape={{ href: '/coach/workout-programs/builder', label: 'Empezar desde cero' }}
        >
            <FirstRoutinePicker
                templates={templates}
                clients={clients}
                defaultClientId={demoClientId}
                demoLabel={demoLabel}
                noun={noun}
            />
        </TemplateFirstEmptyState>
    )
}
