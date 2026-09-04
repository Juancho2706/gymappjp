'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { clearClientCaches } from '@/lib/client/clear-client-caches'

interface Props {
    /** Prefijo de la app del alumno (`/c/<identificador>` o `/t/<team>`). */
    base: string
    className?: string
    children?: React.ReactNode
}

/**
 * «Cerrar sesión» de la pantalla de acceso pausado.
 *
 * Hasta hoy eran dos `<form action="/auth/signout" method="post">` — y esa ruta NO EXISTE en el app
 * (grieta menor documentada en docs/specs/vive-tu-app-directo §«Problema»): el alumno tocaba el
 * botón, recibía un 404 y se quedaba con la sesión abierta. Se usa el MISMO `signOut` client-side
 * del nav del alumno, que es el único camino de salida real de este árbol.
 */
export function SuspendedSignOutButton({ base, className, children }: Props) {
    const router = useRouter()
    const [leaving, setLeaving] = useState(false)

    async function handleSignOut() {
        setLeaving(true)
        await clearClientCaches()
        try {
            await createClient().auth.signOut()
        } catch {
            // Sin red la sesión local igual se limpia al aterrizar en el login.
        }
        router.push(`${base}/login`)
        router.refresh()
    }

    return (
        <button type="button" onClick={handleSignOut} disabled={leaving} className={className}>
            {children ?? 'Cerrar sesión'}
        </button>
    )
}
