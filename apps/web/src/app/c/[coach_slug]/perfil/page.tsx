import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'

import { getClientBasePath } from '@/lib/client/base-path'
import {
    getClientDashboardUser,
    getClientProfile,
    getDashboardStreak,
    getWorkoutHistoryDayCounts,
    getActiveProgram,
} from '../dashboard/_data/dashboard.queries'
import { getStudentMovementNavEnabled, getStudentBodyCompositionNavEnabled } from '../_data/client-root.queries'
import { ProfileClient } from './_components/ProfileClient'

export const metadata: Metadata = { title: 'Mi perfil' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function ProfilePage({ params }: Props) {
    const { coach_slug } = await params
    const base = await getClientBasePath(coach_slug)

    const user = await getClientDashboardUser()
    if (!user) redirect(`${base}/login`)

    const { client } = await getClientProfile(user.id)
    if (!client) redirect(`${base}/login`)

    const [streak, dayCounts, program, showMovement, showBodyComposition] = await Promise.all([
        getDashboardStreak(client.id),
        // Cada dia con series registradas = un entreno (ventana 1 año, agregado en DB).
        getWorkoutHistoryDayCounts(client.id, 365),
        getActiveProgram(client.id),
        getStudentMovementNavEnabled(),
        getStudentBodyCompositionNavEnabled(),
    ])

    const headersList = await headers()
    // brandName team-aware (el proxy /t fuerza la marca del TEAM en el header). Fallback a la marca
    // personal del coach anidada en la fila clients (standalone).
    const coachRow = client.coaches
    const coachBranding = Array.isArray(coachRow) ? coachRow[0] : coachRow
    const brandName = headersList.get('x-coach-brand-name') || coachBranding?.brand_name || 'tu coach'

    return (
        <ProfileClient
            coachSlug={coach_slug}
            base={base}
            fullName={client.full_name || 'Alumno'}
            brandName={brandName}
            programName={program?.name ?? null}
            streak={streak}
            totalWorkouts={dayCounts.length}
            showMovement={showMovement}
            showBodyComposition={showBodyComposition}
        />
    )
}
