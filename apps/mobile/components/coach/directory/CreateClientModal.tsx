import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CheckCircle2, Eye, EyeOff, Lock, MessageCircle, UserPlus, X } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { CreateClientSchema } from '@eva/schemas'
import { studentCountLabel, type SubscriptionTier } from '@eva/tiers'
import { Input } from '../../../components'
import { RefreshPlanButton } from '../RefreshPlanButton'
import { FONT } from '../../../lib/typography'
import { ApiError, apiFetch } from '../../../lib/api'
import { captureAppEvent } from '../../../lib/analytics'
import type { Theme } from '../../../lib/theme'
import { DANGER, SUCCESS, WARNING } from './directory-shared'

interface CreateForm {
  fullName: string
  email: string
  phone: string
  subscriptionStartDate: string
  tempPassword: string
  ageConfirmed: boolean
}

const EMPTY: CreateForm = { fullName: '', email: '', phone: '', subscriptionStartDate: '', tempPassword: '', ageConfirmed: false }

type FieldErrors = {
  full_name?: string[]
  email?: string[]
  subscription_start_date?: string[]
  temp_password?: string[]
  age_confirmed?: string[]
}

type SuccessInfo = { clientName: string; phone: string; loginUrl: string | null }

type CreateWorkspace = {
  kind: 'standalone' | 'team_owner' | 'team_member' | 'enterprise'
  teamId: string | null
  orgId: string | null
}

type CreateClientResponse = { ok: true; clientName: string; newClientPhone: string | null; loginUrl: string | null }

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function ModalButton({
  label,
  onPress,
  theme,
  variant,
  loading = false,
  disabled = false,
  leftIcon: LeftIcon,
  style,
  testID,
}: {
  label: string
  onPress: () => void
  theme: Theme
  variant: 'secondary' | 'sport'
  loading?: boolean
  disabled?: boolean
  leftIcon?: LucideIcon
  style?: ViewStyle
  testID?: string
}) {
  const blocked = disabled || loading
  const foreground = variant === 'sport' ? theme.primaryForeground : theme.mutedForeground

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      activeOpacity={0.82}
      disabled={blocked}
      onPress={onPress}
      className={variant === 'sport' ? 'bg-cta-fill' : 'bg-surface-card'}
      style={[
        styles.modalButton,
        variant === 'secondary' ? { borderColor: theme.borderDefault, borderWidth: 1 } : null,
        blocked ? styles.modalButtonDisabled : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : LeftIcon ? <LeftIcon size={16} color={foreground} /> : null}
      <Text style={[styles.modalButtonLabel, { color: foreground }]}>{label}</Text>
    </TouchableOpacity>
  )
}

/**
 * CreateClientModal — bottom-sheet "Agregar Nuevo Alumno" (POST /api/mobile/coach/clients).
 * Espejo web `apps/web/src/app/coach/clients/CreateClientModal.tsx`: 3 estados excluyentes
 * en el mismo sheet: (A) formulario · (B) éxito + CTA WhatsApp (si el alumno trae teléfono) ·
 * (C) límite de alumnos del plan alcanzado (endpoint 402 UPGRADE_REQUIRED) — muro de ESTADO
 * + "Actualizar estado", sin link-out a la página de pago (anti-steering Apple 3.1.1 /
 * política de pagos de Google, ver `docs/research/cta-pagos-externos-stores-2026-07-31.md`).
 * Modal RN nativo (sin @gorhom → sin
 * bomba -999). Los inputs usan el `Input` DS (borde de foco por style, sin re-clasificar el
 * subárbol → sin focus-hop Fabric 45798).
 */
