import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { SHADOWS } from '../lib/shadows'
import { TYPE } from '../lib/typography'

/**
 * EVA Toast — transient feedback provider (RN parity with the web Sonner
 * `ui/sonner.tsx` + the `toast` singleton from `sonner`).
 *
 * Web contract mirrored here (verified against apps/web usage):
 *  - Global singleton API: `import { toast } from '@/components/Toast'` then
 *    `toast.success(msg)`, `.error`, `.info`, `.warning`, `.loading`, plus
 *    `.dismiss(id?)` and `.promise()`. No hook needed at the call site — same
 *    ergonomics as `import { toast } from 'sonner'`. `useToast()` returns the
 *    same object for convenience.
 *  - Per-toast options `{ id?, duration? }` (web passes `{ id, duration }` to
 *    dedupe/pin e.g. CheckInForm `id: 'client-checkin-warn', duration: 8000`).
 *    Reusing an `id` UPDATES the live toast instead of stacking a duplicate.
 *  - Icons match web: CircleCheck / OctagonX (error) / Info / TriangleAlert
 *    (warning) / LoaderCircle (spinning). Positioned at the BOTTOM above the
 *    tab bar, clearing the safe-area inset — same anchor as web's
 *    `mb-[calc(env(safe-area-inset-bottom)+5rem)]`.
 *
 * Theming: surface/border/text come from DS NativeWind classes (dark-aware +
 * white-label-aware at runtime). Only the lucide icon `color` and the RN
 * `shadowColor` come from the imperative `theme` shim / SHADOWS — exactly the
 * theming frontier documented in `lib/theme.ts`. Animation uses reanimated
 * (already in deps); swipe-down dismisses (parity with Sonner's swipe).
 *
 * Mount `<Toaster />` ONCE in `app/_layout.tsx` inside ThemeProvider.
 */

type ToastVariant = 'success' | 'error' | 'info' | 'warning' | 'loading'

export interface ToastOptions {
  /** Reuse to update/dedupe an existing toast instead of stacking a new one. */
  id?: string
  /** ms before auto-dismiss. `loading` never auto-dismisses. Default 4000 (error 5000). */
  duration?: number
  /** Optional secondary line under the title. */
  description?: string
}

interface ToastData {
  id: string
  variant: ToastVariant
  message: string
  description?: string
  /** ms; Infinity = sticky (loading / promise pending). */
  duration: number
}

// Max toasts kept on screen at once (older ones drop off the top of the stack).
const MAX_VISIBLE = 3
const DEFAULT_DURATION = 4000
const ERROR_DURATION = 5000
// Clearance above the bottom tab bar chrome (DS bottom nav ≈ 64px). Mirrors the
// intent of web's `+5rem` offset so the toast never hides behind the tab bar.
const TAB_BAR_CLEARANCE = 68

// ---- singleton store (import-based API, no provider prop drilling) ----

type Listener = (toasts: ToastData[]) => void

let counter = 0
const nextId = () => `t${++counter}`

