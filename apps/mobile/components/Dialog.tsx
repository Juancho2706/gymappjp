import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { cssInterop } from 'nativewind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { FONT, TYPE, textStyle } from '../lib/typography'
import { shadow } from '../lib/shadows'
import type { OverlayCommonProps } from './Sheet'

/**
 * EVA DS canonical centered modal (mirror of web `components/ui/dialog.tsx`).
 * Shares `OverlayCommonProps` with `Sheet` (declarative `open`/`onClose`,
 * title/description/footer/showCloseButton) so overlays have one API; the only
 * extra is `maxWidth`.
 *
 * Visual parity with web DialogContent:
 *  - centered card, radius `2xl` (22px), hairline border (border-subtle),
 *    surface bg, xl elevation, black/60 backdrop,
 *  - fade + zoom-in-95 entrance (RN `Modal` fade handles the backdrop + exit;
 *    Moti drives the card's scale/opacity in — mirrors `data-open:zoom-in-95`),
 *  - title UPPERCASE in the DS display face (Archivo), muted description,
 *    footer with its own top border + sunken bg (web `-mx-6 -mb-6` inset row).
 *
 * Colors are NativeWind DS tokens (light/dark + brand flip automatically); only
 * `resolvedScheme` is read from context for the elevation token — the frozen
 * `lib/theme` shim gets no new consumer. Safe-area insets pad the backdrop so a
 * tall dialog never collides with the notch/home indicator.
 *
 * Supersedes the ad-hoc `NativeDialog` (Montserrat title, raw hex). Migrate
 * callers over time; both can coexist.
 */

cssInterop(X, { className: { target: 'style', nativeStyleToProp: { color: true } } })

export interface DialogProps extends OverlayCommonProps {
  /** Max card width in px. Default 460 (mirrors web sm:max-w-lg on phone widths). */
  maxWidth?: number
}

const TITLE_STYLE = { ...textStyle('lg', FONT.displayBold, { lh: 'snug', ls: 'tighter' }), textTransform: 'uppercase' as const }

export function Dialog({ open, onClose, title, description, footer, showCloseButton = true, maxWidth = 460, children }: DialogProps) {
  const { resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={open} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop — black/60 to match web DialogOverlay. */}
      <View
        className="flex-1 items-center justify-center bg-black/60 px-space-6"
        style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
      >
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={[{ width: '100%', maxWidth, maxHeight: '100%' }, shadow('xl', resolvedScheme)]}
          className="rounded-[22px] border border-subtle bg-surface-card"
        >
          {title || description ? (
            <View className="px-space-7 pt-space-7 pb-space-3">
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
          ) : null}

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: title || description ? 0 : 24, paddingBottom: footer ? 12 : 24, gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? (
            <View className="rounded-b-[22px] border-t border-subtle bg-surface-sunken px-space-7 py-space-6">{footer}</View>
          ) : null}

          {showCloseButton ? (
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              className="absolute right-space-5 top-space-5 h-8 w-8 items-center justify-center rounded-pill border border-subtle bg-surface-sunken"
            >
              <X className="text-muted" size={16} strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}
        </MotiView>
      </View>
    </Modal>
  )
}
