'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { GuidedTaskCards } from '@/app/coach/_components/guided/GuidedTaskCards'
import { applyTemplateAction } from '../../_actions/templates.actions'
import { cardioProfileGapCopy, type CardioProfileGap } from '../_lib/primeras-zonas'

/**
 * Tarea guiada de resistencia: perfil → zonas → semana base (SPEC coach-onboarding-v2 §6, paso 3
 * de la rama `endurance`, W4 F4.3).
 *
 * Las tres tarjetas van EMBEBIDAS arriba del perfil, y las dos primeras se tildan con la señal
 * real —¿hay zonas calculables?—, no con clics. La tercera aplica la plantilla de la semana base
 * con la MISMA acción del vacío template-first (`applyTemplateAction`: allowlist del catálogo y
 * acceso al alumno verificados server-side) y abre el builder, que es donde se ajusta.
 */
export function PrimerasZonasCards({
    coachId,
    clientId,
    clientName,
    hasZones,
    missing,
    templateId,
    templateLabel,
}: {
    coachId: string
    clientId: string
    /** Primer nombre del alumno («Javiera»). `null` = se habla sin sujeto. */
    clientName: string | null
    hasZones: boolean
    missing: readonly CardioProfileGap[]
    /** Id del catálogo (`TEMPLATE_CATALOG.endurance`), resuelto server-side. */
    templateId: string
    templateLabel: string
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const subject = clientName ?? 'tu atleta'

    const apply = () => {
        setError(null)
        startTransition(async () => {
            const result = await applyTemplateAction({ templateId, clientId })
            if (result.ok) {
                router.push(`/coach/builder/${clientId}`)
                return
            }
            setError(
                result.reason === 'not_implemented'
                    ? 'Esa plantilla está en preparación. Puedes armar la semana desde el builder.'
                    : result.error,
            )
        })
    }

    return (
        <div className="space-y-2">
            <GuidedTaskCards
                coachId={coachId}
                surface="cardio_zones"
                eyebrow="Tus primeras zonas"
                title={`Del perfil de ${subject} salen sus zonas y su semana`}
                footnote="Puedes ocultar esta ayuda: no vuelve a aparecer."
                cards={[
                    {
                        id: 'perfil',
                        title: 'Completa su perfil',
                        body: cardioProfileGapCopy(missing),
                        done: missing.length === 0,
                    },
                    {
                        id: 'zonas',
                        title: 'Mira sus zonas',
                        body: hasZones
                            ? 'Z1 a Z5 en bpm, ahí abajo. Es lo que ve el alumno en cada bloque con zona prescrita.'
                            : 'Con la FCmax aparecen las cinco zonas en bpm, justo debajo del perfil.',
                        done: hasZones,
                    },
                    {
                        id: 'semana',
                        title: 'Arma la semana base',
                        body: `«${templateLabel}» se copia a ${subject}: rodajes en Z2, series y un fondo.`,
                        action: {
                            label: 'Armar semana base',
                            tone: 'primary',
                            busy: isPending,
                            icon: <CalendarRange className="size-4" aria-hidden />,
                            onClick: apply,
                        },
                    },
                ]}
            />
            {error ? (
                <p role="status" className="text-[12.5px] font-semibold text-[color:var(--danger-600)]">
                    {error}
                </p>
            ) : null}
        </div>
    )
}
