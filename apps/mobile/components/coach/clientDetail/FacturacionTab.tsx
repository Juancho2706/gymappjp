import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Calendar, CreditCard, Plus, Receipt, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { StatCard, CardHeader, MetricBox, cd, formatDate, formatCurrency, relativeDays } from './shared'
import { deleteCoachClientPayment, type CoachClientDetailData, type PaymentEntry } from '../../../lib/coach-client-detail'

// Espejo de isPaidStatus/isPendingStatus de la web (BillingTabB8). El semáforo del dot
// y el badge usan esto; mantenemos labels localizados (Pagado/Pendiente/Rechazado).
function statusInfo(status: string | null, theme: any): { color: string; label: string; paid: boolean; pending: boolean } {
  const s = (status ?? '').toLowerCase()
  if (s === 'paid' || s === 'pagado' || s === 'completed' || s === 'aprobado' || s === 'approved' || s === '')
    return { color: theme.success, label: 'Pagado', paid: true, pending: false }
  if (s === 'pending' || s === 'pendiente')
    return { color: '#F59E0B', label: 'Pendiente', paid: false, pending: true }
  if (s === 'failed' || s === 'rechazado' || s === 'rejected')
    return { color: theme.destructive, label: 'Rechazado', paid: false, pending: false }
  return { color: theme.mutedForeground, label: status ?? '—', paid: false, pending: false }
}

