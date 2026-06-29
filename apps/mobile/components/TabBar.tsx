import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

/**
 * EVA TabBar — the official bottom navigation (RN port of the DS `TabBar`,
 * docs/design-source/components/navigation/TabBar.{prompt.md,jsx}).
 *
 * Default look is the **floating capsule** (iOS-26 style): a translucent,
 * frosted pill that hovers just above content near the bottom of the screen,
 * with a brand-tinted sliding indicator (the runtime `--sport-*` ramp via
 * `theme.primary`) that glides behind the active tab. The active glyph fills
 * with the brand color; inactive glyphs stay outlined (`ink-400`). Pass
 * `minimized` to collapse it to an icon-only pill (used for hide-on-scroll).
 *
 * Positioning: the floating bar is `position:absolute`, pinned to the bottom of
 * its nearest positioned ancestor — drop it inside a `position:relative` screen
 * frame (a `flex-1` View). Reserve ~96px of bottom scroll padding so content can
 * scroll clear of it. Set `floating={false}` for the legacy docked bar that sits
 * in normal flow at the bottom of a column.
 *
 * Icon-agnostic: pass a `lucide-react-native` icon COMPONENT as `item.icon`
 * (the bar sizes + recolors it per active/inactive state, the RN analogue of the
 * web node coloring via `currentColor`).
 */

export interface TabBarItem {
  value: string
  label: string
  /** lucide-react-native icon component (sized + colored by the bar). */
  icon: LucideIcon
}

export interface TabBarProps {
  items: TabBarItem[]
  value: string
  onChange?: (value: string) => void
  /** Floating capsule is the official default; `false` = legacy docked bar. */
  floating?: boolean
  /** Collapse to an icon-only pill (hide-on-scroll); floating only. */
  minimized?: boolean
  style?: StyleProp<ViewStyle>
}

// Constant DS neutral for the inactive glyph/label (--ink-400, does NOT flip in
// dark per global.css). Not a brand color, so safe to inline.
const INK_400 = '#818C9A'

// Cool-tinted DS elevation for the floating capsule (rgba 13 18 28), matching
// the Card shadows. Single elevated drop (RN can't do the inset highlight).
const FLOAT_SHADOW: ViewStyle = {
  shadowColor: '#0D121C',
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.2,
  shadowRadius: 16,
  elevation: 12,
}

