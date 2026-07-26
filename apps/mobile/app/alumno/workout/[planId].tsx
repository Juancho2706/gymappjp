import { useLocalSearchParams } from 'expo-router'
import ExecutorV3 from '../../../components/alumno/workout/v3/ExecutorV3'
import { getTodayInSantiago } from '../../../lib/date-utils'

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valida el `?repetir=YYYY-MM-DD`: patrón estricto, calendario real (rechaza 2026-13-40) y fecha
 * PASADA. Espejo del `validateTargetDate` de la web (`_data/target-date.ts`), que hoy vive dentro de
 * `apps/web` y no es importable desde RN; cuando ese helper baje a `packages/*` esta copia se retira.
 * El día IGUAL a hoy también se descarta: el índice único de la DB es por día, así que "repetir hoy
 * sobre hoy" pisaría la misma fila (decisión CEO). Inválido/futuro/hoy ⇒ null y el ejecutor abre como
 * un día normal, sin regresión.
 */
function validateRepeatDate(input: string, todayIso: string): string | null {
  if (!ISO_YMD.test(input)) return null
  const [y, m, d] = input.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  // Comparación lexicográfica: segura en `yyyy-mm-dd` zero-padded (mismo orden que el cronológico).
  return input < todayIso ? input : null
}

/**
 * Pantalla de ejecución de rutina del alumno. V3 es el ÚNICO camino (decisión CEO 2026-07-23): el
 * antiguo switch por flag `executorV3`/`executorV2` (V3 → V2 → Legacy) se eliminó junto con el flag,
 * y los componentes `ExecutorV2`/`LegacyExecutor` se retiraron del árbol (cierre EC.2, 2026-07-25).
 */
export default function WorkoutExecutionScreen() {
  // `recuperar` (dia pendiente de la semana) y `fecha` (dia ya hecho a revisar) los envia el sheet
  // doble intencion / la cola de pendientes del dashboard (E1.7). Por ahora solo alimentan un banner
  // INFORMATIVO en el ejecutor; el flujo de guardado RN no cambia (escribe el log de hoy).
  // `repetir` (dia ya hecho en OTRA fecha) SI cambia lo que se ve: precarga cada serie con lo que el
  // alumno registro ese dia (editable) y la sesion corre normal, escribiendo el log de HOY — los
  // registros del dia original quedan intactos.
  const { planId, recuperar, fecha, repetir } = useLocalSearchParams<{
    planId: string
    recuperar?: string
    fecha?: string
    repetir?: string
  }>()
  const recoverDate = typeof recuperar === 'string' ? recuperar : undefined
  const editDate = typeof fecha === 'string' ? fecha : undefined
  const repeatDate =
    typeof repetir === 'string' ? validateRepeatDate(repetir, getTodayInSantiago().iso) ?? undefined : undefined
  return <ExecutorV3 planId={planId} recoverDate={recoverDate} editDate={editDate} repeatDate={repeatDate} />
}
