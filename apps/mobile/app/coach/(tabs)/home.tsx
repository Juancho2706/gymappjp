import { useCallback, useEffect, useState } from 'react'
import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import { CoachMainWrapper } from '../../../components/coach/CoachMainWrapper'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import {
  MobileActivityFeed,
  MobileBillingBanners,
  MobileClientStatsSheet,
  MobileDashboardCharts,
  MobileExpiringPrograms,
  MobileFreeWelcomeModal,
  MobileFocusList,
  MobileGreetingHeader,
  MobileKpiStrip,
  MobileNextBestAction,
  MobileOnboardingChecklist,
  MobilePublicCodeRequiredModal,
  MobileQuickActionsBar,
  MobileRevenueSheet,
  MobileTierUsageBanners,
  MobileTodayAgenda,
} from '../../../components/coach/CoachDashboardSections'
import { useTheme } from '../../../context/ThemeContext'
import { getCoachDashboardDataMobile, type MobileDashboardData } from '../../../lib/coach-dashboard'

export default function CoachHomeScreen() {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<MobileDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revenueOpen, setRevenueOpen] = useState(false)
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
        <View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
          <Text style={[styles.errorTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Algo fallo al cargar el dashboard
          </Text>
          <Text style={[styles.errorText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {error ?? 'Error desconocido. Intenta recargar en un momento.'}
          </Text>
        </View>
      </CoachMainWrapper>
    )
  }

  const pendingCount = data.agenda.length + data.topRiskClients.length
  const showTierBanners =
    data.coach.subscriptionTier === 'free' ||
    (data.coach.subscriptionTier === 'elite' && data.kpi.totalClients >= 48)

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
      <MobileBillingBanners coach={data.coach} activeClientCount={data.kpi.totalClients} />
      {showTierBanners ? (
        <MobileTierUsageBanners coach={data.coach} totalClients={data.kpi.totalClients} />
      ) : null}
      <MobileGreetingHeader coachName={data.coach.fullName || data.coach.brandName || 'Coach'} pendingCount={pendingCount} />
      <MobileQuickActionsBar
        clients={data.clientList}
        onPaymentCreated={() => load('refresh')}
        onClientCreated={() => load('refresh')}
      />
      <MobileOnboardingChecklist
        coach={data.coach}
        publicInviteCode={data.publicCode?.inviteCode}
        initialOnboardingGuide={data.onboardingGuide}
        totalClients={data.kpi.totalClients}
        activePlans={data.activePlans}
        hasStudentSignal30d={data.hasStudentSignal30d}
      />
      <MobileKpiStrip
        kpi={data.kpi}
        onMrrPress={() => setRevenueOpen(true)}
        onAdherencePress={() => setStatsOpen(true)}
      />
      <MobileFocusList items={data.topRiskClients} />
      <MobileNextBestAction
        kpi={data.kpi}
        topRiskClients={data.topRiskClients}
        agenda={data.agenda}
        expiringPrograms={data.expiringPrograms}
        onAdherencePress={() => setStatsOpen(true)}
        onRevenuePress={() => setRevenueOpen(true)}
      />
      <MobileTodayAgenda items={data.agenda} />
      <MobileExpiringPrograms items={data.expiringPrograms} />
      <MobileActivityFeed items={data.recentActivities} />
      <MobileDashboardCharts areaData={data.areaData} barData={data.barData} />
      <MobileRevenueSheet
        open={revenueOpen}
        onClose={() => setRevenueOpen(false)}
        kpi={data.kpi}
        clientPaymentSummary={data.clientPaymentSummary}
      />
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
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  errorTitle: {
    fontSize: 19,
    lineHeight: 24,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
})
