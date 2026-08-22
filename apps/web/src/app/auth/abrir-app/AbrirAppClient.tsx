'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MailCheck, ArrowRight } from 'lucide-react'

/**
 * Escala iOS del regreso a la app tras confirmar el correo.
 *
 * Safari NO dispara un universal link cuando el salto viene de un `Location:` (ni cuando la
 * navegación sale del mismo dominio), así que `/auth/confirm` no puede mandar al coach a la app de
 * un redirect como hace Android con `intent://`. Lo que sí funciona es una página: acá el salto lo
 * hace un `window.location.href = 'eva://…'` desde el documento ya cargado y, si eso no prende, el
 * botón lo hace con el gesto del coach (un custom scheme abierto por un toque es el camino que iOS
 * respeta siempre).
 *
 * Por qué el botón está desde el primer frame y no aparece recién a los 2,5 s: sin JS —o con el
 * salto automático bloqueado, que en iOS pasa— el botón es la ÚNICA salida a la app. Lo que cambia
 * a los 2,5 s es el texto de ayuda, no la existencia del CTA.
 */

/** Un respiro antes del salto: que el documento pinte antes de que iOS tape todo con su diálogo. */
const AUTO_JUMP_DELAY_MS = 400

/** Si a esta altura la pestaña sigue al frente, la app no se abrió: pasar a modo manual. */
const STALL_MS = 2500

/**
 * Un intento automático por pestaña. Si el coach vuelve atrás desde la app (o recarga) sin este
 * flag, iOS le repite el diálogo del scheme —y, sin la app instalada, el «no se puede abrir la
 * página» en bucle. El botón sigue disponible para reintentar a mano.
 */
const JUMP_FLAG_KEY = 'eva:abrir-app:jumped'

type Phase = 'jumping' | 'manual'

function readJumped(): boolean {
    try {
        return window.sessionStorage.getItem(JUMP_FLAG_KEY) === '1'
    } catch {
        // Safari en modo privado / storage bloqueado: peor caso, se reintenta el salto.
        return false
    }
}

function markJumped(): void {
    try {
        window.sessionStorage.setItem(JUMP_FLAG_KEY, '1')
    } catch {
        // Sin storage no hay memoria del intento; el salto igual ocurre.
    }
}

export function AbrirAppClient({ deepLink, webNext, email }: { deepLink: string; webNext: string; email: string }) {
    const [phase, setPhase] = useState<Phase>('jumping')

    useEffect(() => {
        // Segunda visita a esta misma pestaña: nada de saltar de nuevo, directo al modo manual.
        if (readJumped()) {
            setPhase('manual')
            return
        }

        let leftThePage = false
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                // La app se llevó el foco: el salto funcionó.
                leftThePage = true
            } else if (leftThePage) {
                // Y el coach volvió al navegador: el texto de «te estamos llevando» ya no aplica.
                setPhase('manual')
            }
        }
        document.addEventListener('visibilitychange', onVisibility)

        const jumpTimer = setTimeout(() => {
            markJumped()
            window.location.href = deepLink
        }, AUTO_JUMP_DELAY_MS)

        const stallTimer = setTimeout(() => {
            if (document.visibilityState === 'visible') setPhase('manual')
        }, STALL_MS)

        return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            clearTimeout(jumpTimer)
            clearTimeout(stallTimer)
        }
    }, [deepLink])

    return (
        <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-app px-6 py-14">
            <div className="w-full max-w-md animate-slide-up text-center">
                <div className="mb-5 inline-flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sport-100 text-sport-600">
                    <MailCheck className="h-[34px] w-[34px]" aria-hidden="true" />
                </div>

                <h1 className="font-display text-[25px] font-black tracking-[-0.02em] text-text-strong">
                    Correo confirmado
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    Vuelve a la app para entrar a tu panel.
                    {email ? (
                        <>
                            <br />
                            <strong className="text-text-strong">{email}</strong>
                        </>
                    ) : null}
                </p>

                <a
                    href={deepLink}
                    className="mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] text-[17px] font-bold tracking-[-0.01em] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all duration-200 hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] active:scale-[0.98]"
                >
                    Abrir EVA
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>

                {/* El texto cambia, el botón no: `aria-live` para que un lector de pantalla se entere. */}
                <p className="mt-3 min-h-[18px] text-[12.5px] text-text-subtle" aria-live="polite">
                    {phase === 'manual' ? '¿No se abrió? Toca Abrir EVA.' : 'Te estamos llevando a la app…'}
                </p>

                <Link
                    href={webNext}
                    prefetch={false}
                    className="mt-5 inline-block text-[13.5px] font-semibold text-text-muted underline underline-offset-2 transition-colors hover:text-text-strong"
                >
                    Seguir en la web
                </Link>
            </div>
        </main>
    )
}
