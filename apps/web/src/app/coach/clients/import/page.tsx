import { ImportContent } from './_components/ImportContent'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Importar Alumnos | EVA',
}

/**
 * Ruta directa del importador de alumnos. El cuerpo (data + gating + wizard) vive en
 * `ImportContent`, reutilizado también embebido en el pane "Importar alumnos" de Opciones
 * (desktop SettingsShell, vía `ImportPane`). Patrón `SubscriptionContent`: la page es un wrapper.
 */
export default function ImportClientsPage() {
    return <ImportContent />
}
