import type { Metadata } from 'next'
import { ForgeStudentDemoPage } from '../_demos/ForgeStudentDemoPage'

export const metadata: Metadata = {
    title: 'EVA · Vista alumno (demo FORGE)',
    description: 'Demostración pública de la app alumno con estética FORGE. Sin datos reales.',
    robots: { index: false, follow: false },
}

export default function PruebaVistaAlumnoPage() {
    return <ForgeStudentDemoPage />
}
