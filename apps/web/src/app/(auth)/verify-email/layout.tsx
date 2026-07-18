import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
    title: 'Verifica tu correo',
    description:
        'Revisa tu bandeja de entrada para confirmar tu cuenta de EVA y empezar a gestionar a tus alumnos.',
    // Página transaccional (post-registro, con email en la query) — no debe rankear.
    robots: { index: false, follow: false },
}

/** El shell de dos columnas lo provee `(auth)/layout.tsx`. */
export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
    return children
}
