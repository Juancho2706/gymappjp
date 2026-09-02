import { useCallback, useState } from 'react'
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Check, ChevronLeft, Inbox, Mail, MessageCircle, UserPlus, X } from 'lucide-react-native'
import { AppBackground } from '../../components/AppBackground'
import { Button, EmptyState, ErrorState, Skeleton } from '../../components'
import { toast } from '../../components/Toast'
import { useTheme } from '../../context/ThemeContext'
import {
  countNewLeads,
  formatLeadDate,
  getCoachLeads,
  leadFirstName,
  leadSourceLabel,
  leadWhatsAppUrl,
  setCoachLeadStatus,
  setPendingLeadConversion,
  type CoachLead,
} from '../../lib/leads'

/**
 * `/coach/leads` — bandeja «Solicitudes» del coach (coach-leads W3.2).
 *
 * Es el espejo RN de la seccion que la web pinta en `/coach/clients?solicitudes=1`, y el destino
 * del deep link de la push `lead_received` (`data.screen`). Pantalla APILADA (fuera de `(tabs)`),
 * igual que `program-builder`: se entra desde el chip del tab «Alumnos» y se vuelve con el back.
 *
 * Quien llega aca NO es un alumno todavia: dejo su nombre y su WhatsApp en `/join/<codigo>` y el
 * coach decide. Por eso las tres acciones son «lo contacte», «lo convierto en alumno» y «no me
 * interesa» — y descartar NO borra la fila (queda el rastro del consentimiento, Ley 21.719).
 *
 * La pantalla no autoriza nada: cada accion es un PATCH que el servidor valida contra la RLS de
 * `coach_leads`. Aca solo se pinta y se refleja la respuesta.
 */
