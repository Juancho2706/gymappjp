import { NextRequest, NextResponse } from 'next/server'
import { getNutritionWeeklyRecap } from '@/app/c/[coach_slug]/nutrition/_data/recap.queries'
import { authNutritionClient } from '../_shared'

/**
 * GET /api/mobile/nutrition/recap
 *
 * Recap semanal motivacional del alumno (feature K). Numeros IDENTICOS a web: reusa
 * `getNutritionWeeklyRecap` (motor canonico `computeNutritionAdherence`, ventana ultimos 7d vs
 * los 7 previos), inyectando el cliente service-role filtrado por el `clientId` verificado.
 * `recap: null` cuando el alumno no tiene plan activo (mismo contrato que web).
 */
export async function GET(request: NextRequest) {
    const auth = await authNutritionClient(request)
    if (!auth.ok) return auth.response
    const { clientId, admin } = auth

    const recap = await getNutritionWeeklyRecap(clientId, admin)
    return NextResponse.json({ recap })
}
