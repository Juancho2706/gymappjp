'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dumbbell } from 'lucide-react'
import { GuidedTaskCards } from '@/app/coach/_components/guided/GuidedTaskCards'
import { applyTemplateAction } from '../../_actions/templates.actions'

/**
 * Cierre de la tarea guiada de rehabilitación: el screening ya está, el semáforo se ve arriba y lo
 * que sigue es la PAUTA PARA LA CASA (SPEC coach-onboarding-v2 §6, paso 3 de la rama `rehab`).
 *
 * La plantilla se aplica con la MISMA acción del vacío template-first (`applyTemplateAction`:
 * allowlist del catálogo + acceso al alumno verificado server-side + `service_role` encerrado en
 * el módulo). Acá no hay ninguna autorización: la UI solo pide.
 *
 * Al terminar abre el builder del alumno, que es donde el coach ajusta lo clonado. El coach nunca
 * ve un lienzo en blanco: llega con la pauta ya puesta.
 */
export function PautaDomiciliariaCta({
    coachId,
    clientId,
    clientName,
    templateId,
    templateLabel,
}: {
    coachId: string
    clientId: string
    /** Primer nombre del alumno («Pedro»). `null` = se habla sin sujeto. */
    clientName: string | null
    /** Id del catálogo (`TEMPLATE_CATALOG.rehab`), resuelto server-side. */
    templateId: string
    templateLabel: string
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const subject = clientName ?? 'tu paciente'

    const apply = () => {
        setError(null)
        startTransition(async () => {
            const result = await applyTemplateAction({ templateId, clientId })
            if (result.ok) {
                // Sin `programId` el builder abría en blanco aunque la plantilla ya estaba aplicada
                // (QA del owner 22-08): se abre SOBRE el programa recién creado, en modo guiado.
                const query = result.programId
                    ? `?programId=${encodeURIComponent(result.programId)}&primera=1`
                    : '?primera=1'
                router.push(`/coach/builder/${clientId}${query}`)
                return
            }
            // `not_implemented` no es culpa del coach: se dice y la pantalla sigue en pie.
            setError(
                result.reason === 'not_implemented'
                    ? 'Esa plantilla está en preparación. Puedes armar la pauta desde el builder.'
                    : result.error,
            )
        })
    }

    return (
        <div className="space-y-2">
            <GuidedTaskCards
                coachId={coachId}
                surface="movement_screening"
                eyebrow="Lo que sigue"
                title={`El screening ya está: ahora la pauta de ${subject}`}
                footnote="Puedes ocultar esta ayuda: no vuelve a aparecer."
                cards={[
                    {
                        id: 'semaforo',
                        title: 'Mira el semáforo',
                        body: 'El puntaje por patrón y la banda de riesgo salen del screening que acabas de cerrar.',
                        done: true,
                    },
                    {
                        id: 'pauta',
                        title: 'Arma la pauta domiciliaria',
                        body: `«${templateLabel}» se copia a ${subject} en sus áreas (Movilidad, Control motor, Fortalecimiento).`,
                        action: {
                            label: 'Armar pauta domiciliaria',
                            tone: 'primary',
                            busy: isPending,
                            icon: <Dumbbell className="size-4" aria-hidden />,
                            onClick: apply,
                        },
                    },
                    {
                        id: 'ajusta',
                        title: 'Ajusta y asigna',
                        body: 'En el builder cambias ejercicios, series y días; el alumno lo ve al instante.',
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