export default function CoachLeadsScreen() {
  const router = useRouter()
  const { theme } = useTheme()

  const [leads, setLeads] = useState<CoachLead[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  /** Id del lead con una accion en vuelo: bloquea SOLO esa tarjeta, no la pantalla entera. */
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLeads(null)
      setFailed(false)
    }
    try {
      const rows = await getCoachLeads()
      setLeads(rows)
      setFailed(false)
    } catch {
      // Error DE VERDAD (red/servidor): jamas disfrazarlo de «no hay solicitudes».
      setFailed(true)
      setLeads(null)
    }
  }, [])

  // Al volver del alta (o de background) la bandeja se re-lee: el lead recien convertido tiene que
  // desaparecer solo, sin que el coach tenga que tirar de la lista.
  useFocusEffect(
    useCallback(() => {
      void load(true)
    }, [load]),
  )

  async function onRefresh() {
    setRefreshing(true)
    await load(true)
    setRefreshing(false)
  }

  /** Saca la solicitud de la bandeja abierta (convertida/descartada) o refleja el estado nuevo. */
  function applyResult(updated: CoachLead) {
    setLeads((prev) => {
      if (!prev) return prev
      if (updated.status === 'converted' || updated.status === 'dismissed') {
        return prev.filter((lead) => lead.id !== updated.id)
      }
      return prev.map((lead) => (lead.id === updated.id ? updated : lead))
    })
  }

  async function move(lead: CoachLead, status: 'contacted' | 'converted' | 'dismissed', done: string) {
    if (busyId) return
    setBusyId(lead.id)
    try {
      applyResult(await setCoachLeadStatus(lead.id, status))
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No pudimos actualizar la solicitud.')
      // El estado local pudo quedar desalineado con el servidor: la verdad la tiene el.
      void load(true)
    } finally {
      setBusyId(null)
    }
  }

  function confirmDismiss(lead: CoachLead) {
    Alert.alert(
      'Descartar solicitud',
      `${lead.fullName} sale de tu bandeja. No se le avisa nada y puedes seguir escribiendole por tu cuenta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => void move(lead, 'dismissed', 'Solicitud descartada'),
        },
      ],
    )
  }

  /**
   * Convertir = dar de alta al alumno. Ese flujo (muro de cupo, clave temporal, mensaje de
   * bienvenida) vive completo en el tab «Alumnos»: aca se deja la solicitud en el handoff y se
   * navega. La solicitud se marca `converted` recien cuando el alta se completa de verdad — si el
   * coach se arrepiente a mitad de camino, sigue en su bandeja.
   */
  function convert(lead: CoachLead) {
    setPendingLeadConversion({
      leadId: lead.id,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
    })
    // MISMA forma de ruta que usa el paso 4 de la guía (`RN.invite` en `@eva/onboarding`):
    // `/coach/(tabs)/clientes?…`, con el segmento del grupo explícito.
    router.push('/coach/(tabs)/clientes?lead=1')
  }

  async function openWhatsApp(lead: CoachLead) {
    const url = leadWhatsAppUrl(lead.phone)
    if (!url) return
    try {
      await Linking.openURL(url)
    } catch {
      toast.error('No pudimos abrir WhatsApp.')
    }
  }

  async function openEmail(lead: CoachLead) {
    if (!lead.email) return
    try {
      await Linking.openURL(`mailto:${lead.email}`)
    } catch {
      toast.error('No pudimos abrir tu correo.')
    }
  }

  const pending = leads == null && !failed
  const newCount = leads ? countNewLeads(leads) : 0

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Button
            testID="leads-back"
            accessibilityLabel="Volver a Alumnos"
            label="Alumnos"
            variant="ghost"
            size="sm"
            leftIcon={ChevronLeft}
            onPress={() => router.back()}
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        >
          <View style={{ paddingTop: 8, paddingBottom: 16 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.5 }}>
              Solicitudes
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 19 }}>
              {newCount > 0
                ? `${newCount} ${newCount === 1 ? 'persona nueva quiere' : 'personas nuevas quieren'} entrenar contigo. Escribeles y decide a quien sumas.`
                : 'Quien abre tu link de invitacion te deja una solicitud. Tu decides a quien sumas como alumno.'}
            </Text>
          </View>

          {pending ? (
            <View style={{ gap: 12 }} accessibilityLabel="Cargando solicitudes">
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  className="border border-subtle"
                  style={{ padding: 16, gap: 10, backgroundColor: theme.card, borderRadius: theme.radius.card }}
                >
                  <Skeleton width="55%" height={16} />
                  <Skeleton width="35%" height={12} />
                  <Skeleton width="100%" height={36} />
                </View>
              ))}
            </View>
          ) : failed ? (
            <View style={{ flex: 1, minHeight: 320 }}>
              <ErrorState
                title="No pudimos cargar tus solicitudes"
                subtitle="Revisa tu conexion e intenta de nuevo."
                onRetry={() => void load()}
              />
            </View>
          ) : leads && leads.length === 0 ? (
            <View style={{ flex: 1, minHeight: 320 }}>
              <EmptyState
                icon={Inbox}
                title="Sin solicitudes por ahora"
                subtitle="Comparte tu link de invitacion: quien lo abra te va a dejar su nombre y su WhatsApp aca."
              />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {(leads ?? []).map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  busy={busyId === lead.id}
                  disabled={busyId != null && busyId !== lead.id}
                  onWhatsApp={() => void openWhatsApp(lead)}
                  onEmail={() => void openEmail(lead)}
                  onContacted={() => void move(lead, 'contacted', 'Marcada como contactada')}
                  onConvert={() => convert(lead)}
                  onDismiss={() => confirmDismiss(lead)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

function LeadCard({
  lead,
  busy,
  disabled,
  onWhatsApp,
  onEmail,
  onContacted,
  onConvert,
  onDismiss,
}: {
  lead: CoachLead
  busy: boolean
  disabled: boolean
  onWhatsApp: () => void
  onEmail: () => void
  onContacted: () => void
  onConvert: () => void
  onDismiss: () => void
}) {
  const { theme } = useTheme()
  const source = leadSourceLabel(lead)
  const when = formatLeadDate(lead.createdAt)
  const canWhatsApp = leadWhatsAppUrl(lead.phone) != null

  return (
    <View
      className="border border-subtle"
      style={{ backgroundColor: theme.card, borderRadius: theme.radius.card, padding: 16, gap: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            className="font-display-black text-strong"
            style={{ fontSize: 17, letterSpacing: -0.3 }}
          >
            {lead.fullName}
          </Text>
          <Text className="font-sans text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {when}
            {lead.status === 'contacted' ? ' · Ya la contactaste' : ''}
          </Text>
        </View>
        {lead.status === 'new' ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: theme.primary + '1F',
            }}
          >
            <Text className="font-sans-bold" style={{ fontSize: 11, color: theme.primary }}>
              Nueva
            </Text>
          </View>
        ) : null}
      </View>

      {source ? (
        <Text className="font-sans text-subtle" style={{ fontSize: 12.5 }}>
          {source}
        </Text>
      ) : null}

      {lead.message ? (
        <Text className="font-sans text-body" style={{ fontSize: 13.5, lineHeight: 19 }}>
          {lead.message}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {canWhatsApp ? (
          <Button
            label="WhatsApp"
            variant="primary"
            size="sm"
            leftIcon={MessageCircle}
            disabled={disabled}
            onPress={onWhatsApp}
          />
        ) : null}
        {lead.email ? (
          <Button
            label="Correo"
            variant="outline"
            size="sm"
            leftIcon={Mail}
            disabled={disabled}
            onPress={onEmail}
          />
        ) : null}
      </View>

      <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 2 }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {lead.status === 'new' ? (
          <Button
            label="Marcar contactado"
            variant="secondary"
            size="sm"
            leftIcon={Check}
            loading={busy}
            disabled={disabled}
            onPress={onContacted}
          />
        ) : null}
        <Button
          label={`Sumar a ${leadFirstName(lead.fullName)}`}
          variant="secondary"
          size="sm"
          leftIcon={UserPlus}
          disabled={disabled || busy}
          onPress={onConvert}
        />
        <Button
          label="Descartar"
          variant="ghost"
          size="sm"
          leftIcon={X}
          disabled={disabled || busy}
          onPress={onDismiss}
        />
      </View>
    </View>
  )
}
