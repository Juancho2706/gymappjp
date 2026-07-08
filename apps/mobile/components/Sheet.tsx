import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { cssInterop } from 'nativewind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { FONT, TYPE, textStyle } from '../lib/typography'
import { shadow } from '../lib/shadows'

/**
 * EVA DS canonical bottom-sheet (mirror of web `components/ui/sheet.tsx`, bottom
 * side). Declarative `open`/`onClose` — same shape as `Dialog` (see
 * `OverlayCommonProps`) so both overlays share one mental model and the web's
 * `<Sheet open>` parity. Built on `@gorhom/bottom-sheet` (reanimated + gesture
 * engine already used across the app; `BottomSheetModalProvider` lives in
 * `app/_layout.tsx`). The imperative present/dismiss is bridged from `open`
 * internally so callers never touch a ref.
 *
 * Visual parity with web SheetContent:
 *  - rounded top (radius `sheet` = 28px) + hairline top border (border-subtle)
 *  - drag handle, black/60 backdrop, title UPPERCASE in the DS display face
 *    (Archivo — web uses Montserrat; the DS mirror maps display → Archivo),
 *  - internal scroll, safe-area bottom padding, optional pinned footer.
 *
 * Chrome colors come from NativeWind DS tokens (bg-surface-card, border-subtle,
 * text-strong/-muted, ink ramp for the handle) so light/dark + brand override
 * flip automatically — the sheet's own background is transparent and we render
 * the surface ourselves. Only `resolvedScheme` (for the elevation token) is read
 * from context; the frozen `lib/theme` shim gets no new consumer.
 *
 * NOTE: web adds a ~6% primary top-gradient wash; omitted here (decorative, and
 * the brand hue lives only as a NativeWind css-var, not a JS literal). Revisit
 * with a tokenized gradient primitive if it becomes load-bearing.
 */

// Let NativeWind drive the lucide icon color via `className` (text-*).
cssInterop(X, { className: { target: 'style', nativeStyleToProp: { color: true } } })

export interface OverlayCommonProps {
  /** Controlled visibility. */
  open: boolean
  /** Fired on any close path (backdrop, swipe-down, close button, back gesture). */
  onClose: () => void
  title?: string
  description?: string
  /** Pinned action row at the bottom (own border + sunken bg). */
  footer?: ReactNode
  /** Top-right dismiss affordance. Default true. */
  showCloseButton?: boolean
  children: ReactNode
}

export interface SheetProps extends OverlayCommonProps {
  /** @gorhom snap points. Default ['45%', '85%'] (matches the legacy sheet). */
  snapPoints?: (string | number)[]
  /** Drag handle. Default true. */
  showHandle?: boolean
  /** Wrap children in an internal scroll view. Default true. */
  scrollable?: boolean
}

const TITLE_STYLE = { ...textStyle('lg', FONT.displayBold, { lh: 'snug', ls: 'tighter' }), textTransform: 'uppercase' as const }
const DEFAULT_SNAP: (string | number)[] = ['45%', '85%']

export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  showCloseButton = true,
  scrollable = true,
  showHandle = true,
  snapPoints = DEFAULT_SNAP,
  children,
}: SheetProps) {
  const { resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const modalRef = useRef<BottomSheetModal>(null)

  // Bridge declarative `open` → imperative present/dismiss.
  useEffect(() => {
    if (open) modalRef.current?.present()
    else modalRef.current?.dismiss()
  }, [open])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} pressBehavior="close" />
    ),
    []
  )

  const header =
    title || description ? (
      <View className="px-space-6 pt-space-4 pb-space-3">
        {title ? (
          <Text style={TITLE_STYLE} className="text-strong pr-space-9" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text style={TYPE.caption} className="text-muted mt-space-2">
            {description}
          </Text>
        ) : null}
      </View>
    ) : null

  const bodyPadBottom = footer ? 12 : insets.bottom + 24

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: 'transparent' }}
      handleComponent={null}
    >
      {/* Surface rendered by us so DS tokens (not @gorhom style props) own the color. */}
      <View className="flex-1 rounded-t-sheet border-t border-subtle bg-surface-card" style={shadow('lg', resolvedScheme)}>
        {showHandle ? (
          <View className="items-center pt-space-3">
            <View className="h-1 w-10 rounded-pill bg-ink-300 dark:bg-ink-600" />
          </View>
        ) : null}

        {header}

        {scrollable ? (
          <BottomSheetScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bodyPadBottom, gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </BottomSheetScrollView>
        ) : (
          <View className="flex-1 px-space-6" style={{ paddingBottom: bodyPadBottom, gap: 14 }}>
            {children}
          </View>
        )}

        {footer ? (
          <View className="border-t border-subtle bg-surface-sunken px-space-6 pt-space-4" style={{ paddingBottom: insets.bottom + 16 }}>
            {footer}
          </View>
        ) : null}

        {showCloseButton ? (
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            className="absolute right-space-5 top-space-4 h-8 w-8 items-center justify-center rounded-pill border border-subtle bg-surface-sunken"
          >
            <X className="text-muted" size={16} strokeWidth={2.4} />
          </TouchableOpacity>
        ) : null}
      </View>
    </BottomSheetModal>
  )
}
