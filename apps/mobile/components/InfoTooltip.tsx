import type { ReactNode } from 'react'
import { View, Text } from 'react-native'
import { Info } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { TYPE } from '../lib/typography'
import { Popover, PopoverTitle, PopoverDescription } from './Popover'

/**
 * EVA DS touch tooltip (RN mirror of web `components/ui/info-tooltip.tsx` +
 * `metric-info.tsx`).
 *
 * On web the `(i)` glyph opens a Radix popover on hover OR tap (it is NOT
 * hover-only). RN has no hover, so the mobile version is tap-to-open: the small
 * Info glyph is the trigger and a `Popover` (reused, same anchoring/flip engine)
 * shows the plain-language explanation. The trigger carries a generous `hitSlop`
 * so the tiny glyph stays a comfortable ~44px tap target.
 *
 * Chrome is DS: the popover surface flips light/dark + brand via NativeWind
 * tokens (handled inside `Popover`/`_anchored`); only the icon needs an explicit
 * `color` (lucide takes a prop, not a class), so it reads `--color-text-muted`
 * per resolved scheme from the token contract below — no legacy `theme` object.
 */

// Mirrors globals.css `--color-text-muted` (light = ink-500, dark = #98A2B0).
// Icon-only: everything else is class-driven. Keyed by resolvedScheme.
const MUTED_ICON = { light: '#5A6573', dark: '#98A2B0' } as const

export interface InfoTooltipProps {
  /** Short bold heading inside the popover (optional). */
  title?: string
  /** Plain-language explanation (the tooltip body). */
  content: string
  /** Icon size in px. Default 15 (web `w-4` ≈ 16). */
  size?: number
  /** Popover body width in px. Default 256 (web `w-64`). */
  width?: number
  /** Preferred side; flips automatically when there is no room. Default 'top'. */
  side?: 'top' | 'bottom'
}

/**
 * Tappable `(i)` glyph that reveals a short explanation in a Popover.
 *
 *   <InfoTooltip title="RIR" content="Reps en reserva…" />
 */
export function InfoTooltip({ title, content, size = 15, width = 256, side = 'top' }: InfoTooltipProps) {
  const { resolvedScheme } = useTheme()

  return (
    <Popover
      side={side}
      width={width}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      trigger={
        <View
          className="items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={title ? `Información: ${title}` : 'Información adicional'}
        >
          <Info size={size} color={MUTED_ICON[resolvedScheme]} strokeWidth={2} />
        </View>
      }
    >
      {title ? <PopoverTitle>{title}</PopoverTitle> : null}
      <PopoverDescription>{content}</PopoverDescription>
    </Popover>
  )
}

export interface MetricInfoProps {
  /** Metric label shown inline (e.g. "Tonelaje"). */
  label: string
  /** Plain-language explanation shown when the `(i)` is tapped. */
  content: string
  /** Popover heading. Defaults to `label`. */
  title?: string
  /** Label typography: 'eyebrow' (uppercase stat label, default) or 'label'. */
  variant?: 'eyebrow' | 'label'
  /** Preferred popover side. Default 'top'. */
  side?: 'top' | 'bottom'
  /** Extra label content (e.g. a unit) rendered before the icon. */
  children?: ReactNode
}

/**
 * A metric heading with an inline help affordance — DS label text followed by a
 * tappable `(i)`. For stat titles where the metric name needs an explanation.
 *
 *   <MetricInfo label="Tonelaje" content="Volumen de carga = suma de peso × reps." />
 */
export function MetricInfo({ label, content, title, variant = 'eyebrow', side = 'top', children }: MetricInfoProps) {
  return (
    <View className="flex-row items-center gap-space-2">
      <Text
        style={variant === 'eyebrow' ? TYPE.eyebrow : TYPE.label}
        className="text-muted"
        numberOfLines={1}
      >
        {label}
      </Text>
      {children}
      <InfoTooltip title={title ?? label} content={content} side={side} size={variant === 'eyebrow' ? 13 : 15} />
    </View>
  )
}
