/**
 * PortionChip — chip interactivo de porciones por grupo dentro de una franja
 * (SPEC UX-b). Circulito con el código (color del grupo = SOLO identidad, letra
 * blanca) + nombre + segmentos (media porción = semicírculo) + contador n/N.
 * Segmento lleno = `primary` (white-label); derivado-de-alimento = relleno primary
 * con anillo fino; pendiente de sincronizar = opacidad + puntito ámbar (patrón
 * NutritionSyncState). Tap = marcar el siguiente segmento (NUNCA abre el sheet);
 * long-press = atajo al sheet de equivalencias.
 */
import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { Check } from 'lucide-react-native'
import { NUTRITION_MOTION, type NutritionSlotExchangeTargetRead } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import {
  formatPortionsCl,
  nextPortionStep,
  type PortionCoverageView,
  type PortionHalfKind,
  type PortionSegmentView,
} from '../../../lib/nutrition-v2-portions'
import { useEvaMotion } from '../../../lib/motion'
import { useTheme } from '../../../context/ThemeContext'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/** Circulito de identidad del grupo: hex del catálogo + letra blanca (patrón V1). */
export function GroupDot({ code, color, size = 20 }: { code: string; color: string; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Text
        allowFontScaling={false}
        className="font-bold text-white"
        style={{ fontSize: Math.max(Math.round(size * 0.42), 8) }}
        numberOfLines={1}
      >
        {code}
      </Text>
    </View>
  )
}

const HALF_FILL: Record<PortionHalfKind, string> = {
  empty: '',
  marked: 'bg-primary',
  derived: 'bg-primary',
  pending: 'bg-primary/50',
}

function SegmentHalf({ kind, side }: { kind: PortionHalfKind; side: 'left' | 'right' }) {
  return <View className={cx('h-full flex-1', HALF_FILL[kind], side === 'left' ? '' : '')} />
}

/** Un segmento = una porción (dos mitades) o la media porción final (semicírculo). */
function Segment({ segment }: { segment: PortionSegmentView }) {
  const isHalfWidth = segment.right === null
  const hasDerived = segment.left === 'derived' || segment.right === 'derived'
  const body = (
    <View
      className={cx(
        'flex-row overflow-hidden border',
        segment.left === 'empty' && (segment.right === 'empty' || segment.right === null)
          ? 'border-border-default'
          : 'border-transparent',
        'bg-surface-sunken',
      )}
      style={
        isHalfWidth
          ? { width: 8, height: 14, borderTopLeftRadius: 7, borderBottomLeftRadius: 7 }
          : { width: 14, height: 14, borderRadius: 7 }
      }
    >
      <SegmentHalf kind={segment.left} side="left" />
      {segment.right !== null ? <SegmentHalf kind={segment.right} side="right" /> : null}
    </View>
  )
  if (!hasDerived) return body
  // Derivado-de-alimento: anillo fino `primary` alrededor del relleno (SPEC UX-b).
  return (
    <View
      className="items-center justify-center rounded-full border border-primary"
      style={{ width: 18, height: 18, padding: 1 }}
    >
      {body}
    </View>
  )
}

export interface PortionChipProps {
  target: NutritionSlotExchangeTargetRead
  view: PortionCoverageView
  /** Hex de identidad del grupo (exchangeGroupColor ya resuelto). */
  color: string
  onPress: () => void
  onLongPress: () => void
  disabled?: boolean
}

function PortionChipBase({ target, view, color, onPress, onLongPress, disabled }: PortionChipProps) {
  const { theme } = useTheme()
  const { reduced, duration } = useEvaMotion()
  const step = nextPortionStep(view)
  const aria =
    step.portions === 0.5
      ? PORTIONS_COPY.student.halfChipAria(
          target.groupName,
          formatPortionsCl(view.coverage),
          formatPortionsCl(view.prescribed),
        )
      : PORTIONS_COPY.student.chipAria(
          target.groupName,
          formatPortionsCl(view.coverage),
          formatPortionsCl(view.prescribed),
        )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aria}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      hitSlop={4}
      className="min-h-11 flex-row items-center gap-2 rounded-control px-1"
    >
      {({ pressed }) => (
        <MotiView
          animate={{ scale: reduced || disabled ? 1 : pressed ? NUTRITION_MOTION.press.scale : 1 }}
          transition={{ type: 'timing', duration: duration('fast') }}
          className="flex-1 flex-row items-center gap-2"
        >
          <GroupDot code={target.groupCode} color={color} size={20} />
          <Text className="min-w-0 flex-1 text-sm font-medium text-text-strong" numberOfLines={1}>
            {target.groupName}
          </Text>
          {/* Segmentos decorativos: el contador n/N es el texto real (a11y del SPEC). */}
          <MotiView
            key={`${view.marcadas}-${view.derivadas}`}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            from={reduced ? undefined : { scale: 0.92 }}
            animate={{ scale: 1 }}
            transition={{ type: 'timing', duration: duration('fast') }}
            className="flex-row items-center gap-1"
          >
            {view.segments.map((segment) => (
              <Segment key={segment.key} segment={segment} />
            ))}
          </MotiView>
          {view.unsynced ? (
            <View className="h-1.5 w-1.5 rounded-full bg-warning-500" />
          ) : null}
          <Text className="font-mono text-xs font-semibold text-text-body" style={{ fontVariant: ['tabular-nums'] }}>
            {formatPortionsCl(view.coverage)}/{formatPortionsCl(view.prescribed)}
          </Text>
          {view.excess > 0 ? (
            <Text className="text-xs font-bold text-warning-700">
              {PORTIONS_COPY.student.extraBadge(formatPortionsCl(view.excess))}
            </Text>
          ) : view.complete ? (
            <Check color={theme.success} size={14} />
          ) : null}
        </MotiView>
      )}
    </Pressable>
  )
}

export const PortionChip = memo(PortionChipBase)
