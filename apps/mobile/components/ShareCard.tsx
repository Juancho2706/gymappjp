import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
} from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Share2,
  X,
  CalendarDays,
  Flame,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { TYPE, FONT, textStyle } from '../lib/typography'
import { SHADOWS } from '../lib/shadows'

/**
 * EVA ShareCard — single RN engine for the brandeable share-cards (story format
 * 1080×1350), the mobile mirror of the web canvas generator
 * (`apps/web/src/lib/workout-pr-card-canvas.ts` + its four modals:
 * PRShareCardModal / StreakShareCardModal / ProgressShareCardModal /
 * MonthlySummaryShareCardModal).
 *
 * WHY VIEWS + view-shot (not <canvas>): RN has no canvas. Instead we lay the
 * card out with real Views/Text (DS typography + tokens), render it inside a
 * preview modal, then rasterize that same node to a PNG with `captureRef`
 * (react-native-view-shot) and hand the file to the native share sheet
 * (expo-sharing, falling back to RN's Share API). Same UX contract as the web
 * modals: preview the exact image, then Compartir / Cerrar.
 *
 * ── ALWAYS-DARK CANVAS ──
 * The card face is intentionally dark in BOTH app themes (1:1 with web — every
 * share-card renders on ink-950 regardless of the viewer's scheme, and with the
 * always-dark `WorkoutSummaryModal`). So the card literals below are the fixed
 * DS dark neutrals (ink-950/900 + white alphas), NOT scheme-driven tokens. What
 * DOES follow the brand is the ACCENT (logo/color of the coach): it comes from
 * `useTheme().theme.primary` (already contrast-clamped + white-label aware) and
 * `useTheme().branding` (displayName / logoUrl). `resolvedScheme` still selects
 * the elevation ramp for the on-screen preview chrome.
 *
 * ── HOW TO ADD A VARIANT (workout E2, perfil E4, …) ──
 * 1. Add an entry to `SHARE_CARD_VARIANTS` with its motif `icon`, `eyebrow`
 *    default and glow `tone` ('brand' = coach accent, 'ember' = streak orange).
 * 2. In the consumer screen, render:
 *      <ShareCardPreview visible={open} onClose={close} variant="record"
 *        shareMessage="¡Nuevo récord! 💪">
 *        <ShareCardEyebrow>RÉCORD PERSONAL</ShareCardEyebrow>
 *        <ShareCardTitle>Press banca</ShareCardTitle>
 *        <ShareCardHero value="102" unit="kg" />
 *        <ShareCardPill>85 → 102 kg · +20%</ShareCardPill>
 *      </ShareCardPreview>
 *    The children ARE the central block; the engine wraps them with the shared
 *    brand header (logo + name + motif badge) and footer ("<marca> · vía EVA").
 * 3. That's it — brand/logo/accent + capture + share are handled here. Keep the
 *    central block within ~5 elements so it never collides with the footer.
 */

// ── Fixed DS dark-canvas literals (mirror web workout-pr-card-canvas.ts) ──
const INK_950 = '#0B0E13'
const INK_900 = '#12161D'
const EMBER_500 = '#FF6A3D'
const W88 = 'rgba(255,255,255,0.88)'
const W72 = 'rgba(255,255,255,0.72)'
const W62 = 'rgba(255,255,255,0.62)'
const W50 = 'rgba(255,255,255,0.50)'
const W40 = 'rgba(255,255,255,0.40)'
const W10 = 'rgba(255,255,255,0.10)'
const W08 = 'rgba(255,255,255,0.08)'
const W06 = 'rgba(255,255,255,0.06)'

/** Story canvas aspect (1080×1350 = 4:5) — matches the web PNG exactly. */
const CARD_ASPECT = 1080 / 1350
/** Reference layout width the card is designed at; spacing below is tuned to it. */
const CARD_W = 340

export type ShareCardTone = 'brand' | 'ember'

export interface ShareCardVariantSpec {
  /** Motif badge icon (top-right) — mirrors the vector icons in the web card. */
  icon: LucideIcon
  /** Default eyebrow copy (consumers can still pass their own <ShareCardEyebrow>). */
  eyebrow: string
  /** Glow + eyebrow/hero tint: 'brand' = coach accent, 'ember' = streak orange. */
  tone: ShareCardTone
}

