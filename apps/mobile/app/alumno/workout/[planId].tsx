import { useEffect } from 'react'
import { validateTargetDate } from '@eva/workout-engine'
import { useLocalSearchParams, useRouter } from 'expo-router'
import ExecutorV3 from '../../../components/alumno/workout/v3/ExecutorV3'
import { getTodayInSantiago } from '../../../lib/date-utils'
import { isUuid, reportInvalidRouteUuid } from '../../../lib/safe-uuid'
import { resolveExecutorDateParams } from '../../../lib/workout-executor-nav'

/**
 * Pantalla de ejecución de rutina del alumno. V3 es el ÚNICO camino (decisión CEO 2026-07-23): el
 * antiguo switch por flag `executorV3`/`executorV2` (V3 → V2 → Legacy) se eliminó junto con el flag,
 * y los componentes `ExecutorV2`/`LegacyExecutor` se retiraron del árbol (cierre EC.2, 2026-07-25).
 */
export default function WorkoutExecutionScreen() {
  // Params de la doble intención / cola de pendientes del dashboard (E1.7):
  //  · `recuperar` (dia pendiente de la semana) → solo banner INFORMATIVO; se entrena HOY y el log cae hoy.
  //  · `fecha` (dia ya hecho a revisar) → EDITOR DE DIA PASADO: el motor conmuta a solo-UPDATE sobre la
  //    ventana de esa fecha y JAMAS inserta (paridad con el server action web, `workout-log.actions.ts`).
  //  · `repetir` (dia ya hecho en OTRA fecha) → precarga cada serie con lo que el alumno registro ese dia
  //    (editable) y la sesion corre normal escribiendo el log de HOY; el dia original queda intacto.
  //
  // La validacion y la exclusion mutua (fecha gana sobre repetir; `fecha` = HOY se ignora) las resuelve
  // `resolveExecutorDateParams`, que reusa el helper compartido `validateTargetDate` de
  // @eva/workout-engine — antes vivia acá una copia parcial (`validateRepeatDate`) propensa al drift.
  const { planId, recuperar, fecha, repetir } = useLocalSearchParams<{
    planId: string
    recuperar?: string
    fecha?: string
    repetir?: string
  }>()
  const router = useRouter()
  // Guard de entrada: un push con plan nulo produce `/alumno/workout/null` y el param llega como el
  // STRING 'null' (truthy) → el ejecutor lo mandaba tal cual a un filtro uuid de PostgREST
  // (`invalid input syntax for type uuid`). `replace` al home del alumno (nunca `back()`: puede
  // rebotar en loop si la pantalla de origen también quedó inválida).
  const planIdValid = isUuid(planId)
  useEffect(() => {
    if (planIdValid) return
    reportInvalidRouteUuid('alumno/workout/[planId]', planId)
    router.replace('/alumno/home')
  }, [planIdValid, planId, router])

  const todayIso = getTodayInSantiago().iso
  // `recuperar` también pasa por `validateTargetDate` (paridad con la página web, page.tsx:36-37):
  // sin esto un deep link con basura (`?recuperar=chao`) o una fecha FUTURA pintaba el banner ámbar
  // "Recuperando: Invalid date". Formato/calendario inválido o futuro ⇒ se ignora el param y la
  // sesión abre normal (el banner es puramente informativo, el log siempre cae en HOY).
  const recoverCheck = typeof recuperar === 'string' ? validateTargetDate(recuperar, todayIso) : null
  const recoverDate = recoverCheck?.ok ? recoverCheck.iso : undefined
  const { editDate, repeatDate } = resolveExecutorDateParams({ fecha, repetir }, todayIso)
  // No montar el ejecutor con un id roto: dispararía su fetch antes de que corra el `replace`.
  if (!planIdValid) return null
  return (
    <ExecutorV3
      planId={planId}
      recoverDate={recoverDate}
      editDate={editDate ?? undefined}
      repeatDate={repeatDate ?? undefined}
    />
  )
}
