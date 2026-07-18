import { BrandClientLoadingShell } from '../_components/BrandClientLoadingShell'

/**
 * Boundary por segmento (antes faltaba): sin él, navegar desde el menú dejaba el tap
 * sin feedback hasta completar el payload RSC de la vista de movimiento.
 */
export default function StudentMovementLoading() {
    return <BrandClientLoadingShell />
}
