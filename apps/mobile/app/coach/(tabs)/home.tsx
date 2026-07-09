import { useCallback, useEffect, useState } from 'react'
import { RefreshControl, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AlertTriangle } from 'lucide-react-native'
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

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    if (mode === 'refresh') setRefreshing(true)
    setError(null)

    try {
      const next = await getCoachDashboardDataMobile()
      setData(next)
      if (!next) setError('No se pudo cargar tu perfil de coach.')
    } catch {
      setError('No se pudo cargar el dashboard.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <EvaLoaderScreen subtitle="Cargando tu panel…" />
  }

  if (!data || error) {
    return (
      <CoachMainWrapper>
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
            No pudimos cargar tu panel
          </Text>
          <Text
            className="font-sans text-[13px] text-muted"
            style={{ textAlign: 'center', lineHeight: 19, maxWidth: 300 }}
          >
            {error ?? 'Error desconocido. Intenta recargar en un momento.'}
          </Text>
          <Button label="Reintentar" variant="outline" onPress={() => load('refresh')} />
        </View>
      </CoachMainWrapper>
    )
  }

  const pendingCount = data.agenda.length + data.topRiskClients.length
  const showTierBanners =
    data.coach.subscriptionTier === 'free' ||
    (data.coach.subscriptionTier === 'elite' && data.kpi.totalClients >= 48)

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
          hasNotifications={pendingCount > 0}
          onInsights={() => setStatsOpen(true)}
          onNotifications={() => router.push('/coach/(tabs)/check-ins')}
          onAvatar={() => router.push('/coach/(tabs)/perfil')}
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
        <MobileNovedades expiringPrograms={data.expiringPrograms} activities={data.recentActivities} />

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
