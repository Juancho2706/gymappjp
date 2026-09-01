import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WorkoutExecutionClient } from './WorkoutExecutionClient'
import { getWorkoutExecutionData } from './_data/workout-execution.queries'
import { getExecutorWeekStatusDays } from './_data/week-status.queries'
import { resolveRepeatDate, validateTargetDate } from '@eva/workout-engine'
import { getClientBasePath } from '@/lib/client/base-path'
import { getClientRootUser } from '@/app/c/[coach_slug]/_data/client-root.queries'
import { getTodayInSantiago } from '@/lib/date-utils'

export const metadata: Metadata = { title: 'Rutina | EVA' }

interface Props {
    params: Promise<{ coach_slug: string; planId: string }>
    // Ola 1 (decisiones CEO 9-10): `fecha` = editar registros de un día PASADO (modo solo-UPDATE);
    // `recuperar` = SOLO banner "Recuperando" (guardado normal de HOY). Ambas se validan server-side.
    // `repetir` = repetir HOY un día hecho en OTRA fecha, con las series precargadas con lo de ese día.
    searchParams: Promise<{ fecha?: string; recuperar?: string; desde?: string; repetir?: string }>
}

export default async function WorkoutExecutionPage({ params, searchParams }: Props) {
    const { coach_slug, planId } = await params
    const { fecha, recuperar, repetir } = await searchParams

    // Validación server-side de `fecha`: sólo un día PASADO válido activa el modo edición; cualquier
    // otra cosa (formato malo, futuro) se ignora y el ejecutor abre en modo HOY normal.
    // `?fecha=<hoy>` degrada a `null` ⇒ flujo normal de hoy (upsert). Incidente 2026-07-26: la
    // atribución semanal marcaba el día recuperado con `doneOnDate = HOY`, el sheet "Revisar y editar"
    // linkeaba a `?fecha=<hoy>` y el modo solo-UPDATE dejaba TODA serie nueva sin poder guardarse
    // (`past_set_not_found` ⇒ la cola offline la descartaba). Con fecha de hoy el upsert es idéntico
    // al flujo sin `?fecha` y es seguro; el anti-farmeo sólo aplica a fechas pasadas.
    const { iso: todayIso } = getTodayInSantiago()
    const fechaCheck = typeof fecha === 'string' ? validateTargetDate(fecha, todayIso) : null
    const targetDate = fechaCheck?.ok && fechaCheck.iso !== todayIso ? fechaCheck.iso : null
    // `recuperar` es sólo visual: se valida con la misma regla (pasado/hoy) pero jamás toca la query.
    const recuperarCheck = typeof recuperar === 'string' ? validateTargetDate(recuperar, todayIso) : null
    const recuperarDate = recuperarCheck?.ok ? recuperarCheck.iso : null
    // `repetir`: `resolveRepeatDate` descarta formato/calendario inválidos, futuro y HOY MISMO. Acá
    // sólo resta la exclusión entre modos: con `fecha` activo gana la edición del día pasado. Al
    // descartarse, el ejecutor abre como hoy.
    const repeatDate = targetDate ? null : resolveRepeatDate(repetir, todayIso)

    // El base path sale de un header del proxy (sin I/O) y la data del ejecutor de Supabase: no
    // dependen entre sí, así que van juntas — el ejecutor pelea contra un presupuesto de 3,3 s
    // antes de que el "Despegue" del alumno caiga al fallback (Sentry EVA-NEXTJS-1C).
    //
    // UNA SOLA OLA (auditoría de waterfall 2026-08-31). La racha semanal (E4.4, Inicio + Final V3)
    // vivía en una SEGUNDA tanda serial, awaiteada después de esta, porque necesitaba `user.id` y
    // `user` salía de `data`. Eso costaba un salto entero a la DB — y de los caros: sus 3 lecturas
    // bajan `workout_programs` con `workout_plans` + `workout_blocks` + `exercises` anidados.
    //
    // La dependencia era ILUSORIA: ese `user.id` no es una lectura, es `claims.sub` de
    // `supabase.auth.getClaims()` (verificación LOCAL del JWT con ES256 + JWKS cacheado, cero
    // round-trip), exactamente el mismo que resuelve `getClientRootUser()`. Resolviéndolo acá arriba
    // la racha entra en la MISMA ola que el resto y el ejecutor pierde un salto del presupuesto.
    //
    // Los dos redirects de abajo siguen dependiendo SOLO de `data`, así que el guard no cambia de
    // orden ni de criterio. La lectura extra es del PROPIO alumno bajo RLS (`clients.id = auth.uid()`),
    // así que adelantarla no expone nada: en el peor caso se desperdicia una query en un request que
    // igual iba a redirigir.
    const rootUser = await getClientRootUser()
    const [base, data, weekStatusDays] = await Promise.all([
        getClientBasePath(coach_slug),
        getWorkoutExecutionData(planId, targetDate ?? undefined, repeatDate ?? undefined),
        // `catch → null` a propósito: la racha es decorativa y `SessionStart` ya trata `null` como
        // "no mostrar la pieza". Antes, al ir en su propio `await` después de los guards, un fallo
        // acá reventaba la página entera; ahora degrada. NO cambiar por un throw.
        rootUser ? getExecutorWeekStatusDays(rootUser.id).catch(() => null) : Promise.resolve(null),
    ])
    const { user, plan } = data

    if (!user) redirect(`${base}/login`)
    if (!plan) redirect(`${base}/dashboard`)

    return (
        <WorkoutExecutionClient
            plan={plan}
            program={data.program}
            logs={data.logs}
            seedLogs={data.seedLogs}
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
            repeatDate={repeatDate}
            executorV3={true}
            weekStatusDays={weekStatusDays}
        />
    )
}
