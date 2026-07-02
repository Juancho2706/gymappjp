'use client'

import { ImportContent } from '../../clients/import/_components/ImportContent'

/**
 * Pane "Importar alumnos" de Opciones (desktop SettingsShell). Envuelve el contenido reutilizable
 * del importador (`ImportContent`) en modo embebido: se comporta como el pane Soporte — botón activo
 * en el rail, sin doble back, sin navegación de página. El gating por tier/capacidad se resuelve
 * dentro de `ImportContent` (idéntico a la ruta directa `/coach/clients/import`, patrón
 * `SubscriptionContent`). Registrado en `CoachSettingsDesktop`.
 */
export function ImportPane() {
    return <ImportContent embedded />
}
