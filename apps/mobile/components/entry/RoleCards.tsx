import { useId, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { ChevronRight, UserRound, UsersRound } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { SPRING } from '../../lib/motion'
import { ENTRY_TOKENS } from '../../lib/theme'
import { FONT } from '../../lib/typography'

/**
 * RoleCards — las dos cards de rol del frame 02.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.2.5 (anatomia) + §4 V2/V3.
 *
 * Jerarquia sin romper el "un solo saturado": la card de alumno es glass TEÑIDO de marca
 * y **solo su boton circular** es `cta-fill`; la de coach es glass neutro con chevron
 * outline. Se conserva Hick's Law y la asimetria de la direccion, sin un bloque azul
 * opaco de 86 pt.
 *
 * Traducciones CSS→RN aplicadas (§0):
 *  - `inset 0 1px 0` → `<View>` absoluta de 1 pt dentro de un padre con `overflow:'hidden'`.
 *  - `box-shadow` con spread negativo → under-glow DIBUJADO (§1.6), solo en la primaria;
 *    en la secundaria se OMITE (sobre `#07080C` una sombra negra es invisible).
 *  - Highlight superior de 1 pt = gradiente horizontal que se apaga en los extremos.
 *    Nunca una linea plana de borde a borde: es lo que separa "card" de "rectangulo".
 *  - `className` + `style` funcion esta PROHIBIDO (a1 §2.1): aca no se usa `className`,
 *    y el pressed llega por estado local, no por children-as-function con className.
 *
 * Radio del icon-tile: **14** (`rounded-control`), no el 13 del mockup — §5.1 normaliza
 * los 4 radios intermedios que el propio mockup se inventa.
 */

/** Radio de card (§3 paleta comun) y alto minimo del frame 02. */
export const ROLE_CARD_RADIUS = 20
export const ROLE_CARD_MIN_HEIGHT = 86
/** Gap real entre las dos cards (§3.2 tabla de layout). */
export const ROLE_CARD_GAP = 11

export type RoleKind = 'alumno' | 'coach'

/**
 * Color plano equivalente y borde de cada card (§4.2). Al arrancar el morph la pila de
 * `LinearGradient` se cambia por este solido: es indistinguible bajo el dim y permite
 * interpolar el fondo con `interpolateColor` (RN no interpola gradientes).
 */
export const ROLE_CARD_FLAT: Record<RoleKind, { background: string; border: string }> = {
  alumno: { background: '#12203A', border: 'rgba(127,176,255,0.30)' },
  coach: { background: '#151A21', border: 'rgba(255,255,255,0.13)' },
}

/** Superficie del sheet al terminar el morph (§4.2). No vuelve a gradiente. */
export const ROLE_SHEET_BACKGROUND = '#0F131A'

const COPY: Record<RoleKind, { title: string; caption: string }> = {
  alumno: { title: 'Soy alumno', caption: 'Tengo el código de mi coach' },
  coach: { title: 'Soy coach', caption: 'Gestiono a mis alumnos' },
}

export interface RoleCardProps {
  role: RoleKind
  onPress: () => void
  /** Se emite con el ancho/alto reales de la card: el morph parte de su rect medido. */
  onLayout?: (event: LayoutChangeEvent) => void
  testID?: string
  accessibilityLabel: string
  accessibilityHint: string
}

export function RoleCard({
  role,
  onPress,
  onLayout,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: RoleCardProps) {
  const reduced = useReducedMotion()
  const [pressed, setPressed] = useState(false)
  const isPrimary = role === 'alumno'

  return (
    // El wrapper NO recorta: el under-glow vive fuera de la card (§1.6).
    <View onLayout={onLayout}>
      {isPrimary ? <RoleUnderGlow /> : null}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          // §4 V3: haptica UNA sola vez, en el COMMIT del rol (nunca durante el gesto) y
          // jamas `notificationAsync(Success)` — todavia no hay exito que confirmar.
          void Haptics.selectionAsync().catch(() => {})
          onPress()
        }}
      >
        {/* §4 V2 — pressed: scale 1→.98 + velo al 7%. En reduce-motion sube solo el velo. */}
        <MotiView
          animate={{ scale: pressed && !reduced ? 0.98 : 1 }}
          transition={{ type: 'spring', ...SPRING.ui }}
          style={[
            styles.card,
            { borderColor: ROLE_CARD_FLAT[role].border },
          ]}
        >
          {/* Fondo: velo glass + (solo primaria) la capa de marca ENCIMA del velo. */}
          <LinearGradient
            colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.015)'] as const}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {isPrimary ? (
            <LinearGradient
              colors={['rgba(26,107,230,0.30)', 'rgba(26,107,230,0.10)'] as const}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {/* Hairline interno (`inset 0 1px 0`) — .10 primaria / .075 secundaria. */}
          <View
            pointerEvents="none"
            style={[
              styles.cardInset,
              { backgroundColor: isPrimary ? 'rgba(255,255,255,0.10)' : ENTRY_TOKENS.glassInset },
            ]}
          />
          {/* Highlight superior de 1 pt, desvanecido en los extremos. */}
          <View pointerEvents="none" style={styles.cardHighlight}>
            <LinearGradient
              colors={['transparent', ENTRY_TOKENS.glassHighlight, 'transparent'] as const}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
          <MotiView
            pointerEvents="none"
            animate={{ opacity: pressed ? 1 : 0 }}
            transition={{ type: 'timing', duration: 140 }}
            style={styles.cardVeil}
          />
          <RoleCardContent role={role} />
        </MotiView>
      </Pressable>
    </View>
  )
}

