/**
 * PortionSnackbar — snackbar de 5 s del marcar-porción (SPEC UX-b): "Porción
 * marcada · Deshacer". También transporta el error determinista ("No se pudo
 * marcar la porción. Reintentar") y el aviso offline como detalle secundario.
 * Overlay absoluto al pie del tab; live-region para lectores de pantalla.
 *
 * F-01: se ancla POR ENCIMA de la cápsula flotante del alumno
 * (`insets.bottom + ALUMNO_TABBAR_CLEARANCE + gap`, el mismo clearance que las
 * tabs reservan en su `contentContainerStyle`). La cápsula se monta como `tabBar`
 * del navigator, es decir en un padre por encima de la escena: ningún zIndex desde
 * aquí puede superarla, así que el "Deshacer" —única salida de una porción mal
 * marcada— tiene que quedar geométricamente arriba o es intocable.
 */
import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { useEvaMotion } from '../../../lib/motion'
import { ALUMNO_TABBAR_CLEARANCE } from '../AlumnoMobileChrome'

/** Aire entre el techo de la cápsula flotante y el borde inferior del snackbar. */
const CAPSULE_GAP = 12

export interface PortionSnackbarState {
  /** Nonce para re-animar cuando llega un snackbar nuevo con el mismo texto. */
  nonce: number
  message: string
  detail?: string | null
  actionLabel?: string | null
  onAction?: (() => void) | null
  tone?: 'neutral' | 'danger'
}

function PortionSnackbarBase({
  state,
  onDismiss,
}: {
  state: PortionSnackbarState | null
  onDismiss: () => void
}) {
  const { reduced, duration } = useEvaMotion()
  const insets = useSafeAreaInsets()
  if (!state) return null
  const danger = state.tone === 'danger'
  return (
    <MotiView
      key={state.nonce}
      from={reduced ? undefined : { opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: duration('base') }}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE + CAPSULE_GAP,
        // Por encima del contenido de la escena (la cápsula vive en otro padre y se
        // supera por posición, no por z).
        zIndex: 60,
      }}
      pointerEvents="box-none"
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        className={`flex-row items-center gap-3 rounded-card border px-4 py-3 ${
          danger
            ? 'border-danger-500/30 bg-danger-500/10'
            : 'border-border-subtle bg-surface-card'
        }`}
      >
        <View className="min-w-0 flex-1">
          <Text
            className={`text-sm font-semibold ${danger ? 'text-danger-700' : 'text-text-strong'}`}
            numberOfLines={2}
          >
            {state.message}
          </Text>
          {state.detail ? (
            <Text className="mt-0.5 text-xs leading-4 text-text-muted" numberOfLines={2}>
              {state.detail}
            </Text>
          ) : null}
        </View>
        {state.actionLabel && state.onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={state.actionLabel}
            hitSlop={8}
            onPress={() => {
              state.onAction?.()
              onDismiss()
            }}
            className="min-h-11 items-center justify-center rounded-control px-2"
          >
            <Text className="text-sm font-bold text-primary">{state.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </MotiView>
  )
}

export const PortionSnackbar = memo(PortionSnackbarBase)