class ToastStore {
  private toasts: ToastData[] = []
  private listeners = new Set<Listener>()
  // Override de superficie OSCURA (informe 15, MAYOR): mientras el ejecutor V3 (dark-only) está montado,
  // los toasts deben salir oscuros aunque el dispositivo esté en tema claro. El ejecutor lo enciende al
  // montar y lo apaga al desmontar (contador para tolerar montajes solapados).
  private darkRefs = 0
  private darkListeners = new Set<(dark: boolean) => void>()

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.toasts)
    return () => this.listeners.delete(fn)
  }

  subscribeDark(fn: (dark: boolean) => void): () => void {
    this.darkListeners.add(fn)
    fn(this.darkRefs > 0)
    return () => this.darkListeners.delete(fn)
  }

  setDark(on: boolean) {
    this.darkRefs = Math.max(0, this.darkRefs + (on ? 1 : -1))
    const dark = this.darkRefs > 0
    this.darkListeners.forEach((l) => l(dark))
  }

  private emit() {
    const snapshot = this.toasts
    this.listeners.forEach((l) => l(snapshot))
  }

  /** Add a new toast, or update an existing one when `id` is reused. Returns the id. */
  push(variant: ToastVariant, message: string, opts?: ToastOptions): string {
    const id = opts?.id ?? nextId()
    const duration =
      opts?.duration ??
      (variant === 'loading' ? Infinity : variant === 'error' ? ERROR_DURATION : DEFAULT_DURATION)
    const data: ToastData = { id, variant, message, description: opts?.description, duration }
    const existing = this.toasts.findIndex((t) => t.id === id)
    if (existing >= 0) {
      // Update-in-place: keep queue position, refresh content (promise resolve, dedupe).
      this.toasts = this.toasts.map((t, i) => (i === existing ? data : t))
    } else {
      this.toasts = [...this.toasts, data].slice(-MAX_VISIBLE)
    }
    this.emit()
    return id
  }

  dismiss(id?: string) {
    this.toasts = id ? this.toasts.filter((t) => t.id !== id) : []
    this.emit()
  }
}

const store = new ToastStore()

interface ToastApi {
  success: (message: string, opts?: ToastOptions) => string
  error: (message: string, opts?: ToastOptions) => string
  info: (message: string, opts?: ToastOptions) => string
  warning: (message: string, opts?: ToastOptions) => string
  loading: (message: string, opts?: ToastOptions) => string
  dismiss: (id?: string) => void
  /** Sonner-style promise sugar: shows loading, then success/error on settle. */
  promise: <T>(
    promise: Promise<T>,
    msgs: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) },
  ) => Promise<T>
}

export const toast: ToastApi = {
  success: (m, o) => store.push('success', m, o),
  error: (m, o) => store.push('error', m, o),
  info: (m, o) => store.push('info', m, o),
  warning: (m, o) => store.push('warning', m, o),
  loading: (m, o) => store.push('loading', m, o),
  dismiss: (id) => store.dismiss(id),
  promise: (promise, msgs) => {
    const id = store.push('loading', msgs.loading)
    promise.then(
      (v) => store.push('success', typeof msgs.success === 'function' ? msgs.success(v) : msgs.success, { id }),
      (e) => store.push('error', typeof msgs.error === 'function' ? msgs.error(e) : msgs.error, { id }),
    )
    return promise
  },
}

/** Convenience hook — returns the same singleton API. */
export function useToast(): ToastApi {
  return toast
}

/**
 * Fuerza (ON) la superficie OSCURA de los toasts mientras una superficie dark-only está montada
 * (ejecutor V3, informe 15). Contador interno → montajes solapados no se pisan. Llamar `setToastDark(true)`
 * al montar y `setToastDark(false)` al desmontar (idealmente en el cleanup de un `useEffect`).
 */
export function setToastDark(on: boolean): void {
  store.setDark(on)
}

// ---- rendering ----

function useVariantIcon() {
  const { theme, resolvedScheme } = useTheme()
  // Icon color = the only thing that legitimately comes from the imperative
  // shim (lucide needs a literal `color`). Warning has no theme field → DS
  // warning-500/600 literals (mirrors global.css light/dark).
  const warning = resolvedScheme === 'dark' ? '#FFC861' : '#F5A524'
  return {
    success: { Icon: CircleCheck, color: theme.success },
    error: { Icon: OctagonX, color: theme.destructive },
    info: { Icon: Info, color: theme.cyan },
    warning: { Icon: TriangleAlert, color: warning },
    loading: { Icon: LoaderCircle, color: theme.mutedForeground },
  } as const
}

function SpinningLoader({ color }: { color: string }) {
  const rot = useSharedValue(0)
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false)
    return () => cancelAnimation(rot)
  }, [])
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))
  return (
    <Animated.View style={style}>
      <LoaderCircle size={20} color={color} />
    </Animated.View>
  )
}

