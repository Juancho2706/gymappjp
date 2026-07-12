import { useState } from 'react'
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CheckCircle2, Eye, EyeOff, Lock, MessageCircle, UserPlus, X } from 'lucide-react-native'
import { CreateClientSchema } from '@eva/schemas'
import { Button, Input } from '../../../components'
import { FONT } from '../../../lib/typography'
import { apiFetch } from '../../../lib/api'
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
  temp_password?: string[]
  age_confirmed?: string[]
}

type SuccessInfo = { clientName: string; phone: string; loginUrl: string | null }

type CreateClientResponse = { ok: true; clientName: string; newClientPhone: string | null; loginUrl: string | null }

/**
 * CreateClientModal — bottom-sheet "Agregar Nuevo Alumno" (POST /api/mobile/coach/clients).
 * Espejo web `apps/web/src/app/coach/clients/CreateClientModal.tsx`: 3 estados excluyentes
 * en el mismo sheet: (A) formulario · (B) éxito + CTA WhatsApp (si el alumno trae teléfono) ·
 * (C) upgrade requerido (endpoint 402 UPGRADE_REQUIRED). Modal RN nativo (sin @gorhom → sin
 * bomba -999). Los inputs usan el `Input` DS (borde de foco por style, sin re-clasificar el
 * subárbol → sin focus-hop Fabric 45798).
 */
export function CreateClientModal({
  visible,
  onClose,
  onCreated,
  theme,
  maxClients,
}: {
  visible: boolean
  onClose: () => void
  onCreated: () => void
  theme: any
  /** Cupo del plan; espeja `currentLimit` del 402 para el título del gate de upgrade. */
  maxClients?: number
}) {
  const router = useRouter()
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

  async function handleSubmit() {
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
    } catch (e: any) {
      if (e?.code === 'UPGRADE_REQUIRED') {
        setUpgradeLimit(typeof maxClients === 'number' ? maxClients : undefined)
        setPhase('upgrade')
      } else {
        setError(e?.message ?? 'No se pudo crear el alumno.')
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.overlay} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
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
              <TouchableOpacity testID="create-client-whatsapp" activeOpacity={0.85} onPress={sendWhatsApp} style={styles.waButton}>
                <MessageCircle size={20} color="#fff" />
                <Text style={styles.waLabel}>Enviar link por WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="create-client-skip" onPress={handleClose} hitSlop={8}>
                <Text style={[styles.stateLink, { color: theme.mutedForeground }]}>Omitir por ahora</Text>
              </TouchableOpacity>
              <View style={{ height: 12 }} />
            </View>
          ) : phase === 'upgrade' ? (
            // ─── (C) Upgrade requerido ────────────────────────────────────────────
            <View style={styles.stateWrap}>
              <View style={[styles.stateCircle, { backgroundColor: WARNING + '26' }]}>
                <Lock size={32} color={WARNING} />
              </View>
              <Text style={[styles.stateTitle, { color: theme.foreground }]}>
                {upgradeLimit != null ? `Límite de ${upgradeLimit} alumnos alcanzado` : 'Límite de alumnos alcanzado'}
              </Text>
              <Text style={[styles.stateBody, { color: theme.mutedForeground }]}>
                Haz upgrade para seguir creciendo. Tus alumnos actuales no se ven afectados.
              </Text>
              <Button
                testID="create-client-upgrade"
                label="Ver planes →"
                variant="sport"
                size="lg"
                full
                onPress={() => { handleClose(); router.push('/coach/subscription') }}
              />
              <TouchableOpacity testID="create-client-upgrade-dismiss" onPress={handleClose} hitSlop={8}>
                <Text style={[styles.stateLink, { color: theme.mutedForeground }]}>Ahora no</Text>
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
                <TouchableOpacity testID="create-client-close" onPress={handleClose} hitSlop={8}>
                  <X size={20} color={theme.mutedForeground} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={{ gap: 12, paddingBottom: 4 }}>
                  {error && (
                    <View style={[styles.errorBox, { backgroundColor: DANGER + '18', borderColor: DANGER + '40' }]}>
                      <Text style={[styles.errorText, { color: DANGER }]}>{error}</Text>
                    </View>
                  )}

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
                    autoCapitalize="none"
                    autoCorrect={false}
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
                    activeOpacity={0.82}
                    onPress={() => setForm((f) => ({ ...f, ageConfirmed: !f.ageConfirmed }))}
                    style={styles.checkboxRow}
                  >
                    <View style={[styles.checkbox, { borderColor: form.ageConfirmed ? SUCCESS : theme.border, backgroundColor: form.ageConfirmed ? SUCCESS : 'transparent' }]}>
                      {form.ageConfirmed ? <CheckCircle2 size={14} color="#fff" /> : null}
                    </View>
                    <Text style={[styles.checkboxLabel, { color: theme.mutedForeground }]}>
                      Confirmo que el alumno tiene 14 años o más, o que cuento con el consentimiento de su tutor legal (Ley 21.719).
                    </Text>
                  </TouchableOpacity>
                  {fieldErrors.age_confirmed?.[0] ? (
                    <Text style={[styles.fieldError, { color: theme.destructive }]}>{fieldErrors.age_confirmed[0]}</Text>
                  ) : null}
                </View>
              </ScrollView>

              <View style={styles.footer}>
                <Button
                  testID="create-client-cancel"
                  label="Cancelar"
                  variant="secondary"
                  size="lg"
                  onPress={handleClose}
                  disabled={loading}
                  style={{ flex: 1 }}
                />
                <Button
                  testID="create-client-submit"
                  label={loading ? 'Creando alumno...' : 'Crear Alumno'}
                  variant="sport"
                  size="lg"
                  leftIcon={UserPlus}
                  loading={loading}
                  disabled={loading}
                  onPress={handleSubmit}
                  style={{ flex: 1 }}
                />
              </View>
              <View style={{ height: 12 }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: FONT.displayBold },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 4, fontFamily: FONT.ui },
  errorBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  errorText: { fontSize: 13, fontFamily: FONT.uiSemibold },
  fieldError: { fontSize: 12, fontFamily: FONT.uiSemibold, marginTop: -6 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 2 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: FONT.ui },
  footer: { flexDirection: 'row', gap: 10, marginTop: 4 },
  // Estados B/C (éxito / upgrade)
  stateWrap: { alignItems: 'center', gap: 16, paddingVertical: 12, paddingHorizontal: 4 },
  stateCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 18, fontFamily: FONT.displayBold, textAlign: 'center' },
  stateBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: FONT.ui },
  stateLink: { fontSize: 14, fontFamily: FONT.uiSemibold },
  waButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 14, width: '100%',
  },
  waLabel: { color: '#fff', fontSize: 14, fontFamily: FONT.uiBold },
})
