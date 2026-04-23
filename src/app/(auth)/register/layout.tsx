import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
    title: 'Crear cuenta de coach',
    description:
        'Regístrate en EVA, la plataforma para personal trainers: alumnos, rutinas, nutrición y app con tu marca.',
}

export default function RegisterLayout({ children }: { children: ReactNode }) {
    return children
}