/**
 * Motif registry. `default` is the wired base variant; the rest mirror the four
 * web cards and are ready for the E2/E4 consumer stages (icon + tone only —
 * the central block is supplied by the consumer as children).
 */
export const SHARE_CARD_VARIANTS = {
  default: { icon: TrendingUp, eyebrow: 'EVA', tone: 'brand' },
  record: { icon: Trophy, eyebrow: 'RÉCORD PERSONAL', tone: 'brand' },
  progress: { icon: TrendingUp, eyebrow: 'MI PROGRESO', tone: 'brand' },
  streak: { icon: Flame, eyebrow: 'RACHA', tone: 'ember' },
  monthly: { icon: CalendarDays, eyebrow: 'RESUMEN DEL MES', tone: 'brand' },
} satisfies Record<string, ShareCardVariantSpec>

export type ShareCardVariant = keyof typeof SHARE_CARD_VARIANTS

/** "3 de julio de 2026" — the milestone happened today (mirror web todayLong). */
function todayLong(): string {
  return new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** SPORT_500 — the EVA fallback accent (mirror web SSR fallback in workout-pr-card-canvas.ts:15). */
const SPORT_500 = '#2680FF'

/**
 * Chrome context: the ShareCardCanvas publishes the coach accent + the variant's tone color so the
 * central-block building blocks (eyebrow/hero) can DEFAULT to the brand instead of a hardcoded blue.
 * Web paints the eyebrow with `accent`/`ember` and the hero with `accent` (workout-pr-card-canvas.ts:
 * 650-653, 663-665); mobile must not fall back to #2680FF for white-label coaches. Explicit `color`
 * props on the building blocks still win.
 */
const ShareCardChromeContext = createContext<{ accent: string; toneColor: string }>({
  accent: SPORT_500,
  toneColor: SPORT_500,
})

// ─────────────────────────────────────────────────────────────────────────────
// Central-block building blocks — the shared vocabulary of the web cards
// (eyebrow / title / hero metric / pill). Consumers compose these as children.
// ─────────────────────────────────────────────────────────────────────────────

/** Tracked, tinted eyebrow (accent for 'brand' cards, ember for streak). */
export function ShareCardEyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const { toneColor } = useContext(ShareCardChromeContext)
  return (
    <Text style={[styles.eyebrow, { color: color ?? toneColor }]} numberOfLines={1}>
      {children}
    </Text>
  )
}

/** Big display title (up to 2 lines). */
export function ShareCardTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.cardTitle} numberOfLines={2}>
      {children}
    </Text>
  )
}

/** Small muted subtitle (e.g. the student's first name). */
export function ShareCardSubtitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.cardSubtitle} numberOfLines={1}>
      {children}
    </Text>
  )
}

/** Hero metric: huge number + small unit baseline (mirror the 230px web hero). */
export function ShareCardHero({ value, unit, color }: { value: string; unit?: string; color?: string }) {
  const { accent } = useContext(ShareCardChromeContext)
  return (
    <View style={styles.heroRow}>
      <Text style={[styles.heroValue, { color: color ?? accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {unit ? <Text style={styles.heroUnit}>{unit}</Text> : null}
    </View>
  )
}

/** Rounded pill (context line under the hero). `tone` tints success/neutral. */
export function ShareCardPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'accent'
}) {
  const bg = tone === 'success' ? 'rgba(52,211,153,0.14)' : tone === 'accent' ? W10 : W08
  const fg = tone === 'success' ? '#34D399' : W72
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  )
}

/** Today's date, rendered like the web footer date line. Optional convenience. */
export function ShareCardDate() {
  return <Text style={styles.dateLine}>{todayLong()}</Text>
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand chrome — logo chip shared by header + footer.
// ─────────────────────────────────────────────────────────────────────────────
function LogoChip({
  logoUrl,
  brandName,
  accent,
  size,
  radius,
  initialSize,
}: {
  logoUrl: string | null | undefined
  brandName: string
  accent: string
  size: number
  radius: number
  initialSize: number
}) {
  if (logoUrl) {
    // Coach logo on a neutral white backplate so a light logo survives the dark
    // canvas (mirror of drawLogoChip `needsBackplate` in the web generator).
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#FFFFFF', padding: size * 0.14 }}>
        <Image
          source={{ uri: logoUrl }}
          style={{ flex: 1, borderRadius: Math.max(4, radius - size * 0.14) }}
          contentFit="contain"
        />
      </View>
    )
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.displayBold, fontSize: initialSize, color: '#FFFFFF' }}>
        {brandName.charAt(0).toUpperCase()}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ShareCardCanvas — the branded card face (header + children + footer). This is
