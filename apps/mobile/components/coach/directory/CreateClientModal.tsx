import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Archive, CheckCircle2, ChevronDown, ChevronRight, Eye, EyeOff, Lock, MessageCircle, UserPlus, X } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { CreateClientSchema, personaNoun, type Persona } from '@eva/schemas'
import { type SubscriptionTier } from '@eva/tiers'
import { Button, Input } from '../../../components'
import { toast } from '../../Toast'
import { RefreshPlanButton } from '../RefreshPlanButton'
import { ArchiveToFreeSpaceSheet } from './ArchiveToFreeSpaceSheet'
import { GuidedChannelPicker, GuidedLoginPreview, GuidedPreviewCopy, GuidedStepBar } from './GuidedInviteSteps'
import {
  generateGuidedTempPassword,
  guidedCapNote,
  guidedFormHint,
  guidedInvitePayload,
  guidedTitle,
  hasShareableLink,
  isCoachOwnEmail,
  isSubscriptionTier,
  nextGuidedStep,
  selfInviteNote,
  shouldEmitInviteSent,
  SELF_INVITE_BLOCKED_ES,
  type GuidedInviteChannel,
  type GuidedStep,
} from './guided-invite'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { ApiError, apiFetch } from '../../../lib/api'
import { shareLogin } from '../../../lib/client-actions'
import { capWallCopy, shouldOpenAtCapWall } from '../../../lib/client-cap'
import { postCoachOnboardingEvent, useCoachOnboarding } from '../../../lib/coach-dashboard'
import { getCachedCoachPersonaStatus } from '../../../lib/coach-persona'
import { showsEvaBadge } from '../../../lib/coach-tiers'
import { captureAppEvent } from '../../../lib/analytics'
import { supabase } from '../../../lib/supabase'
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

/**
 * Lo que el alta acaba de crear, tal como se lo va a contar al alumno. `email` y `tempPassword` se
 * congelan ACÁ, en el momento de la creación, y no se leen del formulario al mandar: `handleClose`
 * vacía el formulario y el mensaje se arma después de eso en más de un camino.
 */
type SuccessInfo = {
  clientName: string
  phone: string
  loginUrl: string | null
  email: string
  tempPassword: string
}

type CreateWorkspace = {
  kind: 'standalone' | 'team_owner' | 'team_member' | 'enterprise'
  teamId: string | null
  orgId: string | null
}

type CreateClientResponse = { ok: true; clientName: string; newClientPhone: string | null; loginUrl: string | null }

/**
 * Los 3 pasos del alta guiada mapeados a las fases del sheet: el orden lo decide `nextGuidedStep`
 * (puro, testeado en `tests/mobile/guided-invite.test.ts`) y acá solo se traduce a la fase que
 * pinta este modal. La fase `upgrade` no participa: el muro de cupo no es un paso del alta.
 */
