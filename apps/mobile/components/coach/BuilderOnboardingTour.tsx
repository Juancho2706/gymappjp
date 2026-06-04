import { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../context/ThemeContext'

export type TourStep = { id: string; title: string; description: string; placement?: 'top' | 'bottom'; footerHint?: string }
type Rect = { x: number; y: number; width: number; height: number }

interface Props {
  open: boolean
  steps: TourStep[]
  /** Mide el ancla por id (measureInWindow). null si no está montada. */
  getRect: (id: string) => Promise<Rect | null>
  onClose: (completed: boolean) => void
  /** Cambia para forzar remedición (p. ej. al cambiar de día / abrir config). */
  remeasureSignal?: unknown
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const PAD = 8
const CARD_W = Math.min(360, SCREEN_W - 24)

/** Tour de onboarding 1:1 web (BuilderOnboardingTour): backdrop con cutout + card de pasos. */
export function BuilderOnboardingTour({ open, steps, getRect, onClose, remeasureSignal }: Props) {
  const { theme } = useTheme()
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const total = steps.length
  const step = steps[idx]

  useEffect(() => { if (open) setIdx(0) }, [open])

  useEffect(() => {
    if (!open || !step) return
    let alive = true
    let tries = 0
    setRect(null)
    const tick = () => {
      getRect(step.id).then((r) => {
        if (!alive) return
        if (r && r.width > 0) setRect(r)
        else if (tries++ < 6) setTimeout(tick, 70)
      }).catch(() => {})
    }
    tick()
    return () => { alive = false }
  }, [open, step, getRect, remeasureSignal])

  if (!open || !step || total === 0) return null

  const r = rect ?? { x: 16, y: Math.floor(SCREEN_H * 0.3), width: SCREEN_W - 32, height: 56 }
  const hx = Math.max(8, r.x - PAD)
  const hy = Math.max(8, r.y - PAD)
  const hw = Math.min(SCREEN_W - 16, r.width + PAD * 2)
  const hh = r.height + PAD * 2
  const isLast = idx >= total - 1
  const preferTop = step.placement === 'top'
  const cardTop = preferTop ? Math.max(44, hy - 196) : Math.min(SCREEN_H - 240, hy + hh + 10)
  const cardLeft = Math.max(12, Math.min(r.x, SCREEN_W - CARD_W - 12))

  return (
    <View style={styles.overlay}>
      <View style={StyleSheet.absoluteFill}>
        {/* Cutout: 4 paneles oscuros alrededor del ancla */}
        <View style={[styles.panel, { top: 0, left: 0, right: 0, height: hy }]} />
        <View style={[styles.panel, { top: hy, left: 0, width: hx, height: hh }]} />
        <View style={[styles.panel, { top: hy, left: hx + hw, right: 0, height: hh }]} />
        <View style={[styles.panel, { top: hy + hh, left: 0, right: 0, bottom: 0 }]} />
        <View pointerEvents="none" style={[styles.ring, { top: hy, left: hx, width: hw, height: hh, borderColor: theme.primary }]} />

        <View style={[styles.card, { top: cardTop, left: cardLeft, width: CARD_W, backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.counter, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>Guía del builder · {idx + 1}/{total}</Text>
          <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{step.title}</Text>
          <Text style={[styles.desc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{step.description}</Text>
          {step.footerHint ? <Text style={[styles.hint, { color: theme.mutedForeground, borderTopColor: theme.border, fontFamily: theme.fontSans }]}>{step.footerHint}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => onClose(false)} hitSlop={6}><Text style={[styles.skip, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Saltar</Text></TouchableOpacity>
            <View style={styles.navBtns}>
              {idx > 0 ? (
                <TouchableOpacity onPress={() => setIdx((i) => Math.max(0, i - 1))} activeOpacity={0.85} style={[styles.btnOutline, { borderColor: theme.border }]}>
                  <Text style={[styles.btnOutlineTxt, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>Atrás</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => { if (isLast) onClose(true); else setIdx((i) => i + 1) }} activeOpacity={0.85} style={[styles.btnPrimary, { backgroundColor: theme.primary }]}>
                <Text style={[styles.btnPrimaryTxt, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>{isLast ? 'Finalizar' : 'Siguiente'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, elevation: 30 },
  panel: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.72)' },
  ring: { position: 'absolute', borderWidth: 2, borderRadius: 12 },
  card: { position: 'absolute', borderWidth: 1, borderRadius: 14, padding: 14, gap: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  counter: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 15 },
  desc: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 11, lineHeight: 16, borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  skip: { fontSize: 13 },
  navBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnOutline: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
  btnOutlineTxt: { fontSize: 13 },
  btnPrimary: { borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9 },
  btnPrimaryTxt: { fontSize: 13 },
})