// the node captured by view-shot. Exported for advanced consumers that want the
// bare card (e.g. an inline preview), but most screens use ShareCardPreview.
// ─────────────────────────────────────────────────────────────────────────────
interface CanvasProps {
  variant: ShareCardVariant
  brandName: string
  logoUrl: string | null | undefined
  accent: string
  width: number
  children: ReactNode
}

export const ShareCardCanvas = function ShareCardCanvas({
  variant,
  brandName,
  logoUrl,
  accent,
  width,
  children,
}: CanvasProps) {
  const spec = SHARE_CARD_VARIANTS[variant]
  const MotifIcon = spec.icon
  const toneColor = spec.tone === 'ember' ? EMBER_500 : accent
  const pad = Math.round(width * 0.074) // ≈ web PAD_X (80/1080)

  return (
    <ShareCardChromeContext.Provider value={{ accent, toneColor }}>
    <View style={{ width, aspectRatio: CARD_ASPECT, borderRadius: 20, overflow: 'hidden', backgroundColor: INK_950 }}>
      {/* Ink base gradient (mirror drawCardBase). */}
      <LinearGradient
        colors={[INK_950, INK_900]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleFill}
      />
      {/* Accent glow at the top (approximates the web radial glow; expo-image/
          RN can't do a true radial, so a top-weighted linear tint reads as the
          same "energy" behind the header). */}
      <LinearGradient
        colors={[withAlpha(toneColor, 0.32), withAlpha(toneColor, 0)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleFill}
      />

      <View style={{ flex: 1, paddingHorizontal: pad, paddingTop: pad * 0.9, paddingBottom: pad * 0.8 }}>
        {/* ── Brand header ── */}
        <View style={styles.header}>
          <LogoChip logoUrl={logoUrl} brandName={brandName} accent={accent} size={54} radius={15} initialSize={26} />
          <Text style={styles.headerName} numberOfLines={1}>
            {brandName.toUpperCase()}
          </Text>
          <View style={{ flex: 1 }} />
          <MotifIcon size={40} color={toneColor} strokeWidth={2.4} />
        </View>

        {/* ── Central block (consumer children) ── */}
        <View style={styles.body}>{children}</View>

        {/* ── Brand footer: <marca> · vía EVA ── */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <View style={styles.footerRow}>
            <LogoChip logoUrl={logoUrl} brandName={brandName} accent={accent} size={36} radius={11} initialSize={18} />
            <Text style={styles.footerName} numberOfLines={1}>
              {brandName.toUpperCase()}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.footerVia}>vía EVA</Text>
          </View>
        </View>
      </View>
    </View>
    </ShareCardChromeContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ShareCardPreview — full-screen modal: preview the card, then share/close.
// ─────────────────────────────────────────────────────────────────────────────
export interface ShareCardPreviewProps {
  visible: boolean
  onClose: () => void
  /** Motif; defaults to 'default'. */
  variant?: ShareCardVariant
  /** Text attached to the native share sheet. */
  shareMessage?: string
  /** Base file name for the PNG (no extension). */
  fileName?: string
  /**
   * Override the share behavior. Receives the captured PNG file URI; if
   * provided, the engine does NOT open its own share sheet (the consumer owns
   * it). Omit for the default expo-sharing → RN Share fallback flow.
   */
  onShare?: (uri: string) => void | Promise<void>
  /** Fired after a successful default share. */
  onShared?: () => void
  /** The central block (see ShareCard* building blocks). */
  children: ReactNode
}

export function ShareCardPreview({
  visible,
  onClose,
  variant = 'default',
  shareMessage,
  fileName = 'eva-card',
  onShare,
  onShared,
  children,
}: ShareCardPreviewProps) {
  const { theme, branding, resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { width: winW } = useWindowDimensions()
  const cardRef = useRef<View>(null)
  const [busy, setBusy] = useState(false)

  const brandName = branding?.displayName?.trim() || 'EVA'
  const logoUrl = branding?.logoUrl ?? null
  const accent = theme.primary
  // Fit the reference-width card into the screen with comfortable gutters.
  const cardWidth = Math.min(CARD_W, winW - 48)

  async function handleShare() {
    if (busy) return
    setBusy(true)
    try {
      // Rasterize the exact previewed node. Output resolution ≈ cardWidth ×
      // devicePixelRatio (e.g. 340dp × 3 ≈ 1020px wide) — plenty for social.
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' })
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

      if (onShare) {
        await onShare(uri)
        return
      }

      // Default: native share sheet with the PNG. expo-sharing is the primary
      // path (present in deps); RN Share is the fallback.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: shareMessage || 'Compartir',
          UTI: 'public.png',
        })
      } else {
        await Share.share({ url: uri, message: shareMessage ?? '' })
      }
      onShared?.()
    } catch {
      // user cancelled or capture failed — silent (matches web modal UX)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
      >
        {/* stopPropagation: taps inside the card column must not dismiss */}
        <Pressable onPress={() => {}} style={{ width: cardWidth, gap: 16 }}>
          {/* Captured node. `collapsable={false}` is required on Android so the
              view is a real backing surface view-shot can snapshot. */}
          <View ref={cardRef} collapsable={false} style={SHADOWS[resolvedScheme].xl}>
            <ShareCardCanvas
              variant={variant}
              brandName={brandName}
              logoUrl={logoUrl}
              accent={accent}
              width={cardWidth}
            >
              {children}
            </ShareCardCanvas>
          </View>

          {/* Actions */}
          <Pressable
            onPress={handleShare}
            disabled={busy}
            style={[styles.shareBtn, { backgroundColor: accent, opacity: busy ? 0.6 : 1 }]}
          >
            {/* El spinner reemplaza SÓLO el ícono; el label "Compartir" permanece (paridad con el
                modal web PRShareCardModal donde Loader2 sustituye el ícono, no el texto). */}
            {busy ? (
              <ActivityIndicator color={theme.primaryForeground} />
            ) : (
              <Share2 size={18} color={theme.primaryForeground} />
            )}
            <Text style={[styles.shareBtnLabel, { color: theme.primaryForeground }]}>Compartir</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <X size={16} color={W72} />
            <Text style={styles.closeBtnLabel}>Cerrar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// Absolute-fill for the gradient layers (kept as a shared object).
const StyleFill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 }

/** "#rrggbb" + alpha → "rgba(r,g,b,a)" (accent glow tint). */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = {
  // ── modal chrome ──
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
  },
  shareBtn: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  shareBtnLabel: { ...textStyle('md', FONT.uiBold) } as TextStyle,
  closeBtn: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  },
  closeBtnLabel: { ...textStyle('sm', FONT.uiSemibold), color: W72 } as TextStyle,

  // ── card header ──
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  headerName: { ...TYPE.eyebrow, color: W88, letterSpacing: 1 } as TextStyle,

  // ── card body ──
  body: { flex: 1, justifyContent: 'center' as const, gap: 10 },
  // color se inyecta en runtime (ShareCardEyebrow → toneColor del canvas / prop explícita); sin literal.
  eyebrow: { ...textStyle('sm', FONT.displayBold, { ls: 'eyebrow' }), textTransform: 'uppercase' as const } as TextStyle,
  cardTitle: { ...TYPE.h2, color: '#FFFFFF' } as TextStyle,
  cardSubtitle: { ...TYPE.body, color: W50 } as TextStyle,
  heroRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 8 },
  heroValue: { fontFamily: FONT.displayBlack, fontSize: 88, lineHeight: 92, letterSpacing: -3, color: '#FFFFFF' } as TextStyle,
  heroUnit: { ...textStyle('2xl', FONT.displayBold), color: W50, marginBottom: 14 } as TextStyle,
  pill: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9999,
  },
  pillText: { ...textStyle('sm', FONT.uiSemibold) } as TextStyle,
  dateLine: { ...textStyle('sm', FONT.uiMedium), color: W62 } as TextStyle,

  // ── card footer ──
  footer: { gap: 14 },
  footerDivider: { height: 1, backgroundColor: W10 },
  footerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  footerName: { ...textStyle('sm', FONT.displayBold), color: W72, letterSpacing: 1 } as TextStyle,
  footerVia: { ...textStyle('xs', FONT.uiSemibold), color: W40 } as TextStyle,
}