export function CreateClientModal({
  visible,
  onClose,
  onCreated,
  theme,
  maxClients,
  currentTier,
  activeCount,
  workspace,
}: {
  visible: boolean
  onClose: () => void
  onCreated: () => void
  theme: any
  /** Cupo del plan; espeja `currentLimit` del 402 para el título del muro de límite. */
  maxClients?: number
  /**
   * Contexto del gate para `upgrade_gate_hit` (sin PII). `apiFetch` conserva mensaje y `code` del
   * 402 pero descarta los campos extra del cuerpo, así que el tier y el conteo tienen que bajar
   * por props desde la pantalla que ya los tiene cargados.
   */
  currentTier?: SubscriptionTier | null
  activeCount?: number
  workspace: CreateWorkspace
}) {
  const insets = useSafeAreaInsets()
  const [form, setForm] = useState<CreateForm>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showPw, setShowPw] = useState(true)
  const [phase, setPhase] = useState<'form' | 'success' | 'upgrade'>('form')
  const [success, setSuccess] = useState<SuccessInfo | null>(null)
  const [upgradeLimit, setUpgradeLimit] = useState<number | undefined>(undefined)

  function handleClose() {
    setForm(EMPTY)
    setError(null)
    setFieldErrors({})
    setShowPw(true)
    setPhase('form')
    setSuccess(null)
    setUpgradeLimit(undefined)
    onClose()
  }

  function requestClose() {
    if (!loading) handleClose()
  }

  async function handleSubmit() {
    setError(null)
    const startDate = form.subscriptionStartDate.trim()
    if (startDate && !isValidIsoDate(startDate)) {
      setFieldErrors({ subscription_start_date: ['Ingresa una fecha válida.'] })
      return
    }
    const parsed = CreateClientSchema.safeParse({
      full_name: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      subscription_start_date: form.subscriptionStartDate.trim(),
      temp_password: form.tempPassword,
      age_confirmed: form.ageConfirmed ? 'on' : '',
    })
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as FieldErrors)
      return
    }
    setFieldErrors({})
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<CreateClientResponse>('/api/mobile/coach/clients', {
        method: 'POST',
        authenticated: true,
        body: {
          fullName: parsed.data.full_name,
          email: parsed.data.email.toLowerCase(),
          phone: parsed.data.phone?.trim() || undefined,
          subscriptionStartDate: parsed.data.subscription_start_date?.trim() || undefined,
          tempPassword: parsed.data.temp_password,
          ageConfirmed: true,
          workspace,
        },
      })
      // Alumno creado: refrescar la cartera por debajo.
      onCreated()
      if (res.newClientPhone) {
        setSuccess({ clientName: res.clientName, phone: res.newClientPhone, loginUrl: res.loginUrl })
        setPhase('success')
      } else {
        handleClose()
      }
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'UPGRADE_REQUIRED') {
        // `apiFetch` conserva el mensaje/codigo del endpoint pero no campos extra.
        // El endpoint incluye el cupo en ambos; el prop sigue teniendo prioridad.
        const limitFromMessage = Number(e.message.match(/\d+/)?.[0])
        const resolvedLimit = typeof maxClients === 'number' && maxClients > 0 ? maxClients : Number.isFinite(limitFromMessage) ? limitFromMessage : undefined
        setUpgradeLimit(resolvedLimit)
        // Espejo del web: hasta Pricing v3 el muro de cupo NO emitia ningun evento, asi que el
        // embudo del upgrade arrancaba DESPUES del rechazo. Se dispara una vez por 402 (este catch
        // corre una vez por submit rechazado). Sin PII: gate, tier, cupo y conteo.
        captureAppEvent('upgrade_gate_hit', {
          gate: 'client_limit',
          current_tier: currentTier ?? null,
          current_limit: resolvedLimit ?? null,
          active: typeof activeCount === 'number' ? activeCount : null,
        })
        setPhase('upgrade')
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo crear el alumno.')
      }
    } finally {
      setLoading(false)
    }
  }

  function sendWhatsApp() {
    if (!success) return
    const digits = success.phone.replace(/\D/g, '')
    const message = `Hola ${success.clientName}! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: ${success.loginUrl}`
    Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`).catch(() => {})
    handleClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable className="bg-black/60" style={styles.overlay} onPress={requestClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          {phase === 'success' && success ? (
            // ─── (B) Éxito + CTA WhatsApp ─────────────────────────────────────────
            <View style={styles.stateWrap}>
              <View style={[styles.stateCircle, { backgroundColor: SUCCESS + '26' }]}>
                <CheckCircle2 size={32} color={SUCCESS} />
              </View>
              <Text style={[styles.stateTitle, { color: theme.foreground }]}>¡Alumno creado!</Text>
              <Text style={[styles.stateBody, { color: theme.mutedForeground }]}>
                Envía el link de acceso a{' '}
                <Text style={{ color: theme.foreground, fontFamily: FONT.uiSemibold }}>{success.clientName}</Text>{' '}
                por WhatsApp.
              </Text>
              <TouchableOpacity
                testID="create-client-whatsapp"
                accessibilityRole="link"
                accessibilityLabel="Enviar link por WhatsApp"
                activeOpacity={0.85}
                onPress={sendWhatsApp}
                style={styles.waButton}
              >
                <MessageCircle size={20} color={theme.primaryForeground} />
                <Text style={[styles.waLabel, { color: theme.primaryForeground }]}>Enviar link por WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="create-client-skip" onPress={handleClose} hitSlop={8}>
                <Text style={[styles.stateLink, { color: theme.mutedForeground }]}>Omitir por ahora</Text>
              </TouchableOpacity>
              <View style={{ height: 12 }} />
            </View>
          ) : phase === 'upgrade' ? (
            // ─── (C) Límite de alumnos del plan ───────────────────────────────────
            <View testID="create-client-limit" style={styles.stateWrap}>
              <View style={[styles.stateCircle, { backgroundColor: WARNING + '26' }]}>
                <Lock size={32} color={WARNING} />
              </View>
              <Text style={[styles.stateTitle, { color: theme.foreground }]}>
                {/* Pricing v3: con free = 1 el interpolado a mano decía «1 alumnos». El plural sale
                    del catálogo compartido (studentCountLabel), nunca de concatenar la 's'. */}
                {upgradeLimit != null
                  ? `Alcanzaste el límite de ${studentCountLabel(upgradeLimit)} de tu plan.`
                  : 'Alcanzaste el límite de alumnos de tu plan.'}
              </Text>
              <Text style={[styles.stateBody, { color: theme.mutedForeground }]}>
                Tus alumnos actuales no se ven afectados.
              </Text>
              <RefreshPlanButton full />
              <TouchableOpacity testID="create-client-limit-dismiss" onPress={handleClose} hitSlop={8}>
                <Text style={[styles.stateLink, { color: theme.mutedForeground }]}>Cerrar</Text>
              </TouchableOpacity>
              <View style={{ height: 12 }} />
            </View>
          ) : (
            // ─── (A) Formulario ───────────────────────────────────────────────────
            <>
              <View style={styles.header}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.title, { color: theme.foreground }]}>Agregar Nuevo Alumno</Text>
                  <Text style={[styles.subtitle, { color: theme.mutedForeground }]}>
                    Se creará una cuenta con contraseña temporal. El alumno deberá cambiarla en su primer ingreso.
                  </Text>
                </View>
                <TouchableOpacity
                  testID="create-client-close"
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  accessibilityState={{ disabled: loading }}
                  disabled={loading}
                  onPress={requestClose}
                  hitSlop={8}
                >
                  <X size={20} color={theme.mutedForeground} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.formFields}>
                  <Input
                    testID="create-client-fullName"
                    label="Nombre completo"
                    value={form.fullName}
                    onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))}
                    placeholder="Juan González"
                    autoCapitalize="words"
                    autoCorrect={false}
                    error={fieldErrors.full_name?.[0]}
                  />
                  <Input
                    testID="create-client-email"
                    label="Email del alumno"
                    value={form.email}
                    onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                    placeholder="alumno@ejemplo.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    error={fieldErrors.email?.[0]}
                  />
                  <Input
                    testID="create-client-phone"
                    label="Teléfono (WhatsApp)"
                    value={form.phone}
                    onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                    placeholder="+56xxxxxxxxx"
                    keyboardType="phone-pad"
                    autoCorrect={false}
                  />
                  <Input
                    testID="create-client-startDate"
                    label="Inicio de mensualidad"
                    value={form.subscriptionStartDate}
                    onChangeText={(v) => setForm((f) => ({ ...f, subscriptionStartDate: v }))}
                    placeholder="AAAA-MM-DD"
                    maxLength={10}
                    autoCapitalize="none"
                    autoCorrect={false}
                    error={fieldErrors.subscription_start_date?.[0]}
                  />
                  <Input
                    testID="create-client-tempPassword"
                    label="Contraseña temporal"
                    value={form.tempPassword}
                    onChangeText={(v) => setForm((f) => ({ ...f, tempPassword: v }))}
                    placeholder="Mín. 8 caracteres"
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    autoCorrect={false}
                    rightIcon={showPw ? EyeOff : Eye}
                    onRightIconPress={() => setShowPw((v) => !v)}
                    rightIconLabel={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    hint="Comparte esta clave con tu alumno. Se le pedirá cambiarla al entrar."
                    error={fieldErrors.temp_password?.[0]}
                  />

                  {/* Confirmación de edad — Ley 21.719 */}
                  <TouchableOpacity
                    testID="create-client-age"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: form.ageConfirmed }}
                    accessibilityLabel="Confirmo que el alumno tiene 14 años o más o que cuento con consentimiento de su tutor legal"
                    activeOpacity={0.82}
                    onPress={() => setForm((f) => ({ ...f, ageConfirmed: !f.ageConfirmed }))}
                    style={styles.checkboxRow}
                  >
                    <View style={[styles.checkbox, { borderColor: form.ageConfirmed ? SUCCESS : theme.border, backgroundColor: form.ageConfirmed ? SUCCESS : 'transparent' }]}>
                      {form.ageConfirmed ? <CheckCircle2 size={14} color={theme.primaryForeground} /> : null}
                    </View>
                    <Text style={[styles.checkboxLabel, { color: theme.mutedForeground }]}>
                      Confirmo que el alumno tiene 14 años o más, o que cuento con el consentimiento de su tutor legal (Ley 21.719).
                    </Text>
                  </TouchableOpacity>
                  {fieldErrors.age_confirmed?.[0] ? (
                    <Text style={[styles.fieldError, { color: theme.destructive }]}>{fieldErrors.age_confirmed[0]}</Text>
                  ) : null}

                  {error ? (
                    <View style={[styles.errorBox, { backgroundColor: DANGER + '18', borderColor: DANGER + '40' }]}>
                      <Text style={[styles.errorText, { color: DANGER }]}>{error}</Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>

              <View style={styles.footer}>
                <ModalButton
                  testID="create-client-cancel"
                  label="Cancelar"
                  theme={theme}
                  variant="secondary"
                  onPress={handleClose}
                  disabled={loading}
                  style={{ flex: 1 }}
                />
                <ModalButton
                  testID="create-client-submit"
                  label={loading ? 'Creando alumno...' : 'Crear Alumno'}
                  theme={theme}
                  variant="sport"
                  leftIcon={UserPlus}
                  loading={loading}
                  disabled={loading}
                  onPress={handleSubmit}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    maxHeight: '92%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: FONT.displayBold },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 4, fontFamily: FONT.ui },
  errorBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  errorText: { fontSize: 13, fontFamily: FONT.uiSemibold },
  fieldError: { fontSize: 12, fontFamily: FONT.uiSemibold, marginTop: -6 },
  formScroll: { flexShrink: 1 },
  formFields: { gap: 16, paddingBottom: 4 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 2 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: FONT.ui },
  footer: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalButton: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalButtonDisabled: { opacity: 0.6 },
  modalButtonLabel: { fontSize: 14, fontFamily: FONT.uiBold },
  // Estados B/C (éxito / límite del plan)
  stateWrap: { alignItems: 'center', gap: 20, paddingVertical: 16, paddingHorizontal: 4 },
  stateCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 18, fontFamily: FONT.displayBold, textAlign: 'center' },
  stateBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: FONT.ui },
  stateLink: { fontSize: 14, fontFamily: FONT.uiSemibold },
  waButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 12, width: '100%',
  },
  waLabel: { fontSize: 14, fontFamily: FONT.uiBold },
})
