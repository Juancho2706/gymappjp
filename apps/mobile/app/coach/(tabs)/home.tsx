import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { CoachMainWrapper } from '../../../components/coach/CoachMainWrapper'
import {
  MobileActivityFeed,
  MobileExpiringPrograms,
  MobileFocusList,
  MobileGreetingHeader,
  MobileKpiStrip,
  MobileNextBestAction,
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
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    )
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
      <MobileGreetingHeader coachName={data.coach.fullName || data.coach.brandName || 'Coach'} pendingCount={pendingCount} />
      <MobileKpiStrip kpi={data.kpi} />
      <MobileFocusList items={data.topRiskClients} />
      <MobileNextBestAction hasRisk={data.topRiskClients.length > 0} hasAgenda={data.agenda.length > 0} />
      <MobileTodayAgenda items={data.agenda} />
      <MobileExpiringPrograms items={data.expiringPrograms} />
      <MobileActivityFeed items={data.recentActivities} />
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
