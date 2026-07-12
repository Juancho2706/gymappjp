import { useCallback, useRef, useState } from 'react'
import { RefreshControl, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { AlertTriangle, RotateCcw } from 'lucide-react-native'
import { CoachMainWrapper } from '../../../components/coach/CoachMainWrapper'
import { Button } from '../../../components/Button'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import {
  MobileBillingBanners,
  MobileClientStatsSheet,
  MobileFreeWelcomeModal,
  MobileFocusList,
  MobileGreetingHeader,
  MobileNovedades,
  MobileOnboardingGuideChip,
  MobilePublicCodeRequiredModal,
  MobilePulseHero,
  MobileQuickActionsFab,
  MobileTierUsageBanners,
  MobileTodayAgenda,
} from '../../../components/coach/CoachDashboardSections'
import { useTheme } from '../../../context/ThemeContext'
import { getCoachDashboardDataMobile, type MobileDashboardData } from '../../../lib/coach-dashboard'

export default function CoachHomeScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<MobileDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  // Espejo de `data` para decidir initial vs refresh en cada foco sin re-disparar en loop.
  const dataRef = useRef<MobileDashboardData | null>(null)

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    if (mode === 'refresh') setRefreshing(true)
    setError(null)

    try {
      const next = await getCoachDashboardDataMobile()
      setData(next)
      dataRef.current = next
      if (!next) setError('No se pudo cargar tu perfil de coach.')
    } catch {
      setError('No se pudo cargar el dashboard.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Gotcha 6b: el tab de expo-router no se desmonta → un `useEffect` de un disparo
  // congela KPIs/agenda al volver. `useFocusEffect` refetcha en cada foco: 'initial'
  // (loader full-screen) la primera vez / tras error; 'refresh' (barra) si ya hay datos.
  useFocusEffect(
    useCallback(() => {
      void load(dataRef.current ? 'refresh' : 'initial')
    }, [load])
  )

  if (loading) {
    return <EvaLoaderScreen subtitle="Cargando tu panel…" />
  }

  // Solo la ausencia de datos reemplaza el dashboard (paridad con el error boundary web,
  // que solo pinta la card en un throw de render y jamas descarta contenido ya pintado).
  // Un pull-to-refresh fallido setea `error` pero conserva `data` → dashboard intacto.
  if (!data) {
    return (
      <CoachMainWrapper
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <View className="items-center justify-center gap-3 px-6" style={{ paddingVertical: 48 }}>
          <View
            className="items-center justify-center rounded-2xl border"
            style={{
              width: 64,
              height: 64,
              backgroundColor: theme.destructive + '14',
              borderColor: theme.destructive + '33',
              marginBottom: 4,
            }}
          >
            <AlertTriangle size={28} color={theme.destructive} strokeWidth={1.9} />
          </View>
          <Text className="font-display-bold text-[18px] text-strong" style={{ textAlign: 'center' }}>
            Algo falló al cargar el dashboard
          </Text>
          <Text
            className="font-sans text-[13px] text-muted"
            style={{ textAlign: 'center', lineHeight: 19, maxWidth: 300 }}
          >
            {error ?? 'Error desconocido. Intenta recargar en un momento.'}
          </Text>
          <Button label="Reintentar" variant="outline" leftIcon={RotateCcw} onPress={() => load('initial')} />
        </View>
      </CoachMainWrapper>
    )
  }

  // Umbral 80 = misma fuente que el banner interno (MobileTierUsageBanners → TeamsBridge >= 80).
  const showTierBanners =
    data.coach.subscriptionTier === 'free' ||
    (data.coach.subscriptionTier === 'elite' && data.kpi.totalClients >= 80)

  return (
    <View style={{ flex: 1 }}>
      <CoachMainWrapper
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <MobileBillingBanners coach={data.coach} activeClientCount={data.kpi.totalClients} />
        {showTierBanners ? (
          <MobileTierUsageBanners coach={data.coach} totalClients={data.kpi.totalClients} />
        ) : null}

        {/* Header — fecha + "Hola, {nombre}" + acciones (Insights / Notificaciones / avatar) */}
        <MobileGreetingHeader
          coachName={data.coach.fullName || data.coach.brandName || 'Coach'}
          logoUrl={data.coach.logoUrl}
          onInsights={() => setStatsOpen(true)}
          onAvatar={() => router.push('/coach/(tabs)/settings')}
          pendingCount={data.topRiskClients.length + data.expiringPrograms.length + data.pendingCheckinsCount}
        />

        {/* P1 — Pulse hero (Activos · En riesgo · Adherencia) */}
        <MobilePulseHero
          kpi={data.kpi}
          onActivosPress={() => router.push('/coach/(tabs)/clientes')}
          onRiesgoPress={() => router.push('/coach/(tabs)/clientes')}
          onAdherencePress={() => setStatsOpen(true)}
        />

        {/* P2 — Prioridad de hoy (card oscura + NextBestAction embebido) */}
        <MobileFocusList
          items={data.topRiskClients}
          kpi={data.kpi}
          agenda={data.agenda}
          expiringPrograms={data.expiringPrograms}
          onAdherencePress={() => setStatsOpen(true)}
        />

        {/* Agenda de hoy */}
        <MobileTodayAgenda items={data.agenda} />

        {/* Novedades — programas por vencer + actividad reciente */}
        <MobileNovedades
          expiringPrograms={data.expiringPrograms}
          activities={data.recentActivities}
          pendingCheckins={data.pendingCheckinsCount}
        />

        {/* P3 — Guia de inicio como chip expandible */}
        <MobileOnboardingGuideChip
          coach={data.coach}
          totalClients={data.kpi.totalClients}
          activePlans={data.activePlans}
          hasStudentSignal30d={data.hasStudentSignal30d}
        />

        {/* Sheets / modales */}
        <MobileClientStatsSheet
          open={statsOpen}
          onClose={() => setStatsOpen(false)}
          clientStats={data.clientStats}
        />
        <MobileFreeWelcomeModal enabled={data.coach.subscriptionTier === 'free'} />
        <MobilePublicCodeRequiredModal
          visible={Boolean(data.publicCode?.shouldConfirm && data.publicCode.inviteCode)}
          inviteCode={data.publicCode?.inviteCode ?? ''}
          onConfirmed={() => load('refresh')}
        />
      </CoachMainWrapper>

      {/* FAB — acciones rapidas (fijo sobre el scroll) */}
      <MobileQuickActionsFab
        clients={data.clientList}
        onClientCreated={() => load('refresh')}
        onPaymentCreated={() => load('refresh')}
      />
    </View>
  )
}
