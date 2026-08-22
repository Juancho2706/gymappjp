'use client'

import { ClipboardList, UserPlus } from 'lucide-react'
import { TemplateFirstCta, TemplateFirstEmptyState } from '../../_components/TemplatePicker'

/**
 * Movimiento sin NINGÚN screening todavía (SPEC coach-onboarding-v2 §7, TASKS F3.6).
 *
 * Acá la primera acción no es clonar una plantilla sino EVALUAR: del screening de 7 patrones
 * sale la pauta domiciliaria. Con alumno de ejemplo sembrado, el sujeto es él; sin alumnos, la
 * única acción posible es invitar al primero y así se dice.
 */
export function MovementFirstRunEmpty({
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
    /** Primer alumno del workspace cuando no hay demo: el screening necesita un sujeto. */
    firstClientId?: string | null
}) {
    const targetId = demoClientId ?? firstClientId ?? null

    return (
        <TemplateFirstEmptyState
            eyebrow="Tu primer screening"
            title="Haz tu primer screening de 7 patrones"
            description={`Puntúas los 7 patrones con semáforo y en la misma pantalla queda el riesgo por patrón. De ahí sale la pauta para la casa de tu ${noun}.`}
            subject={demoName ? `Empieza con ${demoName}, tu ${demoLabel.toLowerCase()}` : null}
        >
            {targetId ? (
                <TemplateFirstCta
                    // `primera=1`: es la MISMA tarea guiada del paso 3 de la guía (W4 F4.3).
                    href={`/coach/movement/${targetId}/new?primera=1`}
                    icon={<ClipboardList className="size-4" aria-hidden />}
                >
                    {demoName ? `Evaluar a ${demoName}` : 'Evaluar al primero'}
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
