'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
    /** Login del alumno bajo la marca del coach (`/c/<identificador>/login`). */
    loginHref: string
}

/**
 * Salida del modo `remote` del banner de la vista de ejemplo (docs/specs/vive-tu-app-directo §3).
 *
 * `remote` = el coach entró desde OTRO dispositivo (QR de escritorio), o la cookie de retorno venció
 * o `generateLink` falló. No hay sesión de coach que restaurar en ESTE navegador: lo único honesto
 * es cerrar la sesión de ejemplo y dejarlo en el login. Por eso es cliente y no un `<form>`: el
 * `signOut` de Supabase vive en el navegador (mismo gesto que «Cerrar sesión» del nav del alumno).
 *
 * El detalle depende de `?volver=vencido`, que pone `POST /volver-al-panel` cuando el magic link de
 * vuelta ya no sirve — GoTrue comparte UN solo slot entre magic link y recovery, así que un reset de
 * contraseña pedido durante la visita mata el token. Ese caso NO es una excepción rara: es el camino
 * previsto, y decirlo es mejor que un botón que no explica nada.
 */
export function DemoViewerExit({ loginHref }: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [leaving, setLeaving] = useState(false)
    const expired = searchParams?.get('volver') === 'vencido'

    async function handleExit() {
        setLeaving(true)
        try {
            await createClient().auth.signOut()
        } catch {
            // Sin red la sesión local igual se limpia al aterrizar en el login.
        }
        router.push(loginHref)
        router.refresh()
    }

    return (
        <>
            <p className="mt-0.5 text-[13.5px] leading-snug text-text-muted">
                {expired ? (
                    <>
                        Tu acceso de vuelta venció. Entra a tu panel por el{' '}
                        <Link href="/login" className="font-semibold text-text-strong underline underline-offset-2">
                            login de coach
                        </Link>
                        .
                    </>
                ) : (
                    'Tu panel sigue abierto donde lo dejaste.'
                )}
            </p>
            <button
                type="button"
                onClick={handleExit}
                disabled={leaving}
                className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-control bg-[var(--cta-fill)] px-4 text-sm font-bold tracking-[-0.01em] text-[var(--text-on-sport)] transition-opacity active:scale-[0.98] disabled:opacity-60"
            >
                Salir de la vista de ejemplo
            </button>
        </>
    )
}