// Superficie OSCURA del toast en V3 (informe 15): #1d1d26 + borde #33333f + texto on-dark, coherente
// con las sheets del ejecutor. Los iconos conservan su hue semántico (variante).
const DARK_TOAST = { bg: '#1d1d26', border: '#33333f', text: '#f4f4f6', textMuted: '#b0b0bd' }

function ToastRow({ data, onDismiss, dark }: { data: ToastData; onDismiss: (id: string) => void; dark: boolean }) {
  const { theme, resolvedScheme } = useTheme()
  const variants = useVariantIcon()
  const { Icon, color } = variants[data.variant]

  // Enter: rise from below + fade in. Exit handled by animating out then removing.
  const translateY = useSharedValue(24)
  const opacity = useSharedValue(0)

  const remove = () => onDismiss(data.id)

  const animateOut = () => {
    'worklet'
    opacity.value = withTiming(0, { duration: 160 })
    translateY.value = withTiming(40, { duration: 160 }, (done) => {
      if (done) runOnJS(remove)()
    })
  }

  useEffect(() => {
    // enter (DS fast-ish spring feel via timing)
    opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })
    translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) })
    if (data.duration !== Infinity) {
      const t = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 160 })
        translateY.value = withTiming(40, { duration: 160 }, (done) => {
          if (done) runOnJS(remove)()
        })
      }, data.duration)
      return () => clearTimeout(t)
    }
    // sticky (loading): re-run enter if content updates, no timer
    return undefined
  }, [data.id, data.duration, data.variant, data.message])

  // Swipe-down to dismiss (parity with Sonner's swipe gesture).
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
        opacity.value = Math.max(0.3, 1 - e.translationY / 120)
      }
    })
    .onEnd((e) => {
      if (e.translationY > 48 || e.velocityY > 600) {
        animateOut()
      } else {
        translateY.value = withTiming(0, { duration: 160 })
        opacity.value = withTiming(1, { duration: 160 })
      }
    })

  const rowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.rowShadow, SHADOWS[resolvedScheme].lg, rowStyle, dark ? { backgroundColor: DARK_TOAST.bg, borderColor: DARK_TOAST.border } : null]}
        // bg + border + radius from DS tokens (dark-aware). surface-card ≈ web --popover. En V3 el
        // override oscuro (style) pisa las clases claras.
        className="flex-row items-center gap-3 rounded-2xl border border-subtle bg-surface-card px-4 py-3"
        accessibilityRole="alert"
      >
        {data.variant === 'loading' ? (
          <SpinningLoader color={color} />
        ) : (
          <Icon size={20} color={color} />
        )}
        <View style={styles.textCol}>
          <Text style={[TYPE.label, { color: dark ? DARK_TOAST.text : theme.text }]} numberOfLines={2}>
            {data.message}
          </Text>
          {data.description ? (
            <Text style={[TYPE.caption, { color: dark ? DARK_TOAST.textMuted : theme.mutedForeground, marginTop: 2 }]} numberOfLines={3}>
              {data.description}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  )
}

/** Mount ONCE at the app root (inside ThemeProvider). Overlays all content. */
export function Toaster() {
  const insets = useSafeAreaInsets()
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [dark, setDark] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const unsub = store.subscribe((next) => {
      if (mounted.current) setToasts(next)
    })
    const unsubDark = store.subscribeDark((d) => {
      if (mounted.current) setDark(d)
    })
    return () => {
      mounted.current = false
      unsub()
      unsubDark()
    }
  }, [])

  const handleDismiss = (id: string) => store.dismiss(id)

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.viewport,
        { paddingBottom: Math.max(insets.bottom, 8) + TAB_BAR_CLEARANCE, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      {toasts.map((t) => (
        <View key={t.id} style={styles.rowWrap} pointerEvents="box-none">
          <ToastRow data={t} onDismiss={handleDismiss} dark={dark} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'stretch',
    paddingHorizontal: 16,
    gap: 8,
  },
  rowWrap: { width: '100%' },
  rowShadow: {},
  textCol: { flex: 1 },
})
