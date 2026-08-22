import { useState, type ComponentProps } from 'react'
import { RefreshCw } from 'lucide-react-native'
import { Button } from '../Button'
import { toast } from '../Toast'
import { refreshCoachAccess } from '../../lib/coach-access'
import { refreshEntitlements } from '../../lib/entitlements'
import { refreshWorkspace } from '../../lib/workspace'

type ButtonVariant = ComponentProps<typeof Button>['variant']
type ButtonSize = ComponentProps<typeof Button>['size']

interface RefreshPlanButtonProps {
  label?: string
  variant?: ButtonVariant
  size?: ButtonSize
  full?: boolean
  /** Se llama tras revalidar, para que la pantalla vuelva a leer su propio estado. */
  onRefreshed?: () => void
}

/**
 * Revalida los tres stores app-wide que definen "qué plan tengo" — la RUTINA, sin UI.
 *
 * Reusa el MISMO camino canónico que la bajada a Free (`handleActivateFree` en /coach/reactivate),
 * no un fetch nuevo: los tres se revalidan juntos porque cada uno manda sobre una cosa distinta y
 * refrescar solo uno deja la app creyendo lo anterior.
 *  - `coach-access`  → el gate de acceso a todo el árbol /coach.
 *  - `workspace`     → tier/estado que consume el switcher y la nav.
 *  - `entitlements`  → módulos incluidos.
 *
 * Los tres son fail-soft por diseño (conservan la cache ante fallo de red y no rechazan), así que
 * un throw de acá es lo inesperado, no el offline.
 *
 * Vive exportada (y no en `lib/`) porque el pull-to-refresh de «Mi plan» (W6.4) debe correr
 * EXACTAMENTE esto y nada más: dos rutinas de refresco divergirían al primer cambio.
 */
export async function refreshCoachPlan(): Promise<void> {
  await refreshCoachAccess(true)
  await Promise.all([refreshWorkspace(), refreshEntitlements().catch(() => {})])
}

/**
 * "Actualizar estado" — revalida el plan del coach SIN salir de la app.
 *
 * Es la única salida que le queda al coach cuando su plan cambia fuera del teléfono: la app no
 * puede llevarlo a ninguna superficie de pago (Apple 3.1.1 / política de pagos de Play), así que
 * lo mínimo es que el cambio se refleje al instante en vez de esperar al próximo foreground.
 */
export function RefreshPlanButton({
  label = 'Actualizar estado',
  variant = 'secondary',
  size,
  full,
  onRefreshed,
}: RefreshPlanButtonProps) {
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refreshCoachPlan()
      toast.success('Estado actualizado')
      onRefreshed?.()
    } catch {
      toast.error('No pudimos actualizar tu estado. Inténtalo de nuevo.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Button
      testID="refresh-plan"
      label={label}
      variant={variant}
      size={size}
      leftIcon={RefreshCw}
      loading={refreshing}
      disabled={refreshing}
      onPress={handleRefresh}
      full={full}
    />
  )
}