function isPaid(s: string | null): boolean {
  const v = (s ?? '').toLowerCase()
  return v === 'paid' || v === 'pagado' || v === 'completed' || v === 'aprobado' || v === 'approved' || v === ''
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

  // "Total cobrado" suma solo pagos efectivamente pagados (espejo web paidRows).
  const totalCobrado = payments.reduce((sum, p) => sum + (isPaid(p.status) ? (Number(p.amount) || 0) : 0), 0)
  const paidRows = payments.filter((p) => isPaid(p.status))
  const lastPaid = paidRows[0] ?? null
  // Próx. renovación: desde el último pago PAGADO + periodo en meses (espejo web).
  const nextRenewal = lastPaid && lastPaid.period_months ? addMonths(lastPaid.payment_date, lastPaid.period_months) : null

  function confirmDelete(p: PaymentEntry) {
    Alert.alert('Eliminar pago', '¿Eliminar este pago del historial?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          const r = await deleteCoachClientPayment(client!.id, p.id)
          if (!r.ok) Alert.alert('Error', r.error ?? 'No se pudo borrar.')
          else reload()
        },
      },
    ])
  }

  return (
    <View style={{ gap: 14 }}>
      {/* KPIs — espejo de las 3 GlassCards de la web. "Total cobrado" usa color de marca. */}
      <View style={cd.grid2}>
        <MetricBox
          value={formatCurrency(totalCobrado)}
          label="Total cobrado"
          color={theme.primary}
          sub="Suma de pagos marcados como pagados"
        />
        <MetricBox
          value={lastPaid ? relativeDays(lastPaid.payment_date) : '—'}
          label="Último pago"
          sub={lastPaid ? `${formatDate(lastPaid.payment_date)} · ${formatCurrency(lastPaid.amount)}` : undefined}
        />
        <MetricBox
          value={nextRenewal ? formatDate(nextRenewal) : '—'}
          label="Próx. renovación (estim.)"
          sub="Desde último pago + periodo en meses"
        />
      </View>

      {/* Línea de tiempo — header con CreditCard + "Nuevo pago" dentro de la card. */}
      <StatCard>
        <CardHeader
          icon={CreditCard}
          title="Línea de tiempo"
          right={
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onAddPayment}
              style={[styles.newPayBtn, { backgroundColor: theme.primary, borderRadius: theme.radius.md }, theme.shadowGlowBlue]}
            >
              <Plus size={13} color={theme.primaryForeground} />
              <Text style={[styles.newPayTxt, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>Nuevo pago</Text>
            </TouchableOpacity>
          }
        />

        {payments.length === 0 ? (
          <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            No hay pagos registrados.
          </Text>
        ) : (
          <View style={styles.timeline}>
            {/* Línea vertical continua detrás de los dots. */}
            <View style={[styles.spine, { backgroundColor: theme.border }]} />
            {payments.map((p) => {
              const si = statusInfo(p.status, theme)
              return (
                <View key={p.id} style={styles.tlItem}>
                  {/* Dot del semáforo sobre la línea. */}
                  <View style={[styles.dot, { backgroundColor: si.color, borderColor: theme.card }]} />
                  {/* Tarjeta rica. */}
                  <View style={[styles.payCard, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
                    <View style={styles.payTop}>
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text style={[styles.payAmount, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>
                          {formatCurrency(p.amount)}
                        </Text>
                        <Text style={[styles.payDesc, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
                          {p.service_description || 'Sin descripción'}
                        </Text>
                        <View style={styles.metaRow}>
                          <View style={styles.metaItem}>
                            <Calendar size={11} color={theme.mutedForeground} />
                            <Text style={[styles.metaTxt, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                              {formatDate(p.payment_date)}
                            </Text>
                          </View>
                          {p.period_months != null && p.period_months > 0 ? (
                            <Text style={[styles.metaTxt, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                              {p.period_months} mes{p.period_months === 1 ? '' : '(es)'}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      {/* Columna derecha: badge estado arriba + borrar ghost abajo. */}
                      <View style={styles.payRight}>
                        <View style={[styles.badge, { backgroundColor: si.color + '1A', borderColor: si.color + '55', borderRadius: theme.radius.sm }]}>
                          <Text style={[styles.badgeTxt, { color: si.color, fontFamily: 'Montserrat_800ExtraBold' }]}>{si.label}</Text>
                        </View>
                        <TouchableOpacity onPress={() => confirmDelete(p)} hitSlop={8} style={styles.delBtn}>
                          <Trash2 size={16} color={theme.destructive} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {/* Bloque comprobante: thumb 48x48 + icono Receipt + "Comprobante". */}
                    {p.receipt_url ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => onOpenPhoto([p.receipt_url!], 0)}
                        style={[styles.receiptRow, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.radius.md }]}
                      >
                        <Image source={{ uri: p.receipt_url }} style={[styles.receiptThumb]} contentFit="cover" transition={150} />
                        <Receipt size={15} color={theme.primary} />
                        <Text style={[styles.receiptTxt, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Comprobante</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </StatCard>
    </View>
  )
}

// Geometría del timeline (espejo de la web: línea vertical + dots sobre ella).
const TL_PAD = 26 // sangría del contenido respecto al borde de la card
const SPINE_X = 6 // x de la línea vertical (dentro del gutter izq)
const DOT = 14
// El dot vive dentro de tlItem (cuyo borde izq está en x=TL_PAD); lo empujamos a la
// izquierda para que su centro caiga sobre la línea (SPINE_X + 0.5).
const DOT_LEFT = SPINE_X + 0.5 - DOT / 2 - TL_PAD

const styles = StyleSheet.create({
  empty: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingVertical: 28 },
  newPayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  newPayTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },

  timeline: { position: 'relative', paddingLeft: TL_PAD, gap: 16, marginTop: 2 },
  spine: { position: 'absolute', top: 10, bottom: 10, left: SPINE_X, width: 1 },
  tlItem: { position: 'relative' },
  dot: { position: 'absolute', left: DOT_LEFT, top: 8, width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, zIndex: 2 },

  payCard: { borderWidth: 1, padding: 14, gap: 10 },
  payTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  payAmount: { fontSize: 17, letterSpacing: -0.3 },
  payDesc: { fontSize: 13.5 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7 },

  payRight: { alignItems: 'flex-end', gap: 8 },
  badge: { borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  delBtn: { padding: 6 },

  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, padding: 8 },
  receiptThumb: { width: 48, height: 48, borderRadius: 6 },
  receiptTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
})
