import { useLocalSearchParams } from 'expo-router'
import { isEnabled } from '../../../lib/flags'
import ExecutorV3 from '../../../components/alumno/workout/v3/ExecutorV3'
import ExecutorV2 from '../../../components/alumno/workout/ExecutorV2'
import LegacyExecutor from '../../../components/alumno/workout/LegacyExecutor'

/**
 * Pantalla de ejecución de rutina del alumno. Switch por flag: `executorV3` ON monta el shell de
 * presentación V3 (ExecutorV3) sobre el mismo motor; si está OFF, `executorV2` ON monta la
 * arquitectura de componentes DS (ExecutorV2); OFF (default, fail-safe) cae al LegacyExecutor
 * monolítico intacto. Ambos flags son remoteables vía /api/mobile/config (ver lib/flags). Cualquier
 * duda ⇒ V2/Legacy: V3 solo se monta con el flag explícitamente encendido.
 */
export default function WorkoutExecutionScreen() {
  // `recuperar` (dia pendiente de la semana) y `fecha` (dia ya hecho a revisar) los envia el sheet
  // doble intencion / la cola de pendientes del dashboard (E1.7). Por ahora solo alimentan un banner
  // INFORMATIVO en el ejecutor; el flujo de guardado RN no cambia (escribe el log de hoy).
  const { planId, recuperar, fecha } = useLocalSearchParams<{ planId: string; recuperar?: string; fecha?: string }>()
  const recoverDate = typeof recuperar === 'string' ? recuperar : undefined
  const editDate = typeof fecha === 'string' ? fecha : undefined
  if (isEnabled('executorV3')) return <ExecutorV3 planId={planId} recoverDate={recoverDate} editDate={editDate} />
  if (isEnabled('executorV2')) return <ExecutorV2 planId={planId} recoverDate={recoverDate} editDate={editDate} />
  return <LegacyExecutor />
}
