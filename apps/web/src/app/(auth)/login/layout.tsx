import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
    title: 'Iniciar sesión',
    description:
        'Inicia sesión en EVA para gestionar alumnos, rutinas de entrenamiento, planes de nutrición y la marca de tu coaching.',
}

export default function LoginLayout({ children }: { children: ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 bg-background overflow-auto">
            {/* Ambient gradient */}
            <div
                className="fixed inset-0 pointer-events-none z-0"
                aria-hidden="true"
                style={{
                    background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,122,255,0.08), transparent)',
                }}
            />
            <div className="relative z-10 min-h-full flex">
                {children}
            </div>
        </div>
    )
}
