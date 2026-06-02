import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Activity, Archive, ArchiveRestore, Calendar, CreditCard, Dumbbell, MessageCircle, Pencil, Salad, User } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, EmptyState, InfoRow, NativeDialog, Section, SegmentedTabs, Sparkline, TopBar } from '../../../components'
import { apiFetch } from '../../../lib/api'
import {
  getCoachClientDetail,
  setCoachClientArchived,
  updateCoachClient,
  type CheckInEntry,
  type CoachClientDetail,
  type PaymentEntry,
  type ActiveProgramInfo,
} from '../../../lib/coach-client-detail'

type Tab = 'resumen' | 'progreso' | 'pagos'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatCurrency(n: number): string {
  return `$${n.toLocaleString('es-CL')}`
}

export default function ClientDetailScreen() {
  const { clientId, clientName } = useLocalSearchParams<{ clientId: string; clientName?: string }>()
  const { theme } = useTheme()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('resumen')
  const [client, setClient] = useState<CoachClientDetail | null>(null)
  const [checkIns, setCheckIns] = useState<CheckInEntry[]>([])
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [activeProgram, setActiveProgram] = useState<ActiveProgramInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  async function load() {
    setLoading(true)
    const res = await getCoachClientDetail(clientId)
    setClient(res.client)
    setCheckIns(res.checkIns)
    setPayments(res.payments)
    setActiveProgram(res.activeProgram)
    setLoading(false)
  }
  useEffect(() => { load() }, [clientId])

  function openWhatsApp() {
    const digits = (client?.phone ?? '').replace(/\D/g, '')
    if (!digits) { Alert.alert('Sin teléfono', 'Este alumno no tiene teléfono cargado.'); return }
    const msg = `Hola ${client?.full_name?.split(' ')[0] ?? ''}! Te escribo desde EVA.`
    Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`).catch(() => {})
  }

  function confirmArchive() {
    if (!client) return
    const archiving = !client.is_archived
    Alert.alert(
      archiving ? 'Archivar alumno' : 'Reactivar alumno',
      archiving ? `${client.full_name} dejará de aparecer como activo.` : `${client.full_name} volverá a estar activo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: archiving ? 'Archivar' : 'Reactivar',
          style: archiving ? 'destructive' : 'default',
          onPress: async () => {
            const r = await setCoachClientArchived(client.id, archiving)
            if (!r.ok) Alert.alert('Error', r.error ?? 'No se pudo actualizar.')
            else load()
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      </SafeAreaView>
    )
  }
  if (!client) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <TopBar back title="Alumno" onBack={() => router.back()} />
        <EmptyState icon={User} title="Alumno no encontrado" subtitle="Vuelve a la lista de alumnos." />
      </SafeAreaView>
    )
  }

  const weights = [...checkIns].reverse().map((c) => c.weight).filter((w): w is number => w != null)

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <TopBar back title={client.full_name} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 360 }}
          style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <View style={[styles.heroAvatar, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '33', borderRadius: theme.radius['2xl'] }]}>
            <User size={28} color={theme.primary} strokeWidth={1.75} />
          </View>
          <Text style={[styles.heroName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{client.full_name}</Text>
          <Text style={[styles.heroEmail, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{client.email}</Text>
          <Badge label={client.is_archived ? 'Archivado' : client.is_active ? 'Activo' : 'Inactivo'} tone={client.is_archived ? 'muted' : client.is_active ? 'success' : 'muted'} />
        </MotiView>

        <SegmentedTabs<Tab>
          items={[{ value: 'resumen', label: 'Resumen' }, { value: 'progreso', label: 'Progreso' }, { value: 'pagos', label: 'Pagos' }]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'resumen' ? (
          <>
            {/* Quick actions */}
            <View style={styles.actionGrid}>
              <ActionTile icon={Dumbbell} label={activeProgram ? 'Editar programa' : 'Crear programa'} theme={theme}
                onPress={() => router.push(`/coach/program-builder?clientId=${client.id}&clientName=${encodeURIComponent(client.full_name)}`)} />
              <ActionTile icon={Salad} label="Nutrición" theme={theme} onPress={() => router.push('/coach/(tabs)/nutricion')} />
              <ActionTile icon={CreditCard} label="Registrar pago" theme={theme} onPress={() => setPayOpen(true)} />
              <ActionTile icon={Pencil} label="Editar datos" theme={theme} onPress={() => setEditOpen(true)} />
            </View>

            {(client.phone || client.goal_weight_kg != null || client.subscription_start_date) ? (
              <Section title="Información">
                {client.phone ? <InfoRow label="Teléfono" value={client.phone} /> : null}
                {client.goal_weight_kg != null ? <InfoRow label="Peso objetivo" value={`${client.goal_weight_kg} kg`} /> : null}
                {client.subscription_start_date ? <InfoRow label="Alumno desde" value={formatDate(client.subscription_start_date)} last /> : null}
              </Section>
            ) : null}

            {activeProgram ? (
              <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                <View style={styles.statTitleRow}><Dumbbell size={15} color={theme.primary} />
                  <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Programa activo</Text>
                </View>
                <Text style={[styles.statBig, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{activeProgram.name}</Text>
                <Text style={[styles.statSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{activeProgram.planCount} plan{activeProgram.planCount !== 1 ? 'es' : ''}</Text>
              </View>
            ) : null}

            <Button label="Mensaje por WhatsApp" variant="outline" leftIcon={MessageCircle} onPress={openWhatsApp} full />
            <Button label={client.is_archived ? 'Reactivar alumno' : 'Archivar alumno'} variant={client.is_archived ? 'outline' : 'ghost'}
              leftIcon={client.is_archived ? ArchiveRestore : Archive} onPress={confirmArchive} full />
          </>
        ) : null}

        {tab === 'progreso' ? (
          <>
            {weights.length >= 2 ? (
              <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                <View style={styles.statTitleRow}><Activity size={15} color={theme.primary} />
                  <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Peso (últimos check-ins)</Text>
                </View>
                <Sparkline values={weights} />
                <Text style={[styles.statSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{weights[weights.length - 1]} kg actual · {weights[0]} kg inicial</Text>
              </View>
            ) : null}
            {checkIns.length > 0 ? (
              <Section title="Historial de check-ins">
                {checkIns.map((c, i) => (
                  <InfoRow key={`${c.date}-${i}`} label={formatDate(c.date)}
                    value={[c.weight != null ? `${c.weight} kg` : null, c.energy_level != null ? `Energía ${c.energy_level}/10` : null].filter(Boolean).join(' · ') || '—'}
                    last={i === checkIns.length - 1} />
                ))}
              </Section>
            ) : (
              <EmptyState icon={Activity} title="Sin check-ins" subtitle="Este alumno aún no registra check-ins." />
            )}
          </>
        ) : null}

        {tab === 'pagos' ? (
          <>
            <Button label="Registrar pago" leftIcon={CreditCard} onPress={() => setPayOpen(true)} full />
            {payments.length > 0 ? (
              <Section title="Historial de pagos">
                {payments.map((p, i) => (
                  <InfoRow key={p.id} label={`${formatDate(p.payment_date)}${p.service_description ? ` · ${p.service_description}` : ''}`}
                    value={formatCurrency(p.amount)} last={i === payments.length - 1} />
                ))}
              </Section>
            ) : (
              <EmptyState icon={CreditCard} title="Sin pagos" subtitle="Aún no hay pagos registrados." />
            )}
          </>
        ) : null}
      </ScrollView>

      <NativeDialog open={payOpen} title="Registrar pago" onClose={() => setPayOpen(false)}>
        <PaymentForm clientId={client.id} onDone={() => { setPayOpen(false); load() }} onCancel={() => setPayOpen(false)} />
      </NativeDialog>

      <NativeDialog open={editOpen} title="Editar alumno" onClose={() => setEditOpen(false)}>
        <EditClientForm client={client} onDone={() => { setEditOpen(false); load() }} onCancel={() => setEditOpen(false)} />
      </NativeDialog>
    </SafeAreaView>
  )
}

function ActionTile({ icon: Icon, label, onPress, theme }: { icon: typeof Dumbbell; label: string; onPress: () => void; theme: any }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}
      style={[styles.actionTile, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Icon size={20} color={theme.primary} strokeWidth={2.1} />
      <Text style={[styles.actionLabel, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  )
}

function Field({ label, value, onChangeText, theme, ...rest }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: theme.mutedForeground, fontFamily: theme.fontSans }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholderTextColor={theme.mutedForeground}
        style={{ height: 46, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, backgroundColor: theme.secondary, color: theme.foreground, paddingHorizontal: 12, fontFamily: theme.fontSans }} {...rest} />
    </View>
  )
}

function PaymentForm({ clientId, onDone, onCancel }: { clientId: string; onDone: () => void; onCancel: () => void }) {
  const { theme } = useTheme()
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [periodMonths, setPeriodMonths] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const amt = Math.round(Number(String(amount).replace(/\s/g, '')))
    if (!Number.isFinite(amt) || amt <= 0) { setError('Indica un monto válido.'); return }
    if (!description.trim()) { setError('Indica un concepto.'); return }
    const pm = periodMonths.trim() ? Number(periodMonths) : null
    setSaving(true)
    try {
      await apiFetch<{ ok: true }>('/api/mobile/coach/payments', {
        method: 'POST', authenticated: true,
        body: { clientId, amount: amt, paymentDate, serviceDescription: description.trim(), periodMonths: pm },
      })
      onDone()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo registrar el pago.')
      setSaving(false)
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Field label="Monto (CLP)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="30000" theme={theme} />
      <Field label="Fecha" value={paymentDate} onChangeText={setPaymentDate} placeholder="2026-06-02" theme={theme} />
      <Field label="Concepto" value={description} onChangeText={setDescription} placeholder="Mensualidad" theme={theme} />
      <Field label="Período (meses, opcional)" value={periodMonths} onChangeText={setPeriodMonths} keyboardType="number-pad" placeholder="1" theme={theme} />
      {error ? <Text style={{ color: theme.destructive, fontSize: 13 }}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={saving ? 'Guardando...' : 'Registrar'} onPress={submit} disabled={saving} style={{ flex: 1 }} />
      </View>
    </View>
  )
}

function EditClientForm({ client, onDone, onCancel }: { client: CoachClientDetail; onDone: () => void; onCancel: () => void }) {
  const { theme } = useTheme()
  const [fullName, setFullName] = useState(client.full_name)
  const [phone, setPhone] = useState(client.phone ?? '')
  const [goalWeight, setGoalWeight] = useState(client.goal_weight_kg != null ? String(client.goal_weight_kg) : '')
  const [startDate, setStartDate] = useState(client.subscription_start_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (fullName.trim().length < 2) { setError('Indica el nombre.'); return }
    setSaving(true)
    const r = await updateCoachClient(client.id, {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      goal_weight_kg: goalWeight.trim() ? Number(goalWeight) : null,
      subscription_start_date: startDate.trim() || null,
    })
    setSaving(false)
    if (!r.ok) setError(r.error ?? 'No se pudo guardar.')
    else onDone()
  }

  return (
    <View style={{ gap: 12 }}>
      <Field label="Nombre" value={fullName} onChangeText={setFullName} theme={theme} />
      <Field label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+56 9 ..." theme={theme} />
      <Field label="Peso objetivo (kg)" value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" placeholder="75" theme={theme} />
      <Field label="Alumno desde" value={startDate} onChangeText={setStartDate} placeholder="2026-01-15" theme={theme} />
      {error ? <Text style={{ color: theme.destructive, fontSize: 13 }}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={saving ? 'Guardando...' : 'Guardar'} onPress={submit} disabled={saving} style={{ flex: 1 }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 48, gap: 14 },
  heroCard: { padding: 22, borderWidth: 1, alignItems: 'center', gap: 8 },
  heroAvatar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  heroName: { fontSize: 19, letterSpacing: -0.3, marginTop: 4 },
  heroEmail: { fontSize: 13 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionTile: { width: '47%', flexGrow: 1, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionLabel: { fontSize: 13, flexShrink: 1 },
  statCard: { padding: 18, borderWidth: 1, gap: 8 },
  statTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  statBig: { fontSize: 17, letterSpacing: -0.2 },
  statSub: { fontSize: 13 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
})