/**
 * Contenido de la card (fila icon-tile + textos + chevron). Se exporta porque el morph
 * lo vuelve a montar dentro del sheet (`sheetsm`, §3.3): el icon-tile y el titulo NO se
 * mueven mientras se desvanecen — el movimiento lo hace el contenedor.
 */
export function RoleCardContent({ role }: { role: RoleKind }) {
  const isPrimary = role === 'alumno'
  return (
    <View style={styles.row}>
      <View style={[styles.icon, isPrimary ? styles.iconBrand : styles.iconNeutral]}>
        <View pointerEvents="none" style={styles.iconInset} />
        {isPrimary ? (
          <UserRound size={22} color="#9CC4FF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <UsersRound size={22} color="#CDD3DB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{COPY[role].title}</Text>
        <Text style={[styles.caption, { color: isPrimary ? ENTRY_TOKENS.textOnGlassBrand : '#86919E' }]}>
          {COPY[role].caption}
        </Text>
      </View>
      <View style={[styles.go, isPrimary ? styles.goFill : styles.goOut]}>
        {isPrimary ? <View pointerEvents="none" style={styles.goInset} /> : null}
        <ChevronRight
          size={16}
          color={isPrimary ? '#FFFFFF' : '#98A2B0'}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </View>
    </View>
  )
}

/**
 * Under-glow de la card primaria (§1.6): elipse dibujada detras, ancho 110% de la card,
 * alto 44, anclada 18 pt bajo su borde superior. Sustituye al `box-shadow` con spread
 * negativo, que en iOS sangra sin control y en Android no tiñe.
 */
function RoleUnderGlow() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <View pointerEvents="none" style={styles.underGlow}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`role-glow-${uid}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={ENTRY_TOKENS.lux} stopOpacity={0.28} />
            <Stop offset="0.7" stopColor={ENTRY_TOKENS.lux} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#role-glow-${uid})`} />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    minHeight: ROLE_CARD_MIN_HEIGHT,
    borderRadius: ROLE_CARD_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  cardInset: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 1 },
  cardHighlight: { position: 'absolute', top: 0, left: 14, right: 14, height: 1, zIndex: 2 },
  cardVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: ENTRY_TOKENS.surfaceVeil2, zIndex: 1 },
  underGlow: { position: 'absolute', top: 18, left: '-5%', right: '-5%', height: 44 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBrand: { backgroundColor: 'rgba(26,107,230,0.22)', borderColor: 'rgba(127,176,255,0.30)' },
  iconNeutral: { backgroundColor: ENTRY_TOKENS.glassTop, borderColor: 'rgba(255,255,255,0.11)' },
  iconInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    zIndex: 2,
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: FONT.displayBlack,
    fontSize: 17.5,
    lineHeight: 21,
    letterSpacing: -0.385,
    color: '#F4F6F8',
    marginBottom: 3,
  },
  caption: { fontFamily: FONT.uiSemibold, fontSize: 12, lineHeight: 16 },
  go: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goFill: { backgroundColor: ENTRY_TOKENS.lux },
  goOut: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  goInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
})
