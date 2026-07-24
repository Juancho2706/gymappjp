import { useLocalSearchParams } from 'expo-router'
import ExecutorV3 from '../../../components/alumno/workout/v3/ExecutorV3'

/**
 * Pantalla de ejecución de rutina del alumno. V3 es el ÚNICO camino (decisión CEO 2026-07-23): el
 * antiguo switch por flag `executorV3`/`executorV2` (V3 → V2 → Legacy) se eliminó junto con el flag.
 * Los componentes ExecutorV2 y LegacyExecutor quedan en el árbol para limpieza futura, pero ya no
 * tienen importador.
 */
export default function WorkoutExecutionScreen() {
  // `recuperar` (dia pendiente de la semana) y `fecha` (dia ya hecho a revisar) los envia el sheet
  // doble intencion / la cola de pendientes del dashboard (E1.7). Por ahora solo alimentan un banner
  // INFORMATIVO en el ejecutor; el flujo de guardado RN no cambia (escribe el log de hoy).
  const { planId, recuperar, fecha } = useLocalSearchParams<{ planId: string; recuperar?: string; fecha?: string }>()
  const recoverDate = typeof recuperar === 'string' ? recuperar : undefined
  const editDate = typeof fecha === 'string' ? fecha : undefined
  return <ExecutorV3 planId={planId} recoverDate={recoverDate} editDate={editDate} />
}