const GUIDED_PHASE: Record<GuidedStep, 'form' | 'success' | 'preview'> = {
  1: 'form',
  2: 'success',
  3: 'preview',
}

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
 * (C) muro de cupo del plan — ESTADO + acciones REALES dentro del
 * producto: "Archivar un alumno" (libera cupo de verdad, reversible), "Actualizar estado" y
 * "Ver mi plan" (pantalla interna de estado, no una superficie de pago). Sin
 * link-out a la página de pago (anti-steering Apple 3.1.1 / política de pagos de Google, ver
 * `docs/research/cta-pagos-externos-stores-2026-07-31.md`); el único texto de tienda es el caption
 * de Android que sirve `capWallCopy` (`lib/client-cap.ts`), nunca visible en iOS.
 *
 * El muro tiene DOS bocas: el pre-check al abrir (`shouldOpenAtCapWall`, QA owner 22-08 — con el
 * cupo lleno el alta ni siquiera muestra el formulario) y el 402 `UPGRADE_REQUIRED` del server, que
 * sigue siendo la autorización y cubre el conteo local desactualizado. Las dos emiten el mismo
 * `upgrade_gate_hit`, distinguidas por `source`.
 *
 * Modal RN nativo (sin @gorhom → sin
 * bomba -999). Los inputs usan el `Input` DS (borde de foco por style, sin re-clasificar el
 * subárbol → sin focus-hop Fabric 45798).
 *
 * ── Modo GUIADO (`guided`, paso 4 de la guía del onboarding v2) ──
 * Con `guided` el mismo sheet se convierte en el alta de 3 pasos —datos mínimos → cómo le llega →
 * así la ve— espejo del `AddStudentStepper` de la web, y aparece una cuarta fase, `preview`. Es
 * envase, no un camino de escritura nuevo: escribe por el MISMO endpoint, choca contra el MISMO
 * muro de cupo y no persiste nada extra (el paso se tilda por la señal `realClients`). El copy y el
 * orden de los pasos viven en `guided-invite.ts` (puro, testeado); las piezas visuales, en
 * `GuidedInviteSteps.tsx`. Sin `guided`, el alta se comporta exactamente como siempre.
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
  openAtCapWall = false,
  guided = false,
}: {
  visible: boolean
  onClose: () => void
  onCreated: () => void
  theme: any
  /**
   * Alta GUIADA — el paso 4 de la guía del onboarding v2 («Invita a tu primer {alumno}»), que en
   * RN llega por `/coach/(tabs)/clientes?invite=1`. Espejo semántico del `AddStudentStepper` web:
   * los mismos 3 pasos (datos mínimos → cómo le llega → así la ve) montados ENCIMA de este modal,
   * que ya tiene el muro de cupo y el share nativo. `false` ⇒ el alta de siempre, sin un solo
   * cambio de comportamiento.
   *
   * No persiste NADA nuevo en el servidor: el paso 4 de la guía se tilda solo por la señal
   * `realClients` que ya computa el backend.
   */
  guided?: boolean
  /**
   * El caller YA decidió que el alta arranca en el muro de cupo (el alta corta del home rebotó con
   * 402, o su pre-check vio el cupo lleno) y YA emitió su `upgrade_gate_hit`: acá no se re-evalúa
   * ni se vuelve a contar. Tras «Archivar un alumno» el muro se desarma igual que siempre.
   */
  openAtCapWall?: boolean
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
  const router = useRouter()
  // El branding resuelto del coach: lo necesita la vista previa del paso 3 (lo que ve el ALUMNO,
  // con el color y el logo del coach). El `theme` sigue llegando por prop, como siempre.
  const { branding } = useTheme()
  const onboarding = useCoachOnboarding()
  const [form, setForm] = useState<CreateForm>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showPw, setShowPw] = useState(true)
  const [phase, setPhase] = useState<'form' | 'success' | 'upgrade' | 'preview'>('form')
  const [success, setSuccess] = useState<SuccessInfo | null>(null)
  const [upgradeLimit, setUpgradeLimit] = useState<number | undefined>(undefined)
  const [showArchive, setShowArchive] = useState(false)
  const [freedNotice, setFreedNotice] = useState(false)
  // ── Estado exclusivo del modo guiado ──────────────────────────────────────────────────────
  const [showOptional, setShowOptional] = useState(false)
  const [channel, setChannel] = useState<GuidedInviteChannel | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  /**
   * Clave temporal del alta guiada. Se genera UNA vez por apertura (`visible` false→true): en modo
   * guiado el coach no inventa contraseñas —el formulario largo se la pedía— y el alumno la cambia
   * en su primer ingreso (`force_password_change`).
   */
  const [guidedPassword, setGuidedPassword] = useState<string>(() => generateGuidedTempPassword())
  /**
   * Canales por los que YA se emitió `invite_sent` en esta alta. La métrica es «por dónde eligió
   * mandarlo», no «cuántas veces tocó la tarjeta»: sin esto, copiar el link tres veces mandaba tres
   * eventos y la comparación por canal contra la web quedaba inflada. Se limpia por apertura.
   */
  const sentChannelsRef = useRef<GuidedInviteChannel[]>([])

  /**
   * Persona del coach. Manda la foto del onboarding (la sirve el dashboard); la caché de sesión del
   * gate es el respaldo cuando todavía nadie cargó el panel. Sin ninguna de las dos, el mensaje cae
   * a la plantilla neutra de `clientInviteMessage` — nunca a un texto con «EVA» adentro.
   */
  const persona: Persona | null =
    onboarding?.onboardingV2.persona ?? getCachedCoachPersonaStatus()?.persona ?? null
  const demoName = onboarding?.onboardingV2.demoName ?? null
  const noun = personaNoun(persona ?? 'other')
  const capNote = useMemo(
    () => (guided ? guidedCapNote({ tier: currentTier, maxClients, persona, demoName }) : null),
    [guided, currentTier, maxClients, persona, demoName],
  )
  /**
   * Correo de la sesión del coach, para avisarle que no hace falta agregarse (SPEC «Vive tu app»
   * directo §5). Sale de `getSession()` —la sesión YA cargada, sin round-trip— una sola vez por
   * apertura: un `getUser()` de red por tecla sería una llamada por carácter.
   */
  const [coachEmail, setCoachEmail] = useState<string | null>(null)
  const selfBlockedEmailRef = useRef<string | null>(null)
  /**
   * Nota preventiva del campo de correo: SOLO con alumno de ejemplo sembrado (sin demo, «Vive tu
   * app» todavía no tiene a quién entrar). El remate del cupo se apaga si `guidedCapNote` ya lo
   * dijo arriba: la misma pantalla no repite la frase.
   */
  const selfNote = useMemo(
    () =>
      demoName
        ? selfInviteNote(noun, {
            showsCupo: !capNote && currentTier === 'free' && workspace.kind === 'standalone',
          })
        : null,
    [demoName, noun, capNote, currentTier, workspace.kind],
  )
  const isOwnEmail = isCoachOwnEmail(form.email, coachEmail)

  function handleClose() {
    setForm(EMPTY)
    setError(null)
    setFieldErrors({})
    setShowPw(true)
    setPhase('form')
    setSuccess(null)
    setUpgradeLimit(undefined)
    setShowArchive(false)
    setFreedNotice(false)
    setShowOptional(false)
    setChannel(null)
    setLinkCopied(false)
    sentChannelsRef.current = []
    onClose()
  }

  function requestClose() {
    if (!loading) handleClose()
  }

  /**
   * Cupo lleno ⇒ el muro llega ANTES del primer campo (QA owner Android 22-08: el alta abría el
   * formulario entero y el rechazo aparecía recién al enviar, con los datos ya escritos).
   *
   * Corre al ABRIR (`visible` false→true), no en cada render: el conteo puede cambiar mientras el
   * modal está en pantalla —el coach archiva desde el propio muro (`handleFreed` vuelve al
   * formulario)— y re-evaluar ahí lo devolvería al muro justo después de haber liberado cupo.
   *
   * `shouldOpenAtCapWall` es un pre-check optimista sobre el conteo que la pantalla ya tenía; el
   * 402 del server sigue siendo la autorización y cubre el conteo local desactualizado.
   */
  useEffect(() => {
    if (!visible) return
    // Clave nueva por apertura: dos altas seguidas no pueden compartir la misma contraseña.
    if (guided) setGuidedPassword(generateGuidedTempPassword())
    // Cada alta cuenta sus propios canales elegidos.
    sentChannelsRef.current = []
    selfBlockedEmailRef.current = null
    // Sesión LOCAL (sin round-trip) para el aviso de auto-alta: el correo del coach.
    void supabase.auth
      .getSession()
      .then(({ data }) => setCoachEmail(data.session?.user?.email ?? null))
      .catch(() => setCoachEmail(null))
    if (openAtCapWall) {
      setUpgradeLimit(typeof maxClients === 'number' && maxClients > 0 ? maxClients : undefined)
      setFreedNotice(false)
      setPhase('upgrade')
      return
    }
    if (!shouldOpenAtCapWall({ activeCount, maxClients })) return
    setUpgradeLimit(typeof maxClients === 'number' && maxClients > 0 ? maxClients : undefined)
    setFreedNotice(false)
    setPhase('upgrade')
    // MISMO evento que emite el 402: si el pre-check ahorra el viaje, la métrica del gate no puede
    // perderse con él. `source` distingue las dos bocas del mismo muro.
    captureAppEvent('upgrade_gate_hit', {
      gate: 'client_limit',
      current_tier: currentTier ?? null,
      current_limit: typeof maxClients === 'number' && maxClients > 0 ? maxClients : null,
      active: typeof activeCount === 'number' ? activeCount : null,
      source: 'precheck',
    })
    // Deps: solo `visible`. Con `activeCount`/`maxClients` acá, el refresco de la cartera que dispara
    // `onCreated()` volvería a montar el muro sobre el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  /**
   * `add_student_self_blocked`: el coach está por gastar su cupo en sí mismo. UNA vez por correo
   * detectado, no por tecla — el guard por valor evita un evento por carácter tipeado.
   */
  useEffect(() => {
    if (!isOwnEmail) return
    const key = form.email.trim().toLowerCase()
    if (selfBlockedEmailRef.current === key) return
    selfBlockedEmailRef.current = key
    captureAppEvent('add_student_self_blocked', {
      persona: persona ?? null,
      surface: guided ? 'rn_guided_invite' : 'rn_create_client_modal',
    })
  }, [isOwnEmail, form.email, persona, guided])

  /**
   * «Ver mi plan» — pantalla INTERNA de estado (`/coach/(tabs)/subscription`): tier, cupo, activos,
   * módulos y «Actualizar estado». No es una superficie de pago, así que existe en iOS y en Android
   * por igual (el tono también es el permitido: «Ver mi plan», nunca «Mejorar mi plan»).
   *
   * Cierra el modal ANTES de navegar: la ventana nativa del sheet quedaría encima de la pantalla
   * nueva y el coach vería el muro flotando sobre «Mi plan».
   */
  function goToPlan() {
    handleClose()
    router.push('/coach/(tabs)/subscription')
  }

  async function handleSubmit() {
    setError(null)
    // Cinturón del aviso de auto-alta: el CTA ya viene deshabilitado, pero un submit por teclado
    // no puede saltarse el mismo rechazo que va a dar el servidor (409 `OWN_EMAIL`).
    if (isOwnEmail) {
      setFieldErrors({ email: [SELF_INVITE_BLOCKED_ES] })
      return
    }
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
      // Guiado: la clave la pone la app (el coach no ve ni escribe ese campo).
      temp_password: guided ? guidedPassword : form.tempPassword,
      age_confirmed: form.ageConfirmed ? 'on' : '',
    })
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors as FieldErrors
      const passwordError = flat.temp_password?.[0]
      if (guided && passwordError) {
        // En guiado el campo de contraseña NO se pinta (la clave la genera la app), así que un
        // error de `temp_password` no tendría dónde mostrarse: el coach vería un botón que no hace
        // nada. Se regenera la clave para el próximo intento y el motivo se dice en el error
        // general del sheet, que sí es visible.
        setGuidedPassword(generateGuidedTempPassword())
        const visible: FieldErrors = { ...flat }
        delete visible.temp_password
        setFieldErrors(visible)
        setError(passwordError)
        return
      }
      setFieldErrors(flat)
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
      // La credencial que el mensaje puede llevar: el correo normalizado que se mandó al servidor y
      // la clave temporal que ese alta acaba de fijar (generada en guiado, tipeada en el clásico).
      const credential = { email: parsed.data.email.toLowerCase(), tempPassword: parsed.data.temp_password }
      if (guided) {
        // En guiado el paso 2 llega SIEMPRE, con teléfono o sin él: sin teléfono el canal sigue
        // existiendo (la hoja de compartir y el link copiado no lo necesitan, y `wa.me` sin número
        // abre el selector de contactos — por eso ese caso va sin credencial).
        setSuccess({ clientName: res.clientName, phone: res.newClientPhone ?? '', loginUrl: res.loginUrl, ...credential })
        setPhase(GUIDED_PHASE[nextGuidedStep(1, 'created')])
        // Ledger del onboarding (dedupe duro server-side). El `stepKey` REAL viaja en la metadata
        // porque el endpoint todavía valida la lista de la guía v1 — ver el docblock de
        // `postCoachOnboardingEvent`. Best-effort: medir no puede romper el alta.
        void postCoachOnboardingEvent('step_completed', {
          step: 'first_client',
          stepKey: 'first_client',
          persona: persona ?? 'unknown',
          surface: 'rn_guided_invite',
        })
      } else if (res.newClientPhone) {
        setSuccess({ clientName: res.clientName, phone: res.newClientPhone, loginUrl: res.loginUrl, ...credential })
        setPhase('success')
      } else {
        handleClose()
      }
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'OWN_EMAIL') {
        // El correo del coach: el problema es de UN campo, así que se dice ahí y no en el banner
        // rojo general (que en esta pantalla se lee como «el alta falló»).
        setFieldErrors({ email: [e.message] })
      } else if (e instanceof ApiError && e.code === 'UPGRADE_REQUIRED') {
        // `apiFetch` conserva el mensaje/codigo del endpoint pero no campos extra.
        // El endpoint incluye el cupo en ambos; el prop sigue teniendo prioridad.
        const limitFromMessage = Number(e.message.match(/\d+/)?.[0])
        const resolvedLimit = typeof maxClients === 'number' && maxClients > 0 ? maxClients : Number.isFinite(limitFromMessage) ? limitFromMessage : undefined
        setUpgradeLimit(resolvedLimit)
        // El aviso «Cupo liberado» es de la vuelta ANTERIOR: si el alta vuelve a rebotar (el cupo
        // que se liberó ya se ocupó, o el archivado no alcanzó), dejarlo prendido le diría al coach
        // que tiene espacio justo mientras el muro le dice que no.
        setFreedNotice(false)
        // Espejo del web: hasta Pricing v3 el muro de cupo NO emitia ningun evento, asi que el
        // embudo del upgrade arrancaba DESPUES del rechazo. Se dispara una vez por 402 (este catch
        // corre una vez por submit rechazado). Sin PII: gate, tier, cupo y conteo.
        captureAppEvent('upgrade_gate_hit', {
          gate: 'client_limit',
          current_tier: currentTier ?? null,
          current_limit: resolvedLimit ?? null,
          active: typeof activeCount === 'number' ? activeCount : null,
          // La otra boca del muro es el pre-check al abrir (`source: 'precheck'`). Con el pre-check
          // en producción este 402 pasa a ser el caso raro: conteo local desactualizado.
          source: 'api_402',
        })
        setPhase('upgrade')
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo crear el alumno.')
      }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Alta de siempre: el CTA de WhatsApp del estado de éxito. El TEXTO no se arma acá — sale de la
   * plantilla por persona de `@eva/schemas`, igual que el WhatsApp de la ficha y del directorio.
   * Antes decía «Soy tu coach… tu link para acceder a tu plan», un quinto copy suelto que ignoraba
   * la persona del coach.
   *
   * Este estado solo existe cuando el alumno trae teléfono, así que el mensaje sale con la
   * credencial adentro; igual la decide `guidedInvitePayload` y no un `if` de acá — regla 4 de
   * `docs/specs/flujo-coach-nuevo/SPEC.md §5`.
   */
  function sendWhatsApp() {
    if (!success) return
    const { whatsappUrl } = guidedInvitePayload({
      channel: 'whatsapp',
      phone: success.phone,
      persona,
      clientName: success.clientName,
      loginUrl: success.loginUrl ?? '',
      email: success.email,
      tempPassword: success.tempPassword,
    })
    if (whatsappUrl) Linking.openURL(whatsappUrl).catch(() => {})
    handleClose()
  }

  /**
   * Paso 2 del alta guiada: elegir canal ES mandarlo. En un teléfono, separar «elegir» de «enviar»
   * agrega un toque sin agregar información.
   *
   * WhatsApp y la hoja de compartir sacan al coach de la app, así que el modal queda ya en el paso
   * 3 para cuando vuelva; copiar el link es instantáneo y se queda en el paso 2 con su acuse
   * INLINE (el `<Toaster />` vive en el árbol de la pantalla y puede quedar bajo esta ventana
   * nativa, mismo motivo que el aviso de «Cupo liberado»).
   */
  function handleChannel(picked: GuidedInviteChannel) {
    if (!success) return
    const loginUrl = success.loginUrl
    if (!hasShareableLink(loginUrl)) return
    setChannel(picked)
    setLinkCopied(false)
    /**
     * Dónde eligió mandar la invitación: es LA métrica que compara conversión por canal (misma
     * prop `channel` que emite el stepper de la web). Sin PII.
     *
     * Una sola vez por canal (`shouldEmitInviteSent`) y —en el link— DESPUÉS de que el
     * portapapeles confirme: un copiado que falla no es una invitación mandada.
     */
    const emitPicked = () => {
      if (!shouldEmitInviteSent(sentChannelsRef.current, picked)) return
      sentChannelsRef.current = [...sentChannelsRef.current, picked]
      captureAppEvent('invite_sent', { channel: picked, persona: persona ?? null, surface: 'rn_guided_invite' })
    }
    if (picked === 'whatsapp') {
      emitPicked()
      // Con teléfono va la credencial adentro; sin teléfono el destino es `wa.me/?text=` —el
      // selector de contactos— y el mismo payload la saca solo (regla 4 de SPEC §5).
      const { whatsappUrl } = guidedInvitePayload({
        channel: 'whatsapp',
        phone: success.phone,
        persona,
        clientName: success.clientName,
        loginUrl,
        email: success.email,
        tempPassword: success.tempPassword,
      })
      if (whatsappUrl) Linking.openURL(whatsappUrl).catch(() => {})
      setPhase(GUIDED_PHASE[nextGuidedStep(2, 'channel_chosen')])
      return
    }
    if (picked === 'share') {
      emitPicked()
      // La hoja del sistema NUNCA lleva credencial: el destinatario se elige después de mandar el
      // texto. `shareLogin` arma el mensaje sin correo ni clave por construcción —no recibe esos
      // campos—, así que acá no hay nada que filtrar y nada que se pueda olvidar de filtrar.
      shareLogin(success.clientName, loginUrl, persona).catch(() => {})
      setPhase(GUIDED_PHASE[nextGuidedStep(2, 'channel_chosen')])
      return
    }
    // Copiar el link: al portapapeles va el link pelado, jamás el mensaje con la clave.
    Clipboard.setStringAsync(loginUrl)
      .then(() => {
        setLinkCopied(true)
        emitPicked()
      })
      .catch(() => {})
  }

  /**
   * El coach archivó al menos un alumno: hay cupo de verdad, así que el muro se desarma y el alta
   * vuelve al formulario con los datos que ya había escrito (el 402 no los borra).
   *
   * Además del toast se pinta un aviso INLINE: el `<Toaster />` vive en el árbol de la pantalla
   * (`app/_layout.tsx`) y este modal renderiza en su propia ventana nativa, así que el toast puede
   * quedar por debajo. `onCreated` refresca la cartera de la pantalla de atrás para que el conteo
   * y el cupo que bajan por props queden al día.
   */
  function handleFreed() {
    setShowArchive(false)
    setPhase('form')
    setUpgradeLimit(undefined)
    setFreedNotice(true)
    toast.success('Cupo liberado')
    onCreated()
  }

  // Split por `Platform.OS`, nunca por storefront (decisión cerrada del owner, SPEC embudo-free-pro).
  const wallCopy = capWallCopy({ limit: upgradeLimit, platform: Platform.OS })

  // ── Modo guiado: paso visible y marca del coach ────────────────────────────────────────────
  // El muro de cupo NO es un paso del alta: mientras está en pantalla no hay indicador.
  const guidedStep: GuidedStep | null = !guided || phase === 'upgrade'
    ? null
    : phase === 'form' ? 1 : phase === 'success' ? 2 : 3
  // Lo que ve el ALUMNO: el color y el logo del branding del coach, no el `theme.primary` de su
  // panel (que puede ir neutro si apagó `use_brand_colors_coach`). Sin branding cargado se cae al
  // primario del tema, nunca a un hex escrito acá.
  const brandColor = branding?.primaryColor?.trim() || theme.primary
  const brandName = branding?.displayName?.trim() || ''
  const brandLogo = (theme.scheme === 'dark' ? branding?.logoUrlDark : null) || branding?.logoUrl || null
  // Sello «Hecho con EVA»: mismo gate FAIL-OPEN que las superficies del alumno (free/starter sí).
  // El tier del branding llega como `string | null` del servidor ⇒ pasa por la guarda de tipo
  // (`isSubscriptionTier`) en vez de un `as`: un valor desconocido cae a `free` y el sello se
  // pinta, que es el lado seguro (regalar atribución antes que regalar el beneficio pago).
  const brandingTier = branding?.subscriptionTier
  const previewTier: SubscriptionTier =
    currentTier ?? (isSubscriptionTier(brandingTier) ? brandingTier : 'free')
  const previewShowsBadge = showsEvaBadge(previewTier)
  const firstName = form.fullName.trim().split(/\s+/)[0] ?? ''

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android: la ventana del diálogo debe ser edge-to-edge, igual que el path `nativeModal` de
      // `Sheet.tsx` (ver el comentario largo ahí). RN avisa por consola si `navigationBarTranslucent`
      // viaja sin `statusBarTranslucent`, así que van juntas.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
    >
      {/* `padding` SIN gate de plataforma: con el gate a iOS el `behavior` era `undefined` en
          Android y el KAV quedaba inerte — los últimos campos del alta seguían debajo del teclado.
          Con `statusBarTranslucent` la ventana del Modal nunca recibe ADJUST_RESIZE en Android, así
          que el teclado la tapa en vez de encogerla y la compensación no puede duplicarse
          (mismo razonamiento que `Sheet.tsx:357-372`). */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
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

          {guidedStep ? <GuidedStepBar step={guidedStep} theme={theme} /> : null}

          {phase === 'preview' && success ? (
            // ─── (D) Guiado · paso 3 «Así la ve» ──────────────────────────────────
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.stateWrap}
              showsVerticalScrollIndicator={false}
            >
              <GuidedPreviewCopy theme={theme} persona={persona} clientName={success.clientName} />
              <GuidedLoginPreview
                theme={theme}
                brandName={brandName}
                brandColor={brandColor}
                logoUrl={brandLogo}
                showEvaBadge={previewShowsBadge}
              />
              <Button testID="create-client-guided-done" label="Listo" variant="sport" full onPress={handleClose} />
            </ScrollView>
          ) : phase === 'success' && success && guided ? (
            // ─── (B') Guiado · paso 2 «Cómo le llega» ─────────────────────────────
            // Misma semántica que la columna 2 del stepper web: el alta ya mandó el correo, acá se
            // elige el canal por el que el coach de verdad le habla.
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.stateWrap}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.stateCircle, { backgroundColor: SUCCESS + '26' }]}>
                <CheckCircle2 size={32} color={SUCCESS} />
              </View>
              <Text style={[styles.stateTitle, { color: theme.foreground }]}>
                {success.clientName} ya tiene su cuenta
              </Text>
              <Text style={[styles.stateBody, { color: theme.mutedForeground }]}>
                {hasShareableLink(success.loginUrl)
                  ? 'Su acceso ya salió por correo. Ahora avísale por donde de verdad te lee.'
                  : 'Su acceso ya salió por correo, con la clave temporal para su primer ingreso.'}
              </Text>
              {hasShareableLink(success.loginUrl) ? (
                <GuidedChannelPicker persona={persona} theme={theme} selected={channel} onPick={handleChannel} />
              ) : null}
              {linkCopied ? (
                <View
                  testID="create-client-guided-copied"
                  accessibilityLiveRegion="polite"
                  style={[styles.freedBox, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40' }]}
                >
                  <CheckCircle2 size={16} color={SUCCESS} />
                  <Text style={[styles.freedText, { color: theme.foreground }]}>
                    Link copiado. Pégalo donde quieras.
                  </Text>
                </View>
              ) : null}
              {/* La clave se puede seleccionar y copiar: hay coaches que la dictan por teléfono. */}
              <Text selectable style={[styles.guidedNote, { color: theme.mutedForeground }]}>
                Clave temporal: {guidedPassword} — la cambia al entrar.
              </Text>
              <Button
                testID="create-client-guided-next"
                label="Continuar"
                variant="sport"
                full
                onPress={() => setPhase(GUIDED_PHASE[nextGuidedStep(2, 'channel_chosen')])}
              />
              <TouchableOpacity testID="create-client-skip" onPress={handleClose} hitSlop={8}>
                <Text style={[styles.stateLink, { color: theme.mutedForeground }]}>Omitir por ahora</Text>
              </TouchableOpacity>
              <View style={{ height: 12 }} />
            </ScrollView>
          ) : phase === 'success' && success ? (
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
            // ─── (C) Muro de cupo del plan ────────────────────────────────────────
            // Copy + caption de tienda salen de `capWallCopy` (pura, testeada): el plural viene del
            // catálogo compartido y la línea de Android JAMÁS se arma acá a mano.
            <View testID="create-client-limit" style={styles.stateWrap}>
              <View style={[styles.stateCircle, { backgroundColor: WARNING + '26' }]}>
                <Lock size={32} color={WARNING} />
              </View>
              <Text style={[styles.stateTitle, { color: theme.foreground }]}>{wallCopy.title}</Text>
              <Text style={[styles.stateBody, { color: theme.mutedForeground }]}>{wallCopy.body}</Text>
              <View style={styles.stateActions}>
                <Button
                  testID="create-client-limit-archive"
                  label="Archivar un alumno"
                  variant="sport"
                  leftIcon={Archive}
                  full
                  onPress={() => setShowArchive(true)}
                />
                <RefreshPlanButton full />
                {/* Pantalla INTERNA de estado, no una superficie de pago: permitida en iOS y en
                    Android. Ghost para que no compita con «Archivar un alumno», que es la acción
                    que de verdad libera cupo. */}
                <Button
                  testID="create-client-limit-plan"
                  label="Ver mi plan"
                  variant="ghost"
                  full
                  onPress={goToPlan}
                />
              </View>
              <TouchableOpacity testID="create-client-limit-dismiss" onPress={handleClose} hitSlop={8}>
                <Text style={[styles.stateLink, { color: theme.mutedForeground }]}>Entendido</Text>
              </TouchableOpacity>
              {/* Android: UNA línea de texto plano, sin link ni subrayado. En iOS `caption` es
                  undefined y este nodo no existe (guideline 3.1.1). */}
              {wallCopy.caption ? (
                <Text testID="create-client-limit-store-note" style={[styles.stateCaption, { color: theme.mutedForeground }]}>
                  {wallCopy.caption}
                </Text>
              ) : null}
              <View style={{ height: 12 }} />
            </View>
          ) : (
            // ─── (A) Formulario ───────────────────────────────────────────────────
            <>
              <View style={styles.header}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.title, { color: theme.foreground }]}>
                    {guided ? guidedTitle(persona) : 'Agregar Nuevo Alumno'}
                  </Text>
                  <Text style={[styles.subtitle, { color: theme.mutedForeground }]}>
                    {guided
                      ? guidedFormHint(persona)
                      : 'Se creará una cuenta con contraseña temporal. El alumno deberá cambiarla en su primer ingreso.'}
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

              {/* Vuelta desde el selector de archivado: el toast puede quedar bajo la ventana del
                  modal, así que el resultado de la acción también se dice acá. */}
              {freedNotice ? (
                <View style={[styles.freedBox, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40' }]}>
                  <CheckCircle2 size={16} color={SUCCESS} />
                  <Text style={[styles.freedText, { color: theme.foreground }]}>
                    Cupo liberado. Ya puedes agregar a tu alumno.
                  </Text>
                </View>
              ) : null}

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
                    // El correo propio se dice INLINE, en el campo que lo causa (nunca en el
                    // banner rojo del sheet, que se lee como «el alta falló»).
                    error={fieldErrors.email?.[0] ?? (isOwnEmail ? SELF_INVITE_BLOCKED_ES : undefined)}
                  />
                  {/* Probar la app no pasa por agregarse: el camino es «Vive tu app» desde el
                      panel. Solo con alumno de ejemplo sembrado (SPEC «Vive tu app» directo §5). */}
                  {selfNote && !isOwnEmail ? (
                    <View
                      testID="create-client-self-note"
                      style={[styles.guidedNoteBox, { backgroundColor: theme.muted, borderColor: theme.border }]}
                    >
                      <Text style={[styles.guidedNoteText, { color: theme.mutedForeground }]}>{selfNote}</Text>
                    </View>
                  ) : null}
                  {/* Nota de cupo del plan Free: el alumno de ejemplo NO gasta el único lugar, y
                      el coach nuevo no tiene cómo saberlo. Solo aparece cuando hay demo sembrado
                      (`guidedCapNote` devuelve null en cualquier otro caso). */}
                  {capNote ? (
                    <View
                      testID="create-client-guided-cap-note"
                      style={[styles.guidedNoteBox, { backgroundColor: theme.muted, borderColor: theme.border }]}
                    >
                      <Text style={[styles.guidedNoteText, { color: theme.mutedForeground }]}>{capNote}</Text>
                    </View>
                  ) : null}

                  {/* Guiado: teléfono y fecha viven detrás de «Opcional» (espejo del `<details>` de
                      la web) y la contraseña temporal la genera la app. Sin guiar, el formulario
                      completo de siempre. */}
                  {guided ? (
                    <TouchableOpacity
                      testID="create-client-guided-optional"
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showOptional }}
                      accessibilityLabel="Datos opcionales"
                      activeOpacity={0.82}
                      onPress={() => setShowOptional((v) => !v)}
                      style={[styles.optionalToggle, { borderColor: theme.borderDefault }]}
                    >
                      <Text style={[styles.optionalLabel, { color: theme.mutedForeground }]}>Opcional</Text>
                      {showOptional ? (
                        <ChevronDown size={16} color={theme.mutedForeground} />
                      ) : (
                        <ChevronRight size={16} color={theme.mutedForeground} />
                      )}
                    </TouchableOpacity>
                  ) : null}

                  {!guided || showOptional ? (
                    <>
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
                    </>
                  ) : null}

                  {guided ? null : (
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
                  )}

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
                  label={
                    loading
                      ? guided ? 'Creando la cuenta…' : 'Creando alumno...'
                      : guided
                        ? firstName
                          ? `Invitar a ${firstName}`
                          : `Invitar a mi ${noun}`
                        : 'Crear Alumno'
                  }
                  theme={theme}
                  variant="sport"
                  leftIcon={UserPlus}
                  loading={loading}
                  disabled={loading || isOwnEmail}
                  onPress={handleSubmit}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
        </View>

        {/* Selector de archivado del muro: overlay absoluto DENTRO de esta misma ventana nativa —
            nunca un segundo `<Modal>` (ver el docblock de ArchiveToFreeSpaceSheet: dos ventanas
            nativas anidadas = «pantalla gris» al volver de una Activity en Android).
            Solo existe mientras el muro está en pantalla. */}
        {phase === 'upgrade' ? (
          <ArchiveToFreeSpaceSheet
            open={showArchive}
            onClose={() => setShowArchive(false)}
            workspace={workspace}
            onFreed={handleFreed}
          />
        ) : null}
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
  freedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  freedText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: FONT.uiSemibold },
  // Estados B/C (éxito / muro de cupo)
  stateWrap: { alignItems: 'center', gap: 20, paddingVertical: 16, paddingHorizontal: 4 },
  stateCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 18, fontFamily: FONT.displayBold, textAlign: 'center' },
  stateBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: FONT.ui },
  stateActions: { width: '100%', gap: 10 },
  stateLink: { fontSize: 14, fontFamily: FONT.uiSemibold },
  // Caption Android-only: texto plano, sin subrayado ni color de link.
  stateCaption: { fontSize: 12, lineHeight: 16, textAlign: 'center', fontFamily: FONT.ui, marginTop: -8 },
  // Alta guiada (paso 4 de la guía v2)
  guidedNote: { fontSize: 12, lineHeight: 17, textAlign: 'center', fontFamily: FONT.ui },
  guidedNoteBox: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  guidedNoteText: { fontSize: 12, lineHeight: 17, fontFamily: FONT.ui },
  optionalToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  optionalLabel: { fontSize: 13, fontFamily: FONT.uiSemibold },
  waButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 12, width: '100%',
  },
  waLabel: { fontSize: 14, fontFamily: FONT.uiBold },
})
