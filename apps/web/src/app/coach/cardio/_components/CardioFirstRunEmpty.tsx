'use client'

import { HeartPulse, UserPlus } from 'lucide-react'
import { TemplateFirstCta, TemplateFirstEmptyState } from '../../_components/TemplatePicker'

/**
 * Cardio sin NINGÚN perfil cargado todavía (SPEC coach-onboarding-v2 §7, TASKS F3.6).
 *
 * El valor de este módulo aparece recién cuando hay una FC de reposo y una marca de referencia:
 * con eso salen las zonas y los ritmos. Por eso la primera acción es abrir el perfil de alguien,
 * no «explorar la herramienta». El cálculo manual queda abajo, en la propia pantalla, como
 * escape para el coach sin alumnos.
 */
export function CardioFirstRunEmpty({
    demoClientId,
    demoName,
    demoLabel,
    noun,
    firstClientId,
}: {
    demoClientId: string | null
    demoName: string | null
    demoLabel: string
    noun: string
    /** Primer alumno del workspace cuando no hay demo sembrado. */
    firstClientId?: string | null
}) {
    const targetId = demoClientId ?? firstClientId ?? null

    return (
        <TemplateFirstEmptyState
            eyebrow="Tus primeras zonas"
            title={`Calcula las zonas de tu primer ${noun}`}
            description="Con la frecuencia cardíaca de reposo y una marca de 5K salen las cinco zonas y los ritmos de cada una. Si todavía no tienes a quién, abajo está el cálculo manual."
            subject={demoName ? `Empieza con ${demoName}, tu ${demoLabel.toLowerCase()}` : null}
        >
            {targetId ? (
                <TemplateFirstCta
                    // `primera=1`: es la MISMA tarea guiada del paso 3 de la guía (W4 F4.3).
                    href={`/coach/cardio/${targetId}?primera=1`}
                    icon={<HeartPulse className="size-4" aria-hidden />}
                >
                    {demoName ? `Ver las zonas de ${demoName}` : 'Cargar el primer perfil'}
                </TemplateFirstCta>
            ) : (
                <TemplateFirstCta
                    href="/coach/clients?invite=1"
                    icon={<UserPlus className="size-4" aria-hidden />}
                >
                    Invita a tu primer {noun}
                </TemplateFirstCta>
            )}
        </TemplateFirstEmptyState>
    )
}
