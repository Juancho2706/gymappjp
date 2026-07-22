import { useLocalSearchParams } from 'expo-router'
import { isEnabled } from '../../../lib/flags'
import ExecutorV2 from '../../../components/alumno/workout/ExecutorV2'
import LegacyExecutor from '../../../components/alumno/workout/LegacyExecutor'

/**
 * Pantalla de ejecución de rutina del alumno. Switch por flag (E2-17): `executorV2` ON monta la nueva
 * arquitectura de componentes DS sobre @eva/workout-engine (ExecutorV2); OFF (default, fail-safe) cae
 * al LegacyExecutor monolítico intacto. El flag es remoteable vía /api/mobile/config (ver lib/flags).
 */
export default function WorkoutExecutionScreen() {
  // `recuperar` (dia pendiente de la semana) y `fecha` (dia ya hecho a revisar) los envia el sheet
  // doble intencion / la cola de pendientes del dashboard (E1.7). Por ahora solo alimentan un banner
  // INFORMATIVO en el ejecutor; el flujo de guardado RN no cambia (escribe el log de hoy).
  const { planId, recuperar, fecha } = useLocalSearchParams<{ planId: string; recuperar?: string; fecha?: string }>()
  const recoverDate = typeof recuperar === 'string' ? recuperar : undefined
  const editDate = typeof fecha === 'string' ? fecha : undefined
  if (isEnabled('executorV2')) return <ExecutorV2 planId={planId} recoverDate={recoverDate} editDate={editDate} />
  return <LegacyExecutor />
}
