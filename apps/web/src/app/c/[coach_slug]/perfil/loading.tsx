import { BrandClientLoadingShell } from '../_components/BrandClientLoadingShell'

/**
 * Boundary por segmento (antes faltaba): "Mi perfil" hace fan-out de queries (perfil,
 * racha, historial, recap mensual) — sin loading.tsx el tap quedaba sin feedback.
 */
export default function StudentProfileLoading() {
    return <BrandClientLoadingShell />
}
