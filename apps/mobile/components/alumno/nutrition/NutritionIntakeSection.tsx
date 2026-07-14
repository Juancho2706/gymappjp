import { View } from 'react-native'
import {
  OffPlanLogger as RealIntakeLogger,
  type OffPlanLoggerProps,
} from './OffPlanLogger'
import { NutritionGuidanceCard } from './NutritionGuidanceCard'

export type { OffPlanLoggerProps }

/**
 * Mantiene el callsite histórico `OffPlanLogger` pero compone el cierre de la
 * experiencia profesional: objetivos del plan + consumo real del mismo día.
 */
export function OffPlanLogger(props: OffPlanLoggerProps) {
  return (
    <View style={{ gap: 12 }}>
      <NutritionGuidanceCard clientId={props.clientId} logDate={props.logDate} />
      <RealIntakeLogger {...props} />
    </View>
  )
}
