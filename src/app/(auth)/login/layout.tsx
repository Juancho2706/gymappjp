import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
    title: 'Iniciar sesión',
    description:
        'Inicia sesión en EVA para gestionar alumnos, rutinas de entrenamiento, planes de nutrición y la marca de tu coaching.',
}

export default function LoginLayout({ children }: { children: ReactNode }) {
    return children
}
