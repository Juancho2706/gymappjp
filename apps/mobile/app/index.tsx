import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Activity, Dumbbell, ExternalLink, Sparkles } from 'lucide-react-native'
import { MotiView } from 'moti'
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'

export default function RoleSelector() {
  const router = useRouter()
  const { theme } = useTheme()

  return (
    <LinearGradient
      colors={[theme.background, theme.primary + '0A', theme.background]}
      style={styles.gradient}
    >
      <GridOverlay color={theme.foreground} />
      <SafeAreaView style={styles.container}>
        <MotiView
          from={{ opacity: 0, scale: 0.92, translateY: 16 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 14 }}
          style={styles.header}
        >
          <View
            style={[
              styles.brandPill,
              {
                backgroundColor: theme.primary + '12',
                borderColor: theme.primary + '30',
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Sparkles size={14} color={theme.primary} />
            <Text style={[styles.brandPillText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
              Bienvenido
            </Text>
          </View>
          <Text style={[styles.brand, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            EVA
          </Text>
          <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Entrenamiento personalizado
          </Text>
        </MotiView>

        <View style={styles.buttons}>
          <RoleButton
            delay={300}
            icon={Dumbbell}
            title="SOY COACH"
            description="Gestiona alumnos y programas"
            primary
            onPress={() => router.push('/(auth)/login?role=coach')}
          />
          <RoleButton
            delay={450}
            icon={Activity}
            title="SOY ALUMNO"
            description="Accede a tu entrenamiento"
            onPress={() => router.push('/alumno/codigo')}
          />
        </View>

        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 400, delay: 650 }}
          style={styles.footerRow}
        >
          <Text style={[styles.footer, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            eva-app.cl
          </Text>
          <ExternalLink size={12} color={theme.mutedForeground} />
        </MotiView>
      </SafeAreaView>
    </LinearGradient>
  )
}

function RoleButton({
  icon: Icon,
  title,
  description,
  primary,
  delay,
  onPress,
}: {
  icon: typeof Dumbbell
  title: string
  description: string
  primary?: boolean
  delay: number
  onPress: () => void
}) {
  const { theme } = useTheme()
  const fg = primary ? theme.primaryForeground : theme.foreground
  const sub = primary ? 'rgba(255,255,255,0.78)' : theme.mutedForeground

  return (
    <MotiView
      from={{ opacity: 0, translateY: 22 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500, delay }}
    >
      <TouchableOpacity
        style={[
          styles.btn,
          primary
            ? { backgroundColor: theme.primary, borderRadius: theme.radius['2xl'] }
            : {
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: theme.radius['2xl'],
              },
          primary ? theme.shadowGlowBlue : null,
        ]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: primary ? 'rgba(255,255,255,0.16)' : theme.primary + '12',
              borderColor: primary ? 'rgba(255,255,255,0.22)' : theme.primary + '30',
              borderRadius: theme.radius.xl,
            },
          ]}
        >
          <Icon size={32} color={primary ? theme.primaryForeground : theme.primary} strokeWidth={1.75} />
        </View>
        <Text style={[styles.btnTitle, { color: fg, fontFamily: 'Montserrat_800ExtraBold' }]}>
          {title}
        </Text>
        <Text style={[styles.btnDesc, { color: sub, fontFamily: theme.fontSans }]}>
          {description}
        </Text>
      </TouchableOpacity>
    </MotiView>
  )
}

function GridOverlay({ color }: { color: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <Line x1="28" y1="0" x2="28" y2="28" stroke={color} strokeWidth="1" opacity="0.03" />
          <Line x1="0" y1="28" x2="28" y2="28" stroke={color} strokeWidth="1" opacity="0.03" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#grid)" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
  },
  brandPill: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 18,
  },
  brandPillText: { fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  brand: {
    fontSize: 64,
    letterSpacing: -3,
    lineHeight: 64,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    letterSpacing: 0.4,
  },
  buttons: {
    gap: 16,
  },
  btn: {
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  btnTitle: {
    fontSize: 20,
    letterSpacing: 1.2,
  },
  btnDesc: {
    fontSize: 13,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 0.3,
  },
})
