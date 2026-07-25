import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Modal, PanResponder, Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { MotiView } from 'moti'
import { cssInterop } from 'nativewind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { useEvaMotion } from '../lib/motion'
import { FONT, TYPE, textStyle, type TypeSize } from '../lib/typography'
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
   * Forwarded to the internal scroll view (`scrollable`). Pins the child views at
   * these indices to the top while the rest scrolls — RN-idiomatic equivalent of a
   * `shrink-0` header + `overflow-y-auto` body split (web SubstituteExerciseSheet.tsx:76
   * vs :89): the pinned child STAYS in the measured content so `dynamicSizing` still
   * hugs correctly. Pinned children must carry an opaque background. Default none.
   */
  stickyHeaderIndices?: number[]
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
  /**
   * Extra bottom padding (px) added ON TOP of the safe-area inset for the scroll/body
   * content when there is NO footer. Default 24. Opt-in override for callers whose web
   * source pins an exact body `pb` and needs 1:1 parity — e.g. the substitution sheet's
   * body uses `pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]` = 20px + safe-area
   * (web SubstituteExerciseSheet.tsx:89), so it passes 20 to shave the default 24→20.
   * Ignored when a `footer` is present (footer path keeps its fixed 12px gap).
   */
  bodyPadBottomOffset?: number
  /**
   * Type-scale size of the title. Default `'lg'` (18px) for the standard sheet. Callers whose web
   * source renders a larger heading pass `'xl'` (21px) for scale parity — e.g. the technique modal
   * mirrors web `DialogTitle text-xl` (WorkoutExecutionClient.tsx:2079). Uppercase / tracking-tighter
   * / display-extrabold stay fixed; only the size changes.
   */
  titleSize?: TypeSize
  /**
   * Render via a native RN `<Modal>` (slide-up + backdrop) INSTEAD of `@gorhom/bottom-sheet`.
   *
   * WHY (QA-12, ronda 7): under this exact stack — `@gorhom/bottom-sheet@5.2.14` (written for
   * reanimated 3) + `react-native-reanimated@4.1.7` + `react-native-worklets@0.8.3` + RN 0.81.5 +
   * Expo SDK 54 New Architecture/Fabric — the gorhom modal is fragile in TWO independent, verified
   * ways:
   *   1. Cold-start no-op: the provider's `BottomSheetHostingContainer` seeds its shared
   *      `containerLayoutState.height` to `INITIAL_LAYOUT_VALUE = -999` and only overwrites it from an
   *      `onLayout` → reanimated `.modify()` worklet commit (bottomSheetModalProvider + hostingContainer
   *      source). If the FIRST `present()` (itself rAF-wrapped, BottomSheetModal.tsx:243) lands before
   *      that commit propagates under the reanimated-4 runtime, every snap point resolves against -999 →
   *      the sheet mounts fully off-screen (invisible). It only heals after an unrelated re-layout
   *      (navigation). This is exactly the "Más no abre al primer tap desde Home, sí tras visitar otra
   *      tab" symptom, and gorhom v5 does NOT officially support reanimated 4 (upstream issues #2546 /
   *      #2600).
   *   2. `enableDynamicSizing` is broken here (content measures to ~0 → "barra pegada abajo" / altura
   *      nula), already hit and worked-around in the builder sheets with `enableDynamicSizing={false}`
   *      (see CODEX_HANDOFF). Ronda 6 mistakenly ADDED dynamicSizing to the executor sheets, so tuerca /
   *      técnica still would not open.
   *
   * The native `<Modal>` path renders in its own OS window (no dependency on the gorhom hosting
   * container's measured height, no reanimated shared-value plumbing) and content-hugs naturally with a
   * `maxHeight` cap — the SAME proven pattern the numeric `KeypadHost` already uses reliably inside this
   * very executor. Public API (`open`/`onClose`/`title`/`footer`/`snapPoints`/`scrollable`/
   * `stickyHeaderIndices`/`forceDark`/…) is identical, so consumers only flip this one flag. `snapPoints`'
   * largest fraction becomes the max-height cap; `dynamicSizing` is implicit (content-hug is native).
   * Default false → existing gorhom consumers are untouched. Close vias: backdrop tap, close button,
   * Android back, swipe-down on the handle. Default false.
   */
  nativeModal?: boolean
  /**
   * Leading icon node inline with the title — mirrors web `SheetTitle` compuesto
   * `flex items-center gap-2` con glyph (p.ej. Trophy 18 sport-500 en
   * PRDetailSheet.tsx:130-133 web). Solo se pinta si hay `title`. Default none.
   */
  titleIcon?: ReactNode
}

