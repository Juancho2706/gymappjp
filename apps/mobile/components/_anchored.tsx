import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal, Pressable, useWindowDimensions, View } from 'react-native'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../context/ThemeContext'
import { shadow } from '../lib/shadows'

/**
 * Shared anchoring engine for the anchored overlays (DropdownMenu + Popover).
 * Internal (underscore) — not a public DS primitive on its own; it exists so the
 * two anchored overlays share ONE measurement + flip + clamp implementation
 * instead of drifting apart.
 *
 * Web parity: on web `@base-ui` Positioner does anchor measurement, side flip
 * and viewport collision for `dropdown-menu`/`popover`. RN has no such engine,
 * so we replicate the load-bearing bits:
 *  - measure the trigger in window coords (`measureInWindow`),
 *  - render the popup in a transparent `Modal` (window-coord space),
 *  - flip side (bottom↔top) when the preferred side lacks room,
 *  - clamp horizontally inside the safe viewport,
 *  - fade + zoom-in entrance (mirrors web `data-open:zoom-in-95`).
 *
 * The popup surface uses DS tokens (bg-surface-overlay / border-subtle) so
 * light/dark + brand flip automatically; only `resolvedScheme` is read for the
 * elevation token (frozen `lib/theme` shim gets no new consumer).
 */

export interface AnchorRect {
  x: number
  y: number
  width: number
  height: number
}

/** Ref + measured rect for a trigger. Attach `ref` to a `View`, call `measure()`
 * on press, read `rect` once populated. */
export function useAnchor() {
  const ref = useRef<View>(null)
  const [rect, setRect] = useState<AnchorRect | null>(null)
  const measure = useCallback((cb?: (r: AnchorRect) => void) => {
    ref.current?.measureInWindow((x, y, width, height) => {
      const r = { x, y, width, height }
      setRect(r)
      cb?.(r)
    })
  }, [])
  return { ref, rect, setRect, measure }
}

const VIEWPORT_MARGIN = 8

export interface AnchoredPopupProps {
  visible: boolean
  anchor: AnchorRect | null
  onClose: () => void
  /** Horizontal alignment of the popup relative to the trigger. */
  align?: 'start' | 'end' | 'center'
  /** Preferred vertical side; flips automatically when there is no room. */
  preferredSide?: 'top' | 'bottom'
  /** Gap between trigger edge and popup. Default 6. */
  sideOffset?: number
  /** Force popup width to the trigger width (menu-on-a-full-width-button). */
  matchAnchorWidth?: boolean
  minWidth?: number
  /** Render a little pointer square toward the trigger (Popover). */
  showArrow?: boolean
  /** Dim the backdrop (Popover=false, modal-ish menus can opt in). Default false. */
  dim?: boolean
  children: ReactNode
}

/**
 * A popup anchored to a measured trigger rect, rendered in a Modal so it escapes
 * any parent clipping/scroll. Positions itself only after it has measured its
 * own size (via onLayout) so it never flashes at the wrong spot.
 */
export function AnchoredPopup({
  visible,
  anchor,
  onClose,
  align = 'start',
  preferredSide = 'bottom',
  sideOffset = 6,
  matchAnchorWidth = false,
  minWidth,
  showArrow = false,
  dim = false,
  children,
}: AnchoredPopupProps) {
  const { resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { width: W, height: H } = useWindowDimensions()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Reset measured size whenever we (re)open so a stale size never mispositions.
  const ready = visible && anchor != null && size != null

  if (!visible || !anchor) {
    // Keep the Modal mounted only while visible; unmount clears `size`.
    return null
  }

  // ---- vertical placement (flip when the preferred side lacks room) ----
  const popH = size?.height ?? 0
  const spaceBelow = H - (anchor.y + anchor.height) - insets.bottom - VIEWPORT_MARGIN
  const spaceAbove = anchor.y - insets.top - VIEWPORT_MARGIN
  let side = preferredSide
  if (side === 'bottom' && popH + sideOffset > spaceBelow && spaceAbove > spaceBelow) side = 'top'
  else if (side === 'top' && popH + sideOffset > spaceAbove && spaceBelow > spaceAbove) side = 'bottom'

  const maxHeight = Math.max(120, (side === 'bottom' ? spaceBelow : spaceAbove) - sideOffset)
  const top =
    side === 'bottom'
      ? anchor.y + anchor.height + sideOffset
      : anchor.y - popH - sideOffset

  // ---- horizontal placement + clamp ----
  const popW = matchAnchorWidth ? anchor.width : size?.width ?? 0
  let left: number
  if (matchAnchorWidth) left = anchor.x
  else if (align === 'end') left = anchor.x + anchor.width - popW
  else if (align === 'center') left = anchor.x + anchor.width / 2 - popW / 2
  else left = anchor.x
  const maxLeft = W - insets.right - VIEWPORT_MARGIN - popW
  const minLeft = insets.left + VIEWPORT_MARGIN
  left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft)))

  // Arrow points at the trigger center, clamped inside the popup body.
  const ARROW = 12
  const arrowLeft = Math.max(
    ARROW,
    Math.min(anchor.x + anchor.width / 2 - left - ARROW / 2, Math.max(ARROW, popW - ARROW * 2)),
  )

  return (
    <Modal transparent visible={visible} statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Pressable
        className={dim ? 'flex-1 bg-black/40' : 'flex-1'}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar menú"
      >
        <MotiView
          // Measure first (opacity 0), then reveal with fade + zoom.
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout
            if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) {
              setSize({ width, height })
            }
          }}
          from={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: ready ? 1 : 0, scale: ready ? 1 : 0.96 }}
          transition={{ type: 'timing', duration: 130 }}
          pointerEvents="box-none"
          style={[
            {
              position: 'absolute',
              top: ready ? top : -9999,
              left: ready ? left : 0,
              width: matchAnchorWidth ? anchor.width : undefined,
              minWidth: minWidth ?? (matchAnchorWidth ? undefined : 176),
              maxWidth: W - insets.left - insets.right - VIEWPORT_MARGIN * 2,
              maxHeight,
            },
            shadow('lg', resolvedScheme),
          ]}
        >
          {showArrow ? (
            <View
              className="absolute h-3 w-3 rounded-[2px] border-subtle bg-surface-overlay"
              style={
                side === 'bottom'
                  ? { top: -6, left: arrowLeft, borderTopWidth: 1, borderLeftWidth: 1, transform: [{ rotate: '45deg' }] }
                  : { bottom: -6, left: arrowLeft, borderBottomWidth: 1, borderRightWidth: 1, transform: [{ rotate: '45deg' }] }
              }
            />
          ) : null}
          {/* Surface: DS overlay bg + hairline border + popover radius. */}
          <View className="flex-1 overflow-hidden rounded-xl border border-subtle bg-surface-overlay">
            {children}
          </View>
        </MotiView>
      </Pressable>
    </Modal>
  )
}
