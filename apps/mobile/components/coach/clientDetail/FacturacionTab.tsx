import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Calendar, Camera, ChevronRight, CreditCard, Plus, Receipt, Scale, StickyNote, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { StatCard, CardHeader, MetricBox, cd, formatDate, formatCurrency, relativeDays } from './shared'
import { deleteCoachClientPayment, type CoachClientDetailData, type PaymentEntry } from '../../../lib/coach-client-detail'

// Espejo EXACTO de isPaidStatus de la web (BillingTabB8): solo paid/pagado/completed
// cuentan como pagado. '' y null = NO pagado (corrige el bug donde mobile trataba
// '' y aprobado/approved como pagado, inflando "Total cobrado" y el semáforo).
function isPaidStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toLowerCase()
  return s === 'paid' || s === 'pagado' || s === 'completed'
}

// Espejo de isPendingStatus de la web: solo 'pending' es pendiente.
function isPendingStatus(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase() === 'pending'
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

// Energía como 5 estrellas (espejo de EnergyStars de ProfileCheckInSnapshot):
// round(level/2), ámbar si está llena, muted si vacía.
function EnergyStars({ level }: { level: number | null | undefined }) {
  const { theme } = useTheme()
  const stars = Math.min(5, Math.max(0, Math.round((level ?? 0) / 2)))
  return (
    <View
      style={styles.starsRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Energía ${level ?? 0} de 10`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={[styles.star, { color: i <= stars ? '#FBBF24' : theme.mutedForeground }]}>★</Text>
      ))}
    </View>
  )
}

export function FacturacionTab({
  data,
  reload,
  onAddPayment,
  onOpenPhoto,
  onViewHistory,
}: {
  data: CoachClientDetailData
  reload: () => void
  onAddPayment: () => void
  onOpenPhoto: (photos: string[], index: number) => void
  /** Navega a la pestaña Progreso. Opcional: lo cablea [clientId].tsx (fuera de este set). */
  onViewHistory?: () => void
}) {
  const { theme } = useTheme()
  const { payments, client, checkIns } = data

  // "Total cobrado" suma SOLO pagos efectivamente pagados (espejo web paidRows + totalPaid).
  const paidRows = payments.filter((p) => isPaidStatus(p.status))
  const totalCobrado = paidRows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const lastPaid = paidRows[0] ?? null
  // Próx. renovación: desde el último pago PAGADO + periodo en meses (espejo web).
  const nextRenewal = lastPaid && lastPaid.period_months ? addMonths(lastPaid.payment_date, lastPaid.period_months) : null

  const latestCheckIn = checkIns[0] ?? null

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
              accessibilityRole="button"
              accessibilityLabel="Registrar nuevo pago"
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
              const paid = isPaidStatus(p.status)
              const pending = isPendingStatus(p.status)
              // Semáforo del dot/badge (espejo web): emerald=pagado, amber=pendiente, muted=otro.
              const dotColor = paid ? theme.success : pending ? '#F59E0B' : theme.mutedForeground
              // Badge muestra el status crudo (o '—'), igual que la web.
              const badgeLabel = p.status || '—'
              return (
                <View key={p.id} style={styles.tlItem}>
                  {/* Dot del semáforo sobre la línea. */}
                  <View style={[styles.dot, { backgroundColor: dotColor, borderColor: theme.card }]} />
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
                        <View style={[styles.badge, { backgroundColor: dotColor + '1A', borderColor: dotColor + '55', borderRadius: theme.radius.sm }]}>
                          <Text style={[styles.badgeTxt, { color: dotColor, fontFamily: 'Montserrat_800ExtraBold' }]}>{badgeLabel}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => confirmDelete(p)}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel="Eliminar pago"
                          style={styles.delBtn}
                        >
                          <Trash2 size={16} color={theme.destructive} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {/* Bloque comprobante: thumb 48x48 + icono Receipt + "Comprobante". */}
                    {p.receipt_url ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => onOpenPhoto([p.receipt_url!], 0)}
                        accessibilityRole="button"
                        accessibilityLabel="Ver comprobante de pago"
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

      {/* Snapshot del último check-in — espejo de ProfileCheckInSnapshot de la web. */}
      {latestCheckIn ? (
        <StatCard>
          <CardHeader
            icon={Camera}
            title="Último check-in"
            right={
              <Text style={[styles.snapDate, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {relativeDays(latestCheckIn.date)}
              </Text>
            }
          />

          {latestCheckIn.front_photo_url || latestCheckIn.back_photo_url ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onOpenPhoto([latestCheckIn.front_photo_url, latestCheckIn.back_photo_url].filter(Boolean) as string[], 0)}
              accessibilityRole="button"
              accessibilityLabel="Ampliar foto del check-in"
            >
              <Image
                source={{ uri: (latestCheckIn.front_photo_url || latestCheckIn.back_photo_url)! }}
                style={[styles.snapPhoto, { borderColor: theme.border }]}
                contentFit="cover"
                transition={150}
              />
            </TouchableOpacity>
          ) : null}

          {/* Métricas: Peso · Energía (5 estrellas) · Notas. */}
          <View style={styles.metricList}>
            <View style={[styles.metricRow, { borderColor: theme.border }]}>
              <Scale size={15} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Peso</Text>
                <Text style={[styles.metricVal, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {latestCheckIn.weight != null ? `${latestCheckIn.weight} kg` : '—'}
                </Text>
              </View>
            </View>
            <View style={[styles.metricRow, { borderColor: theme.border }]}>
              <Camera size={15} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Energía</Text>
                <View style={{ marginTop: 2 }}><EnergyStars level={latestCheckIn.energy_level} /></View>
              </View>
            </View>
            <View style={styles.metricRowLast}>
              <StickyNote size={15} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Notas</Text>
                {latestCheckIn.notes?.trim() ? (
                  <Text style={[styles.metricVal, { color: theme.foreground, fontFamily: theme.fontSans }]}>{latestCheckIn.notes}</Text>
                ) : (
                  <Text style={[styles.metricVal, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin notas</Text>
                )}
              </View>
            </View>
          </View>

          {/* Link al pie: Ver historial en Progreso. */}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => onViewHistory?.()}
            accessibilityRole="button"
            accessibilityLabel="Ver historial en Progreso"
            style={styles.historyLink}
          >
            <Text style={[styles.historyTxt, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Ver historial en Progreso</Text>
            <ChevronRight size={14} color={theme.primary} />
          </TouchableOpacity>
        </StatCard>
      ) : (
        // Empty-state — espejo del estado vacío de ProfileCheckInSnapshot.
        <StatCard>
          <View style={styles.emptyCheckRow}>
            <Camera size={15} color={theme.mutedForeground} />
            <Text style={[styles.emptyCheckTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Aún no hay check-ins registrados.
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => onViewHistory?.()}
            accessibilityRole="button"
            accessibilityLabel="Ver historial en Progreso"
            style={styles.historyLink}
          >
            <Text style={[styles.historyTxt, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Ver historial en Progreso</Text>
            <ChevronRight size={14} color={theme.primary} />
          </TouchableOpacity>
        </StatCard>
      )}
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
  newPayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, minHeight: 44 },
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
  delBtn: { padding: 6, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },

  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, padding: 8, minHeight: 44 },
  receiptThumb: { width: 48, height: 48, borderRadius: 6 },
  receiptTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Check-in snapshot
  snapDate: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7 },
  snapPhoto: { width: '100%', aspectRatio: 4 / 3, maxHeight: 176, borderRadius: 12, borderWidth: 1, marginTop: 2 },
  starsRow: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 15, lineHeight: 17 },
  metricList: { marginTop: 4 },
  metricRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  metricRowLast: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 9 },
  metricLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  metricVal: { fontSize: 13.5, marginTop: 2 },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, minHeight: 44, paddingVertical: 6 },
  historyTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  emptyCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyCheckTxt: { fontSize: 13, lineHeight: 18, flex: 1 },
})
