import { Fragment, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { cssInterop } from 'nativewind'
import { FONT, TYPE, textStyle } from '../lib/typography'
import { AnchoredPopup, useAnchor } from './_anchored'
import { Sheet } from './Sheet'

/**
 * EVA DS anchored menu (mirror of web `components/ui/dropdown-menu.tsx`) +
 * `ActionSheet` (the bottom-sheet variant of a menu, native to mobile).
 *
 * Visual parity with the web dropdown-menu Popup/Item:
 *  - overlay surface (rounded-xl, hairline border, elevation) anchored to the
 *    trigger, side-flip + viewport clamp via the shared `_anchored` engine,
 *  - items: left icon, label, `destructive` (danger tint) and `disabled`
 *    (dimmed, non-interactive) states, pressed row = sunken bg (mirrors web
 *    `focus:bg-accent`), thin separators, optional group labels via `header`.
 *
 * The trigger is any node; we wrap it in a measured Pressable that toggles the
 * menu (its own onPress does not fire — matches a menu trigger). Chrome colors
 * are NativeWind DS tokens so light/dark + brand flip automatically.
 *
 * ActionSheet exists here (not in Sheet.tsx) because it shares the `MenuAction`
 * shape and item-row rendering with the dropdown — same mental model, two
 * surfaces (anchored popup vs. bottom sheet). Use the sheet form when the action
 * list is primary/thumb-reachable; use DropdownMenu when it hangs off a control.
 */

/** A lucide-react-native icon component (color driven via NativeWind className). */
type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

export interface MenuAction {
  key: string
  label: string
  icon?: IconComponent
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

// lucide-react-native icons need `color` set explicitly (no currentColor in RN).
// cssInterop maps a text-color className → the icon's `color` prop, so DS tokens
// (text-body / text-danger-500 / text-subtle) drive it and flip with the theme.
// Cache the wrapped component per icon so we configure each one once.
const iconInterop = new WeakMap<IconComponent, IconComponent>()
function themedIcon(Icon: IconComponent): IconComponent {
  let wrapped = iconInterop.get(Icon)
  if (!wrapped) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapped = cssInterop(Icon as any, { className: { target: 'style', nativeStyleToProp: { color: true } } }) as IconComponent
    iconInterop.set(Icon, wrapped)
  }
  return wrapped
}

const LABEL_STYLE = textStyle('sm', FONT.uiMedium, { lh: 'normal' })

/** A single tappable action row — shared by DropdownMenu and ActionSheet. */
function MenuItemRow({ item, onDone, large }: { item: MenuAction; onDone: () => void; large?: boolean }) {
  const Icon = item.icon ? themedIcon(item.icon) : null
  const tone = item.destructive ? 'text-danger-500' : 'text-body'
  return (
    <Pressable
      disabled={item.disabled}
      onPress={() => {
        onDone()
        item.onSelect()
      }}
      accessibilityRole="menuitem"
      accessibilityState={{ disabled: item.disabled }}
      className={`flex-row items-center gap-space-4 rounded-lg px-space-4 ${large ? 'py-space-5' : 'py-space-4'} active:bg-surface-sunken ${item.disabled ? 'opacity-40' : ''}`}
    >
      {Icon ? <Icon size={large ? 20 : 18} strokeWidth={2} className={tone} /> : null}
      <Text style={LABEL_STYLE} className={`flex-1 ${tone}`} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  )
}

export interface DropdownMenuProps {
  /** Any node; wrapped in a measured Pressable that toggles the menu. */
  trigger: ReactNode
  items: MenuAction[]
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  minWidth?: number
  matchTriggerWidth?: boolean
  /** Optional label row at the top (mirrors web DropdownMenuLabel). */
  header?: string
  disabled?: boolean
}

export function DropdownMenu({
  trigger,
  items,
  align = 'start',
  side = 'bottom',
  minWidth,
  matchTriggerWidth = false,
  header,
  disabled,
}: DropdownMenuProps) {
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
        matchAnchorWidth={matchTriggerWidth}
        minWidth={minWidth}
      >
        {header ? (
          <Text
            style={{ ...TYPE.eyebrow }}
            className="px-space-4 pt-space-4 pb-space-2 text-subtle"
            numberOfLines={1}
          >
            {header}
          </Text>
        ) : null}
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 6 }}
          keyboardShouldPersistTaps="handled"
        >
          {items.map((item, i) => (
            <Fragment key={item.key}>
              {i > 0 && item.destructive && !items[i - 1]?.destructive ? (
                <View className="my-space-1 h-px bg-border" />
              ) : null}
              <MenuItemRow item={item} onDone={close} />
            </Fragment>
          ))}
        </ScrollView>
      </AnchoredPopup>
    </>
  )
}

export interface ActionSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  actions: MenuAction[]
  /** Label for the trailing cancel row. Pass null to omit. Default "Cancelar". */
  cancelLabel?: string | null
}

/**
 * Bottom-sheet list of actions — the mobile-native form of a menu. Built on the
 * `Sheet` primitive (drag handle, backdrop, safe-area) with `MenuAction` rows.
 * Height snaps to content (approx.) so a 2-action sheet is not a full-height
 * panel.
 */
export function ActionSheet({ open, onClose, title, description, actions, cancelLabel = 'Cancelar' }: ActionSheetProps) {
  // Approximate content height so the sheet is snug (rows are `py-space-5` ≈ 56px).
  const rowH = 56
  const headerH = title || description ? 76 : 24
  const cancelH = cancelLabel ? 64 : 0
  const snap = Math.min(560, headerH + actions.length * rowH + cancelH + 40)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      showCloseButton={false}
      scrollable={false}
      snapPoints={[snap]}
    >
      <View className="gap-space-1 pt-space-1">
        {actions.map((item) => (
          <MenuItemRow key={item.key} item={item} onDone={onClose} large />
        ))}
        {cancelLabel ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="mt-space-2 items-center rounded-control border border-subtle bg-surface-sunken py-space-5 active:opacity-70"
          >
            <Text style={LABEL_STYLE} className="text-muted">
              {cancelLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  )
}
