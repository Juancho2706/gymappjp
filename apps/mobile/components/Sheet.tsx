import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
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
  /**
   * Non-scrolling header slot rendered BETWEEN the handle and the scroll body
   * (outside the scroll region), so a custom header stays pinned while only the
   * body scrolls — mirrors web's `shrink-0` header + `overflow-y-auto` body split
   * (web SubstituteExerciseSheet.tsx:76 vs :89). Supersedes `title`/`description`
   * when a caller needs richer header markup. The caller owns its own padding.
   */
  headerSlot?: ReactNode
  /** Pinned action row at the bottom (own border + sunken bg). */
  footer?: ReactNode
  /** Top-right dismiss affordance. Default true. */
  showCloseButton?: boolean
  /**
   * Accessible name announced for the whole sheet/dialog (screen readers) —
   * mirrors web `SheetContent aria-label`. Forwarded to the native bottom-sheet
   * container. Omit to leave the sheet unnamed (default).
   */
  accessibilityLabel?: string
  children: ReactNode
}

export interface SheetProps extends OverlayCommonProps {
  /** @gorhom snap points. Default ['45%', '85%'] (matches the legacy sheet). */
  snapPoints?: (string | number)[]
  /** Drag handle. Default true. */
  showHandle?: boolean
  /** Wrap children in an internal scroll view. Default true. */
  scrollable?: boolean
  /**
   * Size the sheet to its content (hugging it) up to the largest `snapPoints`
   * fraction as a cap, instead of forcing a fixed snap height. Mirrors web's
   * bottom sheet `h-auto max-h-[85dvh]` (base sheet.tsx:58 `data-[side=bottom]:h-auto`
   * + caller `max-h-[85dvh]`): short states (empty/error/loading) render a short
   * sheet, tall content grows to the cap and then scrolls. Default false (fixed
   * snap points, unchanged for existing callers).
   */
  dynamicSizing?: boolean
  /**
   * Force the dark chrome (surface `ink-950`, `border-inverse`, on-dark handle/close)
   * regardless of the active theme. For overlays that must read dark on top of an
   * always-dark screen (e.g. the workout executor) — mirrors the web sheets that pin
   * `bg-[var(--ink-950)] text-on-dark` in both light and dark. Default false (theme-aware).
   */
  forceDark?: boolean
}

const TITLE_STYLE = { ...textStyle('lg', FONT.displayBold, { lh: 'snug', ls: 'tighter' }), textTransform: 'uppercase' as const }
const DEFAULT_SNAP: (string | number)[] = ['45%', '85%']

export function Sheet({
  open,
  onClose,
  title,
  description,
  headerSlot,
  footer,
  showCloseButton = true,
  scrollable = true,
  showHandle = true,
  snapPoints = DEFAULT_SNAP,
  dynamicSizing = false,
  accessibilityLabel,
  forceDark = false,
  children,
}: SheetProps) {
  const { resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const modalRef = useRef<BottomSheetModal>(null)

  // Cap for content-hugging (dynamic) sizing = the largest snap-point fraction of
  // the screen (e.g. '85%' → 0.85·height), so short content hugs and tall content
  // grows to the same 85% ceiling web enforces with `max-h-[85dvh]`. Falls back to
  // 85% when snap points carry no usable fraction.
  const maxDynamicContentSize = (() => {
    let fraction = 0
    for (const p of snapPoints) {
      if (typeof p === 'string') {
        const t = p.trim()
        if (t.endsWith('%')) fraction = Math.max(fraction, parseFloat(t) / 100)
      } else if (typeof p === 'number' && windowHeight > 0) {
        fraction = Math.max(fraction, p / windowHeight)
      }
    }
    return Math.round(windowHeight * Math.min(fraction > 0 ? fraction : 0.85, 1))
  })()

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
      // Dynamic mode: let @gorhom measure content and cap at maxDynamicContentSize
      // (content-hug up to 85%); otherwise keep the fixed snap points as before.
      snapPoints={dynamicSizing ? undefined : snapPoints}
      enableDynamicSizing={dynamicSizing}
      maxDynamicContentSize={dynamicSizing ? maxDynamicContentSize : undefined}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: 'transparent' }}
      handleComponent={null}
      // @gorhom already labels its content container (default 'Bottom Sheet');
      // forward the real dialog name so screen readers announce it (web aria-label parity).
      accessibilityLabel={accessibilityLabel}
    >
      {/* Surface rendered by us so DS tokens (not @gorhom style props) own the color. */}
      <View
        className={`${dynamicSizing ? '' : 'flex-1'} rounded-t-sheet border-t ${forceDark ? 'border-inverse bg-ink-950' : 'border-subtle bg-surface-card'}`}
        style={shadow('lg', resolvedScheme)}
      >
        {showHandle ? (
          <View className="items-center pt-space-3">
            <View className={`h-1 w-10 rounded-pill ${forceDark ? 'bg-white/15' : 'bg-ink-300 dark:bg-ink-600'}`} />
          </View>
        ) : null}

        {header}

        {/* Non-scrolling header slot: stays pinned above the scroll region (web `shrink-0` header). */}
        {headerSlot}

        {scrollable ? (
          <BottomSheetScrollView
            style={dynamicSizing ? undefined : { flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bodyPadBottom, gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </BottomSheetScrollView>
        ) : (
          <View className={dynamicSizing ? 'px-space-6' : 'flex-1 px-space-6'} style={{ paddingBottom: bodyPadBottom, gap: 14 }}>
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
            className={`absolute right-space-5 top-space-4 h-8 w-8 items-center justify-center rounded-pill border ${forceDark ? 'border-inverse bg-white/5' : 'border-subtle bg-surface-sunken'}`}
          >
            <X className={forceDark ? 'text-on-dark' : 'text-muted'} size={16} strokeWidth={2.4} />
          </TouchableOpacity>
        ) : null}
      </View>
    </BottomSheetModal>
  )
}
