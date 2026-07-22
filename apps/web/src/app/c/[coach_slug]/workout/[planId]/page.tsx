import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WorkoutExecutionClient } from './WorkoutExecutionClient'
import { getWorkoutExecutionData } from './_data/workout-execution.queries'
import { getExecutorWeekStatusDays } from './_data/week-status.queries'
import { validateTargetDate } from './_data/target-date'
import { getClientBasePath } from '@/lib/client/base-path'
import { getTodayInSantiago } from '@/lib/date-utils'
import { isExecutorV3Enabled } from '@/services/executor-v3-rollout.service'

export const metadata: Metadata = { title: 'Rutina | EVA' }

interface Props {
    params: Promise<{ coach_slug: string; planId: string }>
    // Ola 1 (decisiones CEO 9-10): `fecha` = editar registros de un día PASADO (modo solo-UPDATE);
    // `recuperar` = SOLO banner "Recuperando" (guardado normal de HOY). Ambas se validan server-side.
    searchParams: Promise<{ fecha?: string; recuperar?: string; desde?: string }>
}

export default async function WorkoutExecutionPage({ params, searchParams }: Props) {
    const { coach_slug, planId } = await params
    const { fecha, recuperar } = await searchParams
    const base = await getClientBasePath(coach_slug)

    // Validación server-side de `fecha`: sólo un día pasado/hoy válido activa el modo edición; cualquier
    // otra cosa (formato malo, futuro) se ignora y el ejecutor abre en modo HOY normal.
    const { iso: todayIso } = getTodayInSantiago()
    const fechaCheck = typeof fecha === 'string' ? validateTargetDate(fecha, todayIso) : null
    const targetDate = fechaCheck?.ok ? fechaCheck.iso : null
    // `recuperar` es sólo visual: se valida con la misma regla (pasado/hoy) pero jamás toca la query.
    const recuperarCheck = typeof recuperar === 'string' ? validateTargetDate(recuperar, todayIso) : null
    const recuperarDate = recuperarCheck?.ok ? recuperarCheck.iso : null

    // Flag ejecutor V3 (E2.1): Edge Config `executor_v3` (fail-safe OFF). El override de dev/QA
    // por localStorage (`eva:executor-v3`) lo aplica el cliente tras montar, pisando este default.
    const executorV3 = await isExecutorV3Enabled()

    const data = await getWorkoutExecutionData(planId, targetDate ?? undefined)
    const { user, plan } = data

    if (!user) redirect(`${base}/login`)
    if (!plan) redirect(`${base}/dashboard`)

    // Racha semanal (E4.4): estado de la semana actual para Inicio + Final V3. Sólo se consulta cuando
    // el flag V3 viene ON del server (evita 3 lecturas extra en V2 y mientras V3 esté OFF). Si un
    // override QA enciende V3 en cliente con el server en OFF, la racha no viaja y no se muestra.
    const weekStatusDays = executorV3 ? await getExecutorWeekStatusDays(user.id) : null

    return (
        <WorkoutExecutionClient
            plan={plan}
            program={data.program}
            logs={data.logs}
            previousHistory={data.previousHistory}
            coachSlug={coach_slug}
            exerciseMaxes={data.exerciseMaxes}
            exerciseMaxDates={data.exerciseMaxDates}
            activeWeekVariant={data.activeWeekVariant}
            currentWeek={data.currentWeek}
            lastSessionByBlock={data.lastSessionByBlock}
            areas={data.areas}
            cardio={data.cardio}
            targetDate={targetDate}
            recoverDate={recuperarDate}
            executorV3={executorV3}
            weekStatusDays={weekStatusDays}
        />
    )
}
