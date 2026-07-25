'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useCoarsePointer } from '@/lib/client/useCoarsePointer'

const WHEEL_HINT_KEY = 'eva:wheel-hint-v1'

/**
 * Pista de la captura dual (E2.5) — se muestra UNA sola vez (persistida en localStorage) la primera
 * vez que el alumno llega a la pantalla de fuerza V3 en un dispositivo táctil: "Tap = teclado ·
 * Mantén presionado = rueda". Sólo táctil (el long-press es gesto de puntero grueso); en desktop no
 * aparece. Se persiste al mostrarse (cuenta como vista) y se puede descartar con la ✕.
 */
export function WheelHint() {
    const coarse = useCoarsePointer()
    const [show, setShow] = useState(false)

    useEffect(() => {
        if (!coarse) return
        try {
            if (localStorage.getItem(WHEEL_HINT_KEY)) return
        } catch {
            return
        }
        setShow(true)
        try {
            localStorage.setItem(WHEEL_HINT_KEY, '1')
        } catch {
            /* private mode: se mostrará de nuevo, aceptable */
        }
    }, [coarse])

    if (!show) return null

    return (
        <div className="exec-v3-wheelhint" role="note">
            <span>
                <b>Tap</b> = teclado · <b>Mantén presionado</b> = rueda
            </span>
            <button
                type="button"
                onClick={() => setShow(false)}
                aria-label="Entendido, ocultar pista"
                className="exec-v3-wheelhint-x"
            >
                <X className="h-3.5 w-3.5" aria-hidden />
            </button>
        </div>
    )
}
