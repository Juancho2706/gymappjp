import { useCallback, useEffect, useState } from 'react'
import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CoachMainWrapper } from '../../../components/coach/CoachMainWrapper'
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

        {/* Header — fecha + saludo */}
        <MobileGreetingHeader coachName={data.coach.fullName || data.coach.brandName || 'Coach'} pendingCount={pendingCount} />

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
