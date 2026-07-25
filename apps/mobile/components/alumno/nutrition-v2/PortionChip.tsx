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
import { NUTRITION_MOTION, type NutritionSlotExchangeTargetRead } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import {
  formatPortionsCl,
  nextPortionStep,
  portionBarFractions,
  portionChipIsCompact,
  type PortionCoverageView,
  type PortionHalfKind,
  type PortionSegmentView,
} from '../../../lib/nutrition-v2-portions'
import { useEvaMotion } from '../../../lib/motion'

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
  derived: 'bg-primary/70',
  pending: 'bg-primary/50',
}

function SegmentHalf({ kind, side }: { kind: PortionHalfKind; side: 'left' | 'right' }) {
  return <View className={cx('h-full flex-1', HALF_FILL[kind], side === 'left' ? '' : '')} />
}

/** Un segmento = una porción (dos mitades) o la media porción final (semicírculo). */
function Segment({ segment }: { segment: PortionSegmentView }) {
  const isHalfWidth = segment.right === null
  const hasDerived = segment.left === 'derived' || segment.right === 'derived'
  const filled = segment.left !== 'empty' || (segment.right !== 'empty' && segment.right !== null)
  return (
    <View
      className={cx(
        'flex-row overflow-hidden border bg-surface-sunken',
        hasDerived ? 'border-primary' : filled ? 'border-primary/60' : 'border-border-default',
      )}
      style={
        isHalfWidth
          ? { width: 7, height: 12, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }
          : { width: 12, height: 12, borderRadius: 6 }
      }
    >
      <SegmentHalf kind={segment.left} side="left" />
      {segment.right !== null ? <SegmentHalf kind={segment.right} side="right" /> : null}
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
  const { reduced, duration } = useEvaMotion()
  const step = nextPortionStep(view)
  // Cap visual H4: >8 segmentos ⇒ barra continua compacta (jamás desborda en 360 px).
  const compact = portionChipIsCompact(view.prescribed)
  const bar = compact ? portionBarFractions(view.prescribed, view.marcadas, view.derivadas) : null
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
      accessibilityHint={PORTIONS_COPY.student.equivalencesHint}
      accessibilityState={{ disabled: disabled === true, busy: view.unsynced }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      hitSlop={4}
      className="min-h-11 flex-row items-center gap-2.5 rounded-control border border-border-subtle bg-surface-card px-2.5 py-1.5"
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
          {view.unsynced ? (
            <MotiView
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              from={reduced ? undefined : { opacity: 0.45 }}
              animate={{ opacity: 1 }}
              transition={
                reduced
                  ? undefined
                  : { type: 'timing', duration: 700, loop: true, repeatReverse: true }
              }
              className="h-1.5 w-1.5 rounded-full bg-warning-500"
            />
          ) : null}
          {/* Segmentos/barra decorativos: el contador n/N es el texto real (a11y del SPEC). */}
          <MotiView
            key={`${view.marcadas}-${view.derivadas}`}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            from={reduced ? undefined : { scale: 0.92 }}
            animate={{ scale: 1 }}
            transition={{ type: 'timing', duration: duration('fast') }}
            className="flex-row items-center gap-1"
          >
            {compact && bar ? (
              // Barra continua compacta (H4): relleno pleno = marcadas, atenuado = derivadas.
              <View
                className={cx(
                  'h-2.5 w-16 flex-row overflow-hidden rounded-full border bg-surface-sunken',
                  bar.marked + bar.derived > 0 ? 'border-primary/60' : 'border-border-default',
                  view.unsynced && 'opacity-60',
                )}
              >
                <View className="h-full bg-primary" style={{ width: `${bar.marked * 100}%` }} />
                <View className="h-full bg-primary/70" style={{ width: `${bar.derived * 100}%` }} />
              </View>
            ) : (
              view.segments.map((segment) => <Segment key={segment.key} segment={segment} />)
            )}
          </MotiView>
          {view.excess > 0 ? (
            <View className="rounded-pill border border-warning-500/40 bg-warning-500/10 px-1.5 py-0.5">
              <Text className="text-[10px] font-bold text-warning-700">
                {PORTIONS_COPY.student.extraBadge(formatPortionsCl(view.excess))}
              </Text>
            </View>
          ) : null}
          <Text
            className="text-xs font-semibold text-text-muted"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatPortionsCl(view.displayCoverage)}/{formatPortionsCl(view.prescribed)}
          </Text>
        </MotiView>
      )}
    </Pressable>
  )
}

export const PortionChip = memo(PortionChipBase)
