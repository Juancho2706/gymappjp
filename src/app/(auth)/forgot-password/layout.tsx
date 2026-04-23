import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
    title: 'Recuperar contraseña',
    description:
        'Solicita un enlace seguro para restablecer tu contraseña de EVA y recuperar el acceso a tu cuenta.',
}

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
    return children
}