// Springy slide for the sliding indicator + minimize insets (--ease-spring).
const SPRING = { type: 'spring', damping: 16, stiffness: 180, mass: 1 } as const

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '')
  if (c.length !== 6) return hex
  const r = Number.parseInt(c.slice(0, 2), 16)
  const g = Number.parseInt(c.slice(2, 4), 16)
  const b = Number.parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function TabBar({
  items = [],
  value,
  onChange,
  floating = true,
  minimized = false,
  style,
}: TabBarProps) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const [barW, setBarW] = useState(0)

  const n = items.length || 1
  const idx = items.findIndex((it) => it.value === value)
  const activeIndex = idx < 0 ? 0 : idx

  const brand = theme.primary // runtime white-label brand (== --sport-500 family)
  const veil = hexToRgba(theme.card, floating ? 0.74 : 0.86) // surface-card tint
  const capsuleBorder = hexToRgba(theme.foreground, 0.09) // text-strong @ 9%
  const blurTint = isDark ? 'dark' : 'light'

  function handlePress(v: string) {
    void Haptics.selectionAsync()
    onChange?.(v)
  }

  function renderButton(it: TabBarItem) {
    const active = it.value === value
    const Icon = it.icon
    const color = active ? brand : INK_400
    const isFloating = floating
    return (
      <Pressable
        key={it.value}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={it.label}
        onPress={() => handlePress(it.value)}
        style={({ pressed }) => [
          {
            position: 'relative',
            zIndex: 1,
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: isFloating && minimized ? 0 : 3,
            paddingVertical: isFloating ? (minimized ? 5 : 6) : 4,
          },
          pressed ? { transform: [{ scale: 0.96 }] } : null,
        ]}
      >
        <MotiView
          animate={{ translateY: active ? -1 : 0 }}
          transition={SPRING}
          style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon
            size={24}
            color={color}
            strokeWidth={2}
            // Active glyph fills with the brand color at low opacity (DS
            // `.eva-tabbar-ico-on svg { fill: currentColor; fill-opacity:.18 }`).
            // lucide-react-native spreads fill/fillOpacity onto each child node.
            {...(active ? { fill: brand, fillOpacity: 0.18 } : null)}
          />
        </MotiView>
        {isFloating ? (
          <MotiView
            animate={{ height: minimized ? 0 : 14, opacity: minimized ? 0 : 1 }}
            transition={{ type: 'timing', duration: 220 }}
            style={{ overflow: 'hidden', justifyContent: 'center' }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10,
                letterSpacing: 0.1,
                color,
                fontFamily: active ? 'HankenGrotesk_800ExtraBold' : 'HankenGrotesk_600SemiBold',
              }}
            >
              {it.label}
            </Text>
          </MotiView>
        ) : (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 10.5,
              letterSpacing: 0.1,
              color,
              fontFamily: active ? 'HankenGrotesk_700Bold' : 'HankenGrotesk_600SemiBold',
            }}
          >
            {it.label}
          </Text>
        )}
      </Pressable>
    )
  }

  // ───────────────────────── Floating capsule (default) ─────────────────────
  if (floating) {
    const innerW = Math.max(0, barW - 16) // minus padding (8 each side)
    const tabW = innerW / n
    const indLeft = 8 + activeIndex * tabW

    return (
      <MotiView
        pointerEvents="box-none"
        animate={{ left: minimized ? 72 : 14, right: minimized ? 72 : 14 }}
        transition={SPRING}
        style={[
          {
            position: 'absolute',
            bottom: 24,
            zIndex: 45,
            borderRadius: 30,
            backgroundColor: veil, // iOS shadow shape + opaque fallback under blur
          },
          FLOAT_SHADOW,
          style,
        ]}
      >
        <View
          onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            padding: 8,
            borderRadius: 30,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: capsuleBorder,
          }}
        >
          <BlurView intensity={30} tint={blurTint} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: veil }} />

          {/* brand-tinted sliding indicator */}
          {barW > 0 ? (
            <MotiView
              pointerEvents="none"
              animate={{ left: indLeft, width: tabW, opacity: idx < 0 ? 0 : 1 }}
              transition={SPRING}
              style={{
                position: 'absolute',
                top: 8,
                bottom: 8,
                borderRadius: 22,
                zIndex: 0,
                backgroundColor: hexToRgba(brand, 0.15),
                borderWidth: 1,
                borderColor: hexToRgba(brand, 0.24),
              }}
            />
          ) : null}

          {items.map(renderButton)}
        </View>
      </MotiView>
    )
  }

  // ───────────────────────── Legacy docked bar ──────────────────────────────
  const segW = barW / n
  const dockLeft = activeIndex * segW + 10
  const dockW = Math.max(0, segW - 20)

  return (
    <View
      onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
      style={[
        {
          position: 'relative',
          flexDirection: 'row',
          alignItems: 'stretch',
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: veil,
          borderTopWidth: 1,
          borderTopColor: theme.border, // border-subtle
        },
        style,
      ]}
    >
      <BlurView intensity={24} tint={blurTint} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: veil }} />

      {barW > 0 ? (
        <MotiView
          pointerEvents="none"
          animate={{ left: dockLeft, width: dockW, opacity: idx < 0 ? 0 : 1 }}
          transition={SPRING}
          style={{
            position: 'absolute',
            top: 6,
            bottom: 8,
            borderRadius: 10, // --radius-md
            zIndex: 0,
            backgroundColor: hexToRgba(brand, 0.12),
            borderWidth: 1,
            borderColor: hexToRgba(brand, 0.24),
          }}
        />
      ) : null}

      {items.map(renderButton)}
    </View>
  )
}
