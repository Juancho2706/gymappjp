import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { CreditCard, Receipt, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState } from '../../../components'
import { StatCard, CardHeader, MetricBox, Pill, cd, formatDate, formatCurrency, relativeDays } from './shared'
import { deleteCoachClientPayment, type CoachClientDetailData, type PaymentEntry } from '../../../lib/coach-client-detail'

function statusInfo(status: string | null, theme: any): { color: string; label: string } {
  const s = (status ?? '').toLowerCase()
  if (s === 'paid' || s === 'aprobado' || s === 'approved' || s === '') return { color: theme.success, label: 'Pagado' }
  if (s === 'pending' || s === 'pendiente') return { color: '#F59E0B', label: 'Pendiente' }
  if (s === 'failed' || s === 'rechazado' || s === 'rejected') return { color: theme.destructive, label: 'Rechazado' }
  return { color: theme.mutedForeground, label: status ?? '—' }
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export function FacturacionTab({
  data,
  reload,
  onAddPayment,
  onOpenPhoto,
}: {
  data: CoachClientDetailData
  reload: () => void
  onAddPayment: () => void
  onOpenPhoto: (photos: string[], index: number) => void
}) {
  const { theme } = useTheme()
  const { payments, client } = data

  // A-F24: "Total cobrado" suma solo pagos efectivamente pagados (web hace igual).
  const isPaid = (s: string | null) => { const v = (s ?? '').toLowerCase(); return v === 'paid' || v === 'aprobado' || v === 'approved' || v === 'pagado' || v === '' }
  const totalCobrado = payments.reduce((sum, p) => sum + (isPaid(p.status) ? (Number(p.amount) || 0) : 0), 0)
  const last = payments[0] ?? null
  const nextRenewal = last && last.period_months ? addMonths(last.payment_date, last.period_months) : null

  function confirmDelete(p: PaymentEntry) {
    Alert.alert('Borrar pago', `¿Eliminar el pago de ${formatCurrency(p.amount)} del ${formatDate(p.payment_date)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive', onPress: async () => {
          const r = await deleteCoachClientPayment(client!.id, p.id)
          if (!r.ok) Alert.alert('Error', r.error ?? 'No se pudo borrar.')
          else reload()
        },
      },
    ])
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={cd.grid2}>
        <MetricBox value={formatCurrency(totalCobrado)} label="Total cobrado" color={theme.success} sub="Pagos marcados como pagados" />
        <MetricBox value={last ? relativeDays(last.payment_date) : '—'} label="Último pago" sub={last ? `${formatDate(last.payment_date)} · ${formatCurrency(last.amount)}` : undefined} />
        <MetricBox value={nextRenewal ? formatDate(nextRenewal) : '—'} label="Próx. renovación (estim.)" sub="Desde último pago + meses" />
      </View>

      <Button label="Registrar pago" leftIcon={CreditCard} onPress={onAddPayment} full />

      {payments.length ? (
        <StatCard>
          <CardHeader icon={Receipt} title="Línea de tiempo" />
          {payments.map((p, i) => {
            const si = statusInfo(p.status, theme)
            return (
              <View key={p.id} style={[styles.payRow, i < payments.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.dot, { backgroundColor: si.color }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.payTop}>
                    <Text style={[styles.payAmount, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{formatCurrency(p.amount)}</Text>
                    <Pill label={si.label} color={si.color} />
                  </View>
                  <Text numberOfLines={1} style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {formatDate(p.payment_date)}{p.service_description ? ` · ${p.service_description}` : ''}{p.period_months ? ` · ${p.period_months} mes${p.period_months === 1 ? '' : 'es'}` : ''}
                  </Text>
                </View>
                {p.receipt_url ? (
                  <TouchableOpacity activeOpacity={0.85} onPress={() => onOpenPhoto([p.receipt_url!], 0)}>
                    <Image source={{ uri: p.receipt_url }} style={[styles.receipt, { borderColor: theme.border }]} contentFit="cover" transition={150} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => confirmDelete(p)} hitSlop={8} style={{ padding: 4 }}>
                  <Trash2 size={16} color={theme.destructive} />
                </TouchableOpacity>
              </View>
            )
          })}
        </StatCard>
      ) : (
        <EmptyState icon={CreditCard} title="Sin pagos" subtitle="Aún no hay pagos registrados." />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  payTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payAmount: { fontSize: 15 },
  receipt: { width: 38, height: 38, borderRadius: 8, borderWidth: 1 },
})
