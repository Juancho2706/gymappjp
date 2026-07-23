import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { AlertTriangle, Check, ChevronRight, Dumbbell, Play, RefreshCw } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { getSantiagoUtcBoundsForDay, getTodayInSantiago } from '../../../lib/date-utils'
import { flushLogQueue, getPendingLogCount } from '../../../lib/offline-cache'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, Card, EmptyState, ScreenHeader } from '../../../components'
import { ProgressRing } from '../../../components/ProgressRing'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'
import { measureMorphOrigin, useSessionMorph, useTriggerMorphHide, type MorphOrigin } from '../../../components/alumno/workout/v3/session-morph'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const TODAY_DOW = new Date().getDay()
const SUCCESS_500 = '#1FB877'

const FONT_BOLD = 'HankenGrotesk_700Bold'
const FONT_SEMI = 'HankenGrotesk_600SemiBold'

interface Plan {
  id: string
  title: string
  day_of_week: number | null
  assigned_date: string | null
  blockCount: number
  setsTarget: number
  blockIds: string[]
}

// Progreso de HOY para el hero (espejo web §4.5 WorkoutHeroCard: series logueadas / objetivo).
interface TodayProgress {
  planId: string
  title: string
  blockCount: number
  logged: number
  target: number
}

export default function WorkoutScreen() {
  const { theme } = useTheme()
  const { startMorph } = useSessionMorph()
  const [plans, setPlans] = useState<Plan[]>([])
  const [todayProgress, setTodayProgress] = useState<TodayProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [pendingLogs, setPendingLogs] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  function mapPlan(p: any): Plan {
    const blocks = (p.workout_blocks ?? []) as { id: string; sets?: number | null }[]
    return {
      id: p.id,
      title: p.title,
      day_of_week: p.day_of_week,
      assigned_date: p.assigned_date,
      blockCount: blocks.length,
      setsTarget: blocks.reduce((sum, b) => sum + (b.sets ?? 0), 0),
      blockIds: blocks.map((b) => b.id),
    }
  }

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const client = await getClientProfile()
      if (!client) { setLoading(false); return }

      const count = await getPendingLogCount()
      setPendingLogs(count)

      const blocksSel = 'workout_blocks ( id, sets )'
      const { data: program, error: progErr } = await supabase
        .from('workout_programs')
        .select(`id, name, workout_plans ( id, title, day_of_week, assigned_date, ${blocksSel} )`)
        .eq('client_id', client.id)
        .eq('is_active', true)
        .maybeSingle()
      if (progErr) throw progErr

      let mapped: Plan[]
      if (program?.workout_plans) {
        mapped = (program.workout_plans as any[]).map(mapPlan)
        mapped.sort((a, b) => (a.day_of_week ?? 7) - (b.day_of_week ?? 7))
      } else {
        const { data, error: plansErr } = await supabase
          .from('workout_plans')
          .select(`id, title, day_of_week, assigned_date, ${blocksSel}`)
          .eq('client_id', client.id)
          .order('assigned_date', { ascending: false })
          .limit(14)
        if (plansErr) throw plansErr
        mapped = (data ?? []).map(mapPlan)
      }
      setPlans(mapped)

      // Progreso de HOY (best-effort): series logueadas hoy para el plan de hoy vs objetivo.
      const todayIso = getTodayInSantiago().iso
      const todayPlan =
        mapped.find((p) => p.assigned_date === todayIso) ??
        mapped.find((p) => p.day_of_week === TODAY_DOW) ??
        null
      setTodayProgress(todayPlan ? await computeTodayProgress(client.id, todayPlan) : null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  async function computeTodayProgress(clientId: string, plan: Plan): Promise<TodayProgress> {
    const base: TodayProgress = { planId: plan.id, title: plan.title, blockCount: plan.blockCount, logged: 0, target: plan.setsTarget }
    if (plan.blockIds.length === 0) return base
    try {
      const { startIso, endIso } = getSantiagoUtcBoundsForDay(getTodayInSantiago().iso)
      const { data } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('client_id', clientId)
        .in('block_id', plan.blockIds)
        .gte('logged_at', startIso)
        .lt('logged_at', endIso)
      return { ...base, logged: data?.length ?? 0 }
    } catch {
      return base
    }
  }

  async function handleSync() {
    setSyncing(true)
    const synced = await flushLogQueue(supabase)
    if (synced > 0) setPendingLogs(0)
    setSyncing(false)
  }

  function renderPlan({ item, index }: { item: Plan; index: number }) {
    // El Despegue nace de la CARD clickeada → cada card mide su rect real (measureMorphOrigin en PlanCard).
    return <PlanCard item={item} index={index} onStart={(origin) => startMorph({ planId: item.id, origin })} />
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader
        title="Mi entrenamiento"
        subtitle="Toca el plan de hoy para empezar"
        trailing={
          pendingLogs > 0 ? (
            <TouchableOpacity
              style={[
                styles.syncBtn,
                {
                  backgroundColor: theme.primary + '15',
                  borderColor: theme.primary + '40',
                  borderRadius: theme.radius.lg,
                },
              ]}
              onPress={handleSync}
              disabled={syncing}
              activeOpacity={0.8}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <>
                  <RefreshCw size={13} color={theme.primary} strokeWidth={2.25} />
                  <Text style={[styles.syncText, { color: theme.primary, fontFamily: FONT_BOLD }]}>
                    Sync ({pendingLogs})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null
        }
      />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando rutinas…" />
      ) : error ? (
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
            No pudimos cargar tus rutinas
          </Text>
          <Text style={[styles.errorSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Revisa tu conexión e intenta de nuevo en un momento.
          </Text>
          <Button testID="workout-retry" label="Reintentar" variant="outline" onPress={load} />
        </View>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Sin programa activo"
          subtitle="Tu coach aún no te asignó un plan de entrenamiento."
        />
      ) : (
        <FlatList
          data={todayProgress ? plans.filter((p) => p.id !== todayProgress.planId) : plans}
          keyExtractor={(p) => p.id}
          renderItem={renderPlan}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            todayProgress ? (
              <TodayHero
                progress={todayProgress}
                onStart={(origin) => startMorph({ planId: todayProgress.planId, origin })}
              />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  )
}

/** Card de un plan de la lista. Mide su rect real al tocarla para que el Despegue NAZCA de la card
 *  clickeada (mismo patrón que el CTA del hero); si la medición falla, el morph cae al origen sintético. */
function PlanCard({ item, index, onStart }: { item: Plan; index: number; onStart: (origin: MorphOrigin | null) => void }) {
  const { theme } = useTheme()
  const ref = useRef<View>(null)
  // Ocultar la card real durante el Despegue (el clon la reemplaza); si no, se ve su caja detrás del morph.
  const { hidden, hide } = useTriggerMorphHide()
  const isToday = item.day_of_week === TODAY_DOW
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 350, delay: Math.min(index * 60, 400) }}
    >
      <View ref={ref} collapsable={false} style={{ opacity: hidden ? 0 : 1 }}>
        <Card
          variant={isToday ? 'highlighted' : 'default'}
          interactive
          padding={18}
          onPress={() => {
            hide()
            measureMorphOrigin(ref.current, theme.radius.card, (origin) => onStart(origin))
          }}
          style={styles.card}
        >
          <View
            style={[
              styles.iconChip,
              {
                backgroundColor: isToday ? theme.primary : theme.muted,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <Dumbbell size={20} color={isToday ? theme.primaryForeground : theme.primary} strokeWidth={2} />
          </View>
          <View style={styles.cardLeft}>
            {item.day_of_week != null && (
              <View style={styles.dowRow}>
                <Text
                  style={[
                    styles.dow,
                    { color: isToday ? theme.primary : theme.mutedForeground, fontFamily: FONT_BOLD },
                  ]}
                >
                  {DAY_NAMES[item.day_of_week]}
                </Text>
                {isToday && <Badge label="HOY" tone="sport" variant="solid" />}
              </View>
            )}
            <Text
              style={[styles.planTitle, { color: theme.foreground, fontFamily: FONT_SEMI }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Text style={[styles.planSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {item.blockCount} ejercicio{item.blockCount !== 1 ? 's' : ''}
            </Text>
          </View>
          <ChevronRight size={22} color={isToday ? theme.primary : theme.mutedForeground} />
        </Card>
      </View>
    </MotiView>
  )
}

/** Hero de HOY — espejo web §4.5: ProgressRing (series/objetivo) + CTA Empezar/Continuar/Ver registro. */
function TodayHero({ progress, onStart }: { progress: TodayProgress; onStart: (origin?: MorphOrigin | null) => void }) {
  const { theme } = useTheme()
  const ctaRef = useRef<View>(null)
  // Ocultar el CTA real durante el Despegue (el clon lo reemplaza); si no, se ve la caja del botón detrás.
  const { hidden: ctaHidden, hide: hideCta } = useTriggerMorphHide()
  const { logged, target } = progress
  const done = target > 0 && logged >= target
  const inProgress = logged > 0 && !done
  const pct = target > 0 ? Math.min(100, (logged / target) * 100) : done ? 100 : 0
  const ctaLabel = done ? 'Ver registro' : inProgress ? 'Continuar' : 'Empezar entrenamiento'

  return (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 420 }}
    >
      <Card variant="inverse" padding="lg">
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="font-sans-bold text-sport-400" style={styles.heroEyebrow}>
              HOY ENTRENÁS
            </Text>
            <Text className="font-display-black text-on-dark" style={styles.heroTitle} numberOfLines={2}>
              {progress.title}
            </Text>
            <Text className="font-sans text-on-dark-muted" style={styles.heroMeta}>
              {progress.blockCount} {progress.blockCount === 1 ? 'ejercicio' : 'ejercicios'}
              {target > 0 ? ` · ${target} series` : ''}
            </Text>
          </View>
          <ProgressRing
            value={pct}
            size={64}
            stroke={7}
            color={theme.primary}
            track="rgba(255,255,255,0.12)"
            showValue={false}
            label={
              done ? (
                <Check size={24} color={SUCCESS_500} strokeWidth={3} />
              ) : target > 0 ? (
                <Text className="font-display-black text-on-dark" style={{ fontSize: 14 }}>
                  {logged}/{target}
                </Text>
              ) : (
                <Dumbbell size={22} color="#939DAB" strokeWidth={2.25} />
              )
            }
          />
        </View>
        <View style={{ marginTop: 14, opacity: ctaHidden ? 0 : 1 }} ref={ctaRef} collapsable={false}>
          <Button
            testID="workout-hero-cta"
            label={ctaLabel}
            variant="sport"
            size="lg"
            leftIcon={Play}
            full
            onPress={() => {
              hideCta()
              measureMorphOrigin(ctaRef.current, 16, (origin) => onStart(origin))
            }}
          />
        </View>
      </Card>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  syncText: { fontSize: 12, letterSpacing: 0.3 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconChip: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardLeft: { gap: 5, flex: 1, minWidth: 0 },
  dowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dow: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  planTitle: { fontSize: 16, letterSpacing: -0.2 },
  planSub: { fontSize: 13 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroEyebrow: { fontSize: 11, letterSpacing: 1 },
  heroTitle: { fontSize: 23, letterSpacing: -0.4, marginTop: 7 },
  heroMeta: { fontSize: 13, marginTop: 4 },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  errorTitle: { fontSize: 17, letterSpacing: -0.3, textAlign: 'center' },
  errorSub: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 300, marginBottom: 4 },
})
