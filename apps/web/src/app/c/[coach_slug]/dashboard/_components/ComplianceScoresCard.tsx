import { getDashboardNutritionDomainEnabled, getHeroComplianceBundle } from '../_data/heroComplianceBundle'
import { ComplianceRingCluster } from './compliance/ComplianceRing'

export async function ComplianceScoresCard({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    // Gate del anillo de Nutricion: si el coach apago el dominio (master switch §4.8) para este
    // alumno, ocultamos SOLO el anillo de nutricion del cluster (Entrenos/Check-ins siguen). El
    // cluster reacomoda la grilla a 2 columnas — nunca un hueco vacio (NN/g pitfall).
    const [{ scores }, nutritionEnabled] = await Promise.all([
        getHeroComplianceBundle(userId, coachSlug),
        getDashboardNutritionDomainEnabled(userId),
    ])
    return (
        <ComplianceRingCluster
            workoutScore={scores.workoutScore}
            nutritionEngagementScore={scores.nutritionEngagementScore}
            checkInScore={scores.checkInScore}
            nutritionHasLogs={scores.nutritionHasLogs}
            nutritionEnabled={nutritionEnabled}
        />
    )
}
