// Composicion corporal (lado WEB).
// El kernel PURO (regresion de peso, proyeccion, IMC, energia) vive en @eva/profile-analytics
// (fuente unica web + mobile, E3-08) y se re-exporta aca. `energyColor` (clase Tailwind) es
// especifico de la web y se mantiene local; RN usa `energyColorHex` del package.

export {
    linearRegressionKgPerDay,
    projectedWeightRangeKg,
    bmiFromMetric,
    bmiCategory,
    avgEnergySince,
} from '@eva/profile-analytics'

export function energyColor(level: number | null | undefined): string {
    if (level == null) return 'bg-muted-foreground'
    if (level >= 8) return 'bg-emerald-500'
    if (level >= 5) return 'bg-amber-500'
    return 'bg-rose-500'
}
