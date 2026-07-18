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
  const { planId } = useLocalSearchParams<{ planId: string }>()
  if (isEnabled('executorV2')) return <ExecutorV2 planId={planId} />
  return <LegacyExecutor />
}
