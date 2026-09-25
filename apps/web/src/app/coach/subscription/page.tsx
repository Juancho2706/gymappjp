import { Suspense } from 'react'
import { BrandCoachLoader } from '../_components/BrandCoachLoadingShell'
import { SubscriptionContent } from './_components/SubscriptionContent'

/**
 * Ruta directa de la suscripción (hub móvil + retornos de checkout de Mercado Pago).
 * El cuerpo vive en `SubscriptionContent`, reutilizado también embebido en el pane
 * "Suscripción" de Opciones (desktop SettingsShell). Suspense por `useSearchParams`.
 */
export default function CoachSubscriptionPage() {
    return (
        <Suspense fallback={null}>
            <SubscriptionContent loader={<BrandCoachLoader />} />
        </Suspense>
    )
}
