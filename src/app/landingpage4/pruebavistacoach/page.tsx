import type { Metadata } from 'next'
import { ForgeCoachDemoPage } from '../_demos/ForgeCoachDemoPage'

export const metadata: Metadata = {
    title: 'EVA · Vista coach (demo FORGE)',
    description: 'Demostración pública de la interfaz coach con estética FORGE. Sin datos reales.',
    robots: { index: false, follow: false },
}

export default function PruebaVistaCoachPage() {
    return <ForgeCoachDemoPage />
}
