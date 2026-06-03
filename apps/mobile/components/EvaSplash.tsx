import { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'

const { width } = Dimensions.get('window')
const DARK_BG = '#07080C'
const LETTERS = [
  { c: 'E', color: '#8B5CF6' },
  { c: 'V', color: '#06B6D4' },
  { c: 'A', color: '#10B981' },
]

interface Props {
  onFinish: () => void
}

/**
 * Brand splash — clean, motion-forward (2026 best-practice: minimal, branded).
 * The EVA wordmark reveals letter-by-letter in the brand gradient colors (same
 * motif as the in-app loader), over a soft radial glow. No clutter.
 */
export function EvaSplash({ onFinish }: Props) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 1500)
    const t2 = setTimeout(() => onFinish(), 1900)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <MotiView
      from={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ type: 'timing', duration: 400 }}
      style={styles.root}
    >
      {/* Soft brand glow that breathes in behind the wordmark */}
      <MotiView
        from={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'timing', duration: 900 }}
        style={styles.glowWrap}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['rgba(6,182,212,0.18)', 'rgba(139,92,246,0.10)', 'transparent']}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.glow}
        />
      </MotiView>

      {/* EVA wordmark — letters spring in, staggered */}
      <View style={styles.row}>
        {LETTERS.map((l, i) => (
          <MotiView
            key={l.c}
            from={{ opacity: 0, translateY: 26, scale: 0.6 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 140, delay: 120 + i * 130 }}
          >
            <Text style={[styles.letter, { color: l.color }]}>{l.c}</Text>
          </MotiView>
        ))}
      </View>

      {/* Underline draws in */}
      <MotiView
        from={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ type: 'timing', duration: 520, delay: 560 }}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.5)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.underline}
        />
      </MotiView>

      {/* Tagline */}
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 460, delay: 720 }}
      >
        <Text style={styles.tagline}>ENTRENAMIENTO PERSONALIZADO</Text>
      </MotiView>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: DARK_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowWrap: { position: 'absolute', width: width * 1.2, height: width * 1.2, alignItems: 'center', justifyContent: 'center' },
  glow: { width: '100%', height: '100%', borderRadius: width },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  letter: { fontSize: 92, lineHeight: 96, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -3 },
  underline: { width: width * 0.34, height: 2, borderRadius: 2, marginTop: 18, marginBottom: 18 },
  tagline: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.5)', letterSpacing: 2.5, textAlign: 'center' },
})
