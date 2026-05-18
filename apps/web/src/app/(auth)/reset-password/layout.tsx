import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
    title: 'Establecer nueva contraseña',
    description:
        'Define una nueva contraseña para tu cuenta EVA tras el enlace de recuperación enviado a tu correo.',
}

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
    return children
}
