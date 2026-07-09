import { Apple } from 'lucide-react-native'
import { EmptyState } from '../../EmptyState'

/**
 * NutritionEmpty (E4-01) — estado "sin plan activo". Espejo del
 * `EmptyNutritionState` de la web. El estado "dominio apagado por el coach"
 * (NutritionDomainOff) es gating de wave 2 (B3) — ver seam en el shell.
 */
export function NutritionEmpty() {
  return (
    <EmptyState
      icon={Apple}
      title="Sin plan activo"
      subtitle="Tu coach aún no te asignó un plan de nutrición."
    />
  )
}
