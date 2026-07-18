import { MotiView } from 'moti'
import { Pressable, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { SHADOWS } from '../lib/shadows'
import { haptics } from '../lib/haptics'

/**
 * EVA Switch — on/off toggle (RN port of the DS `Switch`, web
 * `components/ui/switch.tsx` = Base UI `Switch.Root/Thumb`).
 *
 * Web parity:
 *  - track = rounded-full pill; `data-checked:bg-primary` (brand accent),
 *    unchecked = `bg-input` (faint neutral). Thumb = rounded-full, `bg-background`
 *    (white), slides from left to `translate-x-[calc(100%-2px)]`.
 *  - sizes: default h-[18.4px] w-[32px] thumb size-4 (16); sm h-[14px] w-[24px]
 *    thumb size-3 (12). Ported below to the same geometry.
 *  - disabled → 50% opacity, no press.
 *
 * The "on" color is `theme.primary` (the live white-label brand accent resolved
 * by ThemeContext) — never a hardcoded brand hex. Track/thumb color and the thumb
 * position are animated with Moti (spring), mirroring the web `transition-all` /
 * `transition-transform`. Drop-in for RN's `Switch` API (`value`/`onValueChange`).
 */

type Size = 'sm' | 'md'

interface SwitchProps {
  value: boolean
  onValueChange: (next: boolean) => void
  size?: Size
  disabled?: boolean
  /** Fire a selection haptic on toggle (default true). */
  haptic?: boolean
}

// Geometry per size — mirrors the web track/thumb dimensions. `travel` is the
// thumb x-translation between off and on = trackW - thumb - 2*pad (leaves the
// same 2px gutter the web `calc(100%-2px)` produces).
const SIZE_MAP: Record<Size, { trackW: number; trackH: number; thumb: number; pad: number }> = {
  md: { trackW: 32, trackH: 18, thumb: 16, pad: 1 },
  sm: { trackW: 24, trackH: 14, thumb: 12, pad: 1 },
}

export function Switch({ value, onValueChange, size = 'md', disabled, haptic = true }: SwitchProps) {
  const { theme, resolvedScheme } = useTheme()
  const sz = SIZE_MAP[size]
  const travel = sz.trackW - sz.thumb - sz.pad * 2

  // Off-track neutral (web `bg-input`): a low-contrast fill that still reads on
  // both surfaces. On-track = live brand accent.
  const offTrack = resolvedScheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'
  const trackColor = value ? theme.primary : offTrack

  const thumbStyle: ViewStyle = {
    width: sz.thumb,
    height: sz.thumb,
    borderRadius: sz.thumb / 2,
    backgroundColor: '#FFFFFF',
    ...SHADOWS[resolvedScheme].xs,
  }

  function toggle() {
    if (disabled) return
    if (haptic) haptics.select()
    onValueChange(!value)
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={toggle}
      hitSlop={12}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <MotiView
        animate={{ backgroundColor: trackColor }}
        transition={{ type: 'timing', duration: 160 }}
        style={{
          width: sz.trackW,
          height: sz.trackH,
          borderRadius: sz.trackH / 2,
          paddingHorizontal: sz.pad,
          justifyContent: 'center',
        }}
      >
        <MotiView
          animate={{ translateX: value ? travel : 0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 260 }}
          style={thumbStyle}
        />
      </MotiView>
    </Pressable>
  )
}
