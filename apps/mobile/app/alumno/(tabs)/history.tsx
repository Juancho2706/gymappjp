import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { cssInterop } from 'nativewind'
import { MotiView } from 'moti'
import { Easing, useReducedMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { AlertTriangle, Calendar, ChevronDown, ChevronLeft, Dumbbell } from 'lucide-react-native'
import { getClientProfile } from '../../../lib/client'
import {
  getWorkoutDaySummaries,
  HISTORY_DAYS_DEFAULT,
  HISTORY_DAYS_EXTENDED,
  type DaySummary,
} from '../../../lib/history.queries'
import { useTheme } from '../../../context/ThemeContext'
import { Button } from '../../../components'
import { Card } from '../../../components/Card'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

const FONT_DISPLAY = 'Archivo_900Black'
const FONT_BOLD = 'HankenGrotesk_700Bold'
const FONT_MONO = 'JetBrainsMono_700Bold'

// lucide-react-native no soporta currentColor: sin cssInterop la className text-*
// es inerte y el icono cae a negro (invisible en dark). En web ChevronLeft/ChevronDown
// heredan text-strong (page.tsx:41,44,82,84) y Calendar hereda text-subtle
// (page.tsx:66,68). Mapeamos className→prop `color` igual que Sheet.tsx:44 y
// perfil.tsx:64, para que los tokens resuelvan light/dark. (Dumbbell no lo necesita:
// usa color={theme.primary} por prop, :64 y :203.)
for (const Icon of [ChevronLeft, ChevronDown, Calendar]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

// Curva del reveal fade-up de la web (Reveal.tsx:7 `ease: [0.16, 1, 0.3, 1]`), 1:1.
const EASE_FADEUP = Easing.bezier(0.16, 1, 0.3, 1)

/**
 * Etiqueta de día 1:1 con la web (dashboard.queries.ts:228-232):
 * `new Date(day + 'T12:00:00').toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'short' })`
 * → "lunes, 3 mar". El ancla T12:00:00 evita saltos de día por zona horaria. Se
 * recalcula aquí (no en la query compartida getWorkoutDaySummaries, que usa el
 * label relativo "Hoy/Ayer" del dashboard) para no alterar el widget/perfil.
 */
function formatDayLabel(dayKey: string): string {
  return new Date(dayKey + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Header inline (no sticky) — 1:1 con la web (page.tsx:37-63): botón volver al
 * dashboard, badge con el color de marca del coach al 12%, título display-black
 * y subtítulo con el rango activo.
 */
function HistoryHeader({ monthsLabel, onBack }: { monthsLabel: string; onBack: () => void }) {
  const { theme } = useTheme()
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Volver al inicio"
        hitSlop={8}
        style={[styles.backBtn, { backgroundColor: theme.muted, borderRadius: theme.radius.md }]}
      >
        <ChevronLeft size={20} className="text-strong" strokeWidth={2} />
      </Pressable>
      <View
        style={[styles.badge, { backgroundColor: theme.primary + '1F', borderRadius: theme.radius.md }]}
      >
        <Dumbbell size={19} color={theme.primary} strokeWidth={2} />
      </View>
      <View style={styles.headerText}>
        <Text className="text-strong" style={[styles.h1, { fontFamily: FONT_DISPLAY }]}>
          Historial de entrenos
        </Text>
        <Text className="text-muted" style={[styles.headerSub, { fontFamily: theme.fontSans }]}>
          Días con series registradas (últimos {monthsLabel})
        </Text>
      </View>
    </View>
  )
}

export default function HistoryScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const reduced = useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expanding, setExpanding] = useState(false)
  const [daysBack, setDaysBack] = useState(HISTORY_DAYS_DEFAULT)
  const [summaries, setSummaries] = useState<DaySummary[]>([])

  useEffect(() => { void load(HISTORY_DAYS_DEFAULT) }, [])

  async function load(days: number) {
    setLoading(true)
    setError(false)
    try {
      const client = await getClientProfile()
      if (!client) { setLoading(false); return }

      // Conteo de series por día agregado en DB (RPC) — 90d por defecto, 180d al "ver más".
      const data = await getWorkoutDaySummaries(client.id, days)
      setSummaries(data)
      setDaysBack(days)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  async function showMore() {
    setExpanding(true)
    try {
      await load(HISTORY_DAYS_EXTENDED)
    } finally {
      setExpanding(false)
    }
  }

  // Volver al dashboard (home) — espejo del back web a `${base}/dashboard`.
  const goBack = () => router.push('/alumno/home')

  const extended = daysBack >= HISTORY_DAYS_EXTENDED
  const monthsLabel = extended ? '6 meses' : '3 meses'

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <View style={styles.contentFill}>
          <HistoryHeader monthsLabel={monthsLabel} onBack={goBack} />
          <EvaLoaderScreen subtitle="Cargando historial…" />
        </View>
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <View style={styles.contentFill}>
        <HistoryHeader monthsLabel={monthsLabel} onBack={goBack} />
        <View style={styles.errorBox}>
          <View
            style={{
              width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
              backgroundColor: theme.destructive + '14', borderWidth: 1, borderColor: theme.destructive + '33', marginBottom: 4,
            }}
          >
            <AlertTriangle size={26} color={theme.destructive} strokeWidth={1.9} />
          </View>
          <Text style={[styles.errorTitle, { color: theme.foreground, fontFamily: FONT_BOLD }]}>
            No pudimos cargar tu historial
          </Text>
          <Text style={[styles.errorSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Revisa tu conexión e intenta de nuevo en un momento.
          </Text>
          <Button testID="history-retry" label="Reintentar" variant="outline" onPress={() => load(daysBack)} />
        </View>
        </View>
      </SafeAreaView>
    )
  }

  if (summaries.length === 0) {
    // Empty state 1:1 con la web (page.tsx:66-72): Calendar 34 al 40% + una sola línea text-subtle.
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <View style={styles.contentFill}>
          <HistoryHeader monthsLabel={monthsLabel} onBack={goBack} />
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <Calendar size={34} className="text-subtle" strokeWidth={2} />
            </View>
            <Text className="text-subtle" style={[styles.emptyText, { fontFamily: theme.fontSans }]}>
              Aún no hay series registradas en este periodo. Cuando completes entrenos, aparecerán aquí.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
        <HistoryHeader monthsLabel={monthsLabel} onBack={goBack} />

        <View style={styles.body}>
          {/* Un solo Card con filas y divisores — 1:1 con WorkoutHistoryList (web). */}
          <Card padding="none" style={{ overflow: 'hidden' }}>
            {summaries.map((item, index) => (
              <MotiView
                key={item.dayKey}
                from={reduced ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: 24 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{
                  type: 'timing',
                  duration: reduced ? 0 : 450,
                  delay: reduced ? 0 : Math.min(index, 12) * 40,
                  easing: EASE_FADEUP,
                }}
              >
                {index > 0 ? (
                  <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 14 }} />
                ) : null}
                <View style={styles.row}>
                  <View style={[styles.dayChip, { backgroundColor: theme.muted, borderRadius: theme.radius.sm }]}>
                    <Dumbbell size={17} color={theme.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.rowText}>
                    <Text className="text-strong" style={[styles.dayLabel, { fontFamily: FONT_BOLD }]}>
                      {formatDayLabel(item.dayKey)}
                    </Text>
                    <Text className="text-muted" style={[styles.daySub, { fontFamily: theme.fontSans }]}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <View style={[styles.setsPill, { backgroundColor: theme.muted }]}>
                    <Text className="text-strong" style={[styles.setsPillText, { fontFamily: FONT_MONO }]}>
                      {item.sets === 1 ? '1 serie' : `${item.sets} series`}
                    </Text>
                  </View>
                </View>
              </MotiView>
            ))}
          </Card>

          {!extended ? (
            <TouchableOpacity
              testID="history-show-more"
              activeOpacity={0.82}
              onPress={showMore}
              disabled={expanding}
              // Web: border-default + bg-surface-card (page.tsx:82). border-default es
              // más marcado que border-subtle; se resuelve dark-aware vía la var.
              className="border-default bg-surface-card"
              style={styles.moreBtn}
            >
              {/* Web: ChevronDown hereda currentColor = text-strong del Link (page.tsx:82,84), no la marca. */}
              <ChevronDown size={16} className="text-strong" strokeWidth={2} />
              <Text className="text-strong" style={[styles.moreTxt, { fontFamily: FONT_BOLD }]}>
                {expanding ? 'Cargando…' : 'Ver últimos 6 meses'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <Text className="text-subtle" style={[styles.disclaimer, { fontFamily: theme.fontSans }]}>
            Solo ves tus propios registros. Mostrando los últimos {monthsLabel}.
          </Text>
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Web: contenedor interno `pb-6` = 24px bajo el disclaimer (page.tsx:36). 1:1.
  scroll: { paddingBottom: 24 },
  // Espejo de `mx-auto max-w-2xl` (page.tsx:36): capa el contenido a 42rem (672px)
  // y lo centra. En teléfono (<672px) width:'100%' llena; en tablet no se estira.
  content: { width: '100%', maxWidth: 672, alignSelf: 'center' },
  contentFill: { flex: 1, width: '100%', maxWidth: 672, alignSelf: 'center' },
  body: { paddingHorizontal: 20 },
  // Header (web page.tsx:38 `flex items-center gap-[11px] pb-4 pt-1.5`, dentro de px-5).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: -8 },
  badge: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerText: { flex: 1, minWidth: 0 },
  h1: { fontSize: 21, lineHeight: 21, letterSpacing: -0.42 },
  headerSub: { fontSize: 12.5, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dayChip: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0 },
  dayLabel: { fontSize: 14.5, textTransform: 'capitalize' },
  daySub: { fontSize: 12.5 },
  setsPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexShrink: 0 },
  setsPillText: { fontSize: 12.5 },
  moreBtn: {
    marginTop: 14,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  moreTxt: { fontSize: 13.5 },
  disclaimer: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 16 },
  // Empty state (web page.tsx:66-72 `px-5 py-12 text-center text-subtle`). El div
  // del empty (px-5=20) va anidado en el contenedor con px-5=20 (page.tsx:36), así
  // que el inset horizontal efectivo es 40px por lado, no 20 — replicamos el px-5 compuesto.
  emptyBox: { paddingHorizontal: 40, paddingVertical: 48, alignItems: 'center' },
  emptyIcon: { marginBottom: 10, opacity: 0.4 },
  emptyText: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  errorTitle: { fontSize: 17, letterSpacing: -0.3, textAlign: 'center' },
  errorSub: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 300, marginBottom: 4 },
})
