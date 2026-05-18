import { getHeroComplianceBundle } from '../_data/heroComplianceBundle'
import { ComplianceRingCluster } from './compliance/ComplianceRing'

export async function ComplianceScoresCard({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const { scores } = await getHeroComplianceBundle(userId, coachSlug)
    return (
        <ComplianceRingCluster
            workoutScore={scores.workoutScore}
            nutritionScore={scores.nutritionScore}
            checkInScore={scores.checkInScore}
            nutritionHasLogs={scores.nutritionHasLogs}
        />
    )
}
