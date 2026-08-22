'use client'

import { GuidedTaskCards } from '@/app/coach/_components/guided/GuidedTaskCards'
import { primerScreeningCards } from '../_lib/primer-screening'

/**
 * Tarjetas embebidas del wizard de screening (SPEC coach-onboarding-v2 §6, W4 F4.3): puntúa cada
 * patrón · marca dolor · guarda. Van DENTRO del wizard, arriba del patrón en curso — no hay velo
 * ni pop-up: el coach evalúa de verdad mientras las lee.
 *
 * Se tildan con señales REALES del propio wizard (cuántos patrones completó, si marcó dolor), no
 * con clics.
 */
export function PrimerScreeningCards({
    coachId,
    clientName,
    scoredPatterns,
    painMarked,
    allComplete,
}: {
    coachId: string
    /** Primer nombre del alumno («Pedro»). `null` = se habla sin sujeto. */
    clientName: string | null
    /** Patrones ya puntuados (0-7). */
    scoredPatterns: number
    /** El coach marcó dolor o descarte positivo en al menos un patrón. */
    painMarked: boolean
    /** Los 7 patrones están completos: solo falta cerrar. */
    allComplete: boolean
}) {
    const copy = primerScreeningCards(clientName)
    return (
        <GuidedTaskCards
            coachId={coachId}
            surface="movement_screening"
            eyebrow="Tu primer screening"
            title="Siete patrones y queda el semáforo"
            footnote="Puedes ocultar esta ayuda: no vuelve a aparecer."
            className="mb-4"
            cards={[
                { ...copy[0], done: scoredPatterns > 0 },
                { ...copy[1], done: painMarked },
                { ...copy[2], done: allComplete },
            ]}
        />
    )
}
