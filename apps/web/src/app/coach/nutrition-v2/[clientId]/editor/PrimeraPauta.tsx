'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { Info, Rocket } from 'lucide-react'
import { GuidedTaskCards } from '@/app/coach/_components/guided/GuidedTaskCards'
import { primeraPautaCards } from '../../_lib/primera-pauta'
import { useQuickEdit } from '../_quick-edit/QuickEditProvider'

/**
 * Entrada guiada «Arma su primera pauta» (SPEC coach-onboarding-v2 §6/§7, TASKS W4 F4.3).
 *
 * Vive DENTRO del editor único, no encima: tres tarjetas embebidas en el lienzo (cambia un
 * alimento · ajusta una porción · publica) y el aviso amable cuando el alumno ya tenía pauta. El
 * coach edita de verdad mientras las lee; no hay velo, no hay tour, no hay builder en blanco.
 *
 * La config la arma el SERVIDOR (`editor/page.tsx`) y la inyecta `EditorClient`. Sin config, todo
 * este árbol es `null` y el editor es bit-idéntico al de siempre.
 */

export interface PrimeraPautaConfig {
    /** Memoria de las tarjetas, por coach. */
    coachId: string
    /** El alumno ya tenía pauta vigente: se está EDITANDO, no creando. */
    hasActivePlan: boolean
    /** Primer nombre del alumno («Ana»). `null` = se habla sin sujeto. */
    name: string | null
    /** Aviso amable del choque «ya tiene una pauta». `null` = no hay nada que avisar. */
    notice: string | null
    /** El alumno es el de ejemplo: recién ahí tiene sentido «ver como Ana» (magic link del demo). */
    isDemo: boolean
    /** El coach pidió «Publicar y ver como …»: al publicar se abre la hoja de «Vive tu app». */
    onWantsViveTuApp: () => void
}

const PrimeraPautaContext = createContext<PrimeraPautaConfig | null>(null)

export function PrimeraPautaProvider({
    value,
    children,
}: {
    value: PrimeraPautaConfig | null
    children: ReactNode
}) {
    return <PrimeraPautaContext.Provider value={value}>{children}</PrimeraPautaContext.Provider>
}

export function usePrimeraPauta(): PrimeraPautaConfig | null {
    return useContext(PrimeraPautaContext)
}

/**
 * Las tarjetas embebidas. Se monta desde `QuickEditPlanView`, arriba del lienzo: sin config
 * devuelve `null`, así que el quick-edit clásico y el editor normal no cambian en nada.
 */
export function PrimeraPautaCards() {
    const config = usePrimeraPauta()
    const { openConfirm, isPending, changeCount } = useQuickEdit()
    if (config == null) return null

    const copy = primeraPautaCards({ hasActivePlan: config.hasActivePlan, name: config.name })
    const publishLabel =
        config.isDemo && config.name != null ? `Publicar y ver como ${config.name}` : 'Publicar la pauta'

    return (
        <div className="space-y-2.5">
            {config.notice ? (
                <p className="flex items-start gap-2 rounded-card border border-[color:var(--sport-500)]/25 bg-sport-100/40 px-3 py-2.5 text-[12.5px] font-semibold leading-snug text-sport-700">
                    <Info className="mt-px size-4 shrink-0" aria-hidden />
                    {config.notice}
                </p>
            ) : null}

            <GuidedTaskCards
                coachId={config.coachId}
                surface="nutrition_plan"
                eyebrow="Tu primera pauta"
                title="Tres cambios y queda publicada"
                footnote="Puedes ocultar esta ayuda: no vuelve a aparecer."
                // El tilde usa el contador REAL de cambios del contrato (`countDraftChanges`) como
                // proxy: el reducer no distingue «cambié un alimento» de «ajusté una porción», y
                // pedirle esa granularidad seria tocar el reducer, que está fuera de esta tanda.
                cards={[
                    { id: copy[0].id, title: copy[0].title, body: copy[0].body, done: changeCount >= 1 },
                    { id: copy[1].id, title: copy[1].title, body: copy[1].body, done: changeCount >= 2 },
                    {
                        id: copy[2].id,
                        title: copy[2].title,
                        body: copy[2].body,
                        action: {
                            label: publishLabel,
                            tone: 'primary',
                            busy: isPending,
                            icon: <Rocket className="size-4" aria-hidden />,
                            onClick: () => {
                                // El camino de publicación es el de SIEMPRE (confirm sheet →
                                // publishPlanAction / quickEditPublishAction con CAS e
                                // idempotencia). Acá solo se anota que, si sale bien, hay que
                                // abrir «Vive tu app».
                                if (config.isDemo) config.onWantsViveTuApp()
                                openConfirm()
                            },
                        },
                    },
                ]}
            />
        </div>
    )
}
