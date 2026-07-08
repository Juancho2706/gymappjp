import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { PressableProps } from 'react-native'
import { FONT, TYPE, textStyle } from '../lib/typography'
import { AnchoredPopup, useAnchor } from './_anchored'

/**
 * EVA DS anchored popover (mirror of web `components/ui/popover.tsx`).
 *
 * Visual parity with web PopoverContent:
 *  - overlay surface (rounded-xl, hairline border, elevation) anchored to the
 *    trigger, centered by default, with an optional pointer arrow toward it,
 *  - side-flip + viewport clamp via the shared `_anchored` engine,
 *  - fade + zoom-in entrance (mirrors web `data-open:zoom-in-95`),
 *  - `PopoverTitle` (DS display face, UPPERCASE) + `PopoverDescription` (muted)
 *    helpers mirror the web header slots.
 *
 * Difference vs. DropdownMenu: Popover holds arbitrary content (not an action
 * list) and shows the arrow by default. Chrome colors are NativeWind DS tokens
 * (bg-surface-overlay / border-subtle / text-*), so light/dark + brand flip
 * automatically. As an overlay it respects safe-area via the anchoring engine.
 */

export interface PopoverProps {
  /** Any node; wrapped in a measured Pressable that toggles the popover. */
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'end' | 'center'
  side?: 'top' | 'bottom'
  /** Popup width in px. Default 288 (web `w-72`). */
  width?: number
  /** Show the pointer arrow toward the trigger. Default true. */
  showArrow?: boolean
  disabled?: boolean
  /** Expanded touch region for the trigger (RN hitSlop). Lets tiny triggers
   * (e.g. a small info `(i)` glyph) keep a comfortable tap target without
   * inflating the measured anchor rect. */
  hitSlop?: PressableProps['hitSlop']
}

export function Popover({
  trigger,
  children,
  align = 'center',
  side = 'bottom',
  width = 288,
  showArrow = true,
  disabled,
  hitSlop,
}: PopoverProps) {
  const { ref, rect, measure, setRect } = useAnchor()
  const [open, setOpen] = useState(false)

  const close = () => {
    setOpen(false)
    setRect(null)
  }

  return (
    <>
      <Pressable
        ref={ref}
        disabled={disabled}
        hitSlop={hitSlop}
        onPress={() => measure(() => setOpen(true))}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
      >
        {trigger}
      </Pressable>

      <AnchoredPopup
        visible={open}
        anchor={rect}
        onClose={close}
        align={align}
        preferredSide={side}
        minWidth={width}
        showArrow={showArrow}
      >
        <View className="gap-space-3 p-space-5" style={{ maxWidth: width }}>
          {children}
        </View>
      </AnchoredPopup>
    </>
  )
}

const TITLE_STYLE = { ...textStyle('sm', FONT.displayBold, { lh: 'snug', ls: 'tight' }), textTransform: 'uppercase' as const }

/** Header title inside a Popover (mirrors web PopoverTitle). */
export function PopoverTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={TITLE_STYLE} className="text-strong">
      {children}
    </Text>
  )
}

/** Muted description line inside a Popover (mirrors web PopoverDescription). */
export function PopoverDescription({ children }: { children: ReactNode }) {
  return (
    <Text style={TYPE.caption} className="text-muted">
      {children}
    </Text>
  )
}