/** Title style at a given scale size — uppercase, display-extrabold, tracking-tighter (fixed). */
const titleStyleFor = (size: TypeSize) => ({
  ...textStyle(size, FONT.displayBold, { lh: 'snug', ls: 'tighter' }),
  textTransform: 'uppercase' as const,
})
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
  stickyHeaderIndices,
  dynamicSizing = false,
  accessibilityLabel,
  forceDark = false,
  titleSize = 'lg',
  bodyPadBottomOffset = 24,
  nativeModal = false,
  titleIcon,
  children,
}: SheetProps) {
  const { resolvedScheme } = useTheme()
  const motion = useEvaMotion()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const modalRef = useRef<BottomSheetModal>(null)

  // Latest onClose for the imperative swipe handler (avoids stale closures without re-creating the
  // responder). Used only by the native-modal path.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Swipe-down on the handle dismisses in the native-modal path (parity with @gorhom
  // `enablePanDownToClose`). No live follow — a downward release past the threshold closes.
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && g.dy > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 48) onCloseRef.current()
      },
    }),
  ).current

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
          titleIcon ? (
            // Titulo con glyph inline (web SheetTitle `flex items-center gap-2`).
            <View className="pr-space-9" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {titleIcon}
              <Text style={[titleStyleFor(titleSize), { flexShrink: 1 }]} className="text-strong" numberOfLines={2}>
                {title}
              </Text>
            </View>
          ) : (
            <Text style={titleStyleFor(titleSize)} className="text-strong pr-space-9" numberOfLines={2}>
              {title}
            </Text>
          )
        ) : null}
        {description ? (
          <Text style={TYPE.caption} className="text-muted mt-space-2">
            {description}
          </Text>
        ) : null}
      </View>
    ) : null

  const bodyPadBottom = footer ? 12 : insets.bottom + bodyPadBottomOffset

  // Shared surface chrome (identical DS tokens across both render paths).
  const handleEl = showHandle ? (
    <View className="items-center pt-space-3">
      <View className={`h-1 w-10 rounded-pill ${forceDark ? 'bg-white/15' : 'bg-ink-300 dark:bg-ink-600'}`} />
    </View>
  ) : null
  const footerEl = footer ? (
    <View className="border-t border-subtle bg-surface-sunken px-space-6 pt-space-4" style={{ paddingBottom: insets.bottom + 16 }}>
      {footer}
    </View>
  ) : null
  const closeEl = showCloseButton ? (
    <TouchableOpacity
      onPress={onClose}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Cerrar"
      className={`absolute right-space-5 top-space-4 h-8 w-8 items-center justify-center rounded-pill border ${forceDark ? 'border-inverse bg-white/5' : 'border-subtle bg-surface-sunken'}`}
    >
      <X className={forceDark ? 'text-on-dark' : 'text-muted'} size={16} strokeWidth={2.4} />
    </TouchableOpacity>
  ) : null
  const contentContainerStyle = { paddingHorizontal: 20, paddingBottom: bodyPadBottom, gap: 14 }

  // ── Native `<Modal>` path (nativeModal) — bypasses @gorhom entirely. See the `nativeModal` prop
  // docs for the root-cause (cold-start containerHeight -999 + broken enableDynamicSizing under
  // reanimated 4 / Fabric). Mirrors the proven `KeypadHost` pattern (RN Modal + Moti slide-up). ──
  if (nativeModal) {
    return (
      <Modal transparent visible={open} animationType="none" statusBarTranslucent onRequestClose={onClose}>
        <View className="flex-1 justify-end">
          {/* Backdrop: black/60 (== the gorhom BottomSheetBackdrop opacity 0.6), tap-to-close. */}
          <MotiView
            from={{ opacity: motion.reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: motion.reduced ? 0 : 160 }}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          >
            <Pressable
              className="flex-1 bg-black/60"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            />
          </MotiView>

          {/* Panel: slide-up spring (== KeypadHost). Content-hugs with maxHeight cap = largest snap
              fraction of the screen; the scroll body shrinks (flexShrink) and scrolls past the cap. */}
          <MotiView
            from={{ translateY: motion.reduced ? 0 : maxDynamicContentSize }}
            animate={{ translateY: 0 }}
            transition={motion.reduced ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
          >
            <View
              accessibilityLabel={accessibilityLabel}
              accessibilityViewIsModal
              className={`rounded-t-sheet border-t ${forceDark ? 'border-inverse bg-ink-950' : 'border-subtle bg-surface-card'}`}
              style={[shadow('lg', resolvedScheme), { maxHeight: maxDynamicContentSize }]}
            >
              {/* Swipe-down on the handle zone dismisses (parity with enablePanDownToClose). */}
              <View {...swipeResponder.panHandlers}>{handleEl}</View>

              {header}

              {scrollable ? (
                <ScrollView
                  // flexGrow 0 → hug content when short; flexShrink 1 → shrink + scroll when the column
                  // would exceed the parent maxHeight cap (RN flex items default to flexShrink 0).
                  style={{ flexGrow: 0, flexShrink: 1 }}
                  contentContainerStyle={contentContainerStyle}
                  keyboardDismissMode="interactive"
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  stickyHeaderIndices={stickyHeaderIndices}
                >
                  {children}
                </ScrollView>
              ) : (
                <View className="px-space-6" style={{ paddingBottom: bodyPadBottom, gap: 14 }}>
                  {children}
                </View>
              )}

              {footerEl}
              {closeEl}
            </View>
          </MotiView>
        </View>
      </Modal>
    )
  }

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
      {/* Surface rendered by us so DS tokens (not @gorhom style props) own the color.
          Stays `flex-1` even under dynamicSizing: @gorhom drives the sheet height from the
          scrollable's measured content (onContentSizeChange), while flex-1 keeps the scroll body
          bounded so tall content (> cap) still scrolls instead of clipping. */}
      <View
        className={`flex-1 rounded-t-sheet border-t ${forceDark ? 'border-inverse bg-ink-950' : 'border-subtle bg-surface-card'}`}
        style={shadow('lg', resolvedScheme)}
      >
        {handleEl}

        {header}

        {scrollable ? (
          <BottomSheetScrollView
            style={{ flex: 1 }}
            contentContainerStyle={contentContainerStyle}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={stickyHeaderIndices}
          >
            {children}
          </BottomSheetScrollView>
        ) : (
          <View className="flex-1 px-space-6" style={{ paddingBottom: bodyPadBottom, gap: 14 }}>
            {children}
          </View>
        )}

        {footerEl}
        {closeEl}
      </View>
    </BottomSheetModal>
  )
}
