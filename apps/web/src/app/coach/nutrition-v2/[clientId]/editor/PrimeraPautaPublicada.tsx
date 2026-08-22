'use client'

import { PartyPopper } from 'lucide-react'
import { ViveTuAppButton } from '@/app/coach/dashboard/_components/ViveTuAppButton'

/**
 * Cierre de la tarea guiada de la pauta: la pauta quedó PUBLICADA y lo que sigue es verla como la
 * ve el alumno (SPEC coach-onboarding-v2 §5 «Vive tu app» + §6 paso 3).
 *
 * Por qué un panel propio y no el toast de siempre: el editor sale de pantalla al publicar, y con
 * él se iría la única oportunidad de enganchar el «wow» del white-label. Acá el coach ve el
 * resultado y tiene UNA acción — abrir su app como su alumno de ejemplo — más el escape.
 *
 * `autoOpenViveTuApp` es el contrato de la CTA «Publicar y ver como {demo}»: el mismo botón real
 * (mismo magic link de un solo uso, mismo QR, mismos avisos) abre su hoja solo al montar.
 */
export function PrimeraPautaPublicada({
    demoName,
    autoOpenViveTuApp,
    onClose,
}: {
    /** Nombre del alumno de ejemplo («Ana»). */
    demoName: string | null
    autoOpenViveTuApp: boolean
    /** Salir del editor (vuelve a la ficha del alumno). */
    onClose: () => void
}) {
    const label = demoName ? `Ver como ${demoName}` : 'Ver mi app'

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-[color-mix(in_oklab,var(--surface-app)_88%,transparent)] p-4 backdrop-blur-sm sm:items-center">
            <div className="w-full max-w-md rounded-card border border-subtle bg-surface-card p-5 shadow-[var(--shadow-md)]">
                <span className="inline-flex size-9 items-center justify-center rounded-control bg-sport-100 text-sport-600">
                    <PartyPopper className="size-5" aria-hidden />
                </span>
                <h2 className="mt-2.5 font-display text-[20px] font-extrabold tracking-[-0.02em] text-strong">
                    Pauta publicada
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                    {demoName
                        ? `Así la ve ${demoName} en su app: con tu logo, tu color y las porciones que dejaste.`
                        : 'Tu alumno ya la ve en su app, con tu marca.'}
                </p>

                <div className="mt-4">
                    <ViveTuAppButton
                        label={label}
                        className="w-full justify-center"
                        autoOpen={autoOpenViveTuApp}
                        onOpened={() => undefined}
                    />
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-control px-3 text-[13px] font-bold text-muted transition-colors hover:bg-surface-sunken hover:text-strong"
                >
                    Volver al panel
                </button>
            </div>
        </div>
    )
}
