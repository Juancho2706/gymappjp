import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'EVA Enterprise — Panel para Gyms y Academias',
    description: 'Gestiona múltiples coaches, el pool de alumnos y reportes de actividad desde un solo lugar. Diseñado para gimnasios, academias y organizaciones con equipos de coaches.',
    openGraph: {
        title: 'EVA Enterprise — Panel para Gyms y Academias',
        description: 'Gestiona múltiples coaches, el pool de alumnos y reportes de actividad desde un solo lugar.',
        type: 'website',
        locale: 'es_CL',
    },
    robots: {
        index: true,
        follow: true,
    },
}

export default function EnterpriseLayout({ children }: { children: React.ReactNode }) {
    return children
}
