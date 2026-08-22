import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import type { Persona } from '@eva/schemas'
import { EVA_BADGE_LABEL } from '../../../lib/coach-tiers'
import { readableInkOn } from '../../../lib/color-contrast'
import { FONT } from '../../../lib/typography'
import type { Theme } from '../../../lib/theme'
import { SUCCESS } from './directory-shared'
import {
  GUIDED_STEP_COUNT,
  guidedAhaNote,
  guidedChannelCopy,
  guidedPreviewTitle,
  guidedStepLabel,
  type GuidedInviteChannel,
  type GuidedStep,
} from './guided-invite'

/**
 * Piezas visuales del alta guiada del paso 4 («Invita a tu primer {alumno}») en RN.
 *
 * Espejo del `AddStudentStepper` de la web: indicador de 3 pasos, elección de canal y vista previa
 * de lo que va a ver el alumno con la marca del coach. Las monta `CreateClientModal` cuando entra
 * en modo guiado (`guided`), y solo ahí: el alta de siempre no cambia ni un píxel.
 *
 * Todo el copy sale de `guided-invite.ts` (puro y testeado). Acá no se redacta nada.
 *
 * Reglas RN (apps/mobile/AGENTS.md): tokens del `Theme` por style —nada de hex de marca
 * hardcodeado—, superficies ≥44 pt, `className` sin forma-función y dark mode por el mismo
 * `theme` que ya usa el modal.
 */

/** Indicador «Paso 2 de 3 · Cómo le llega» + tres marcas de progreso. */
export function GuidedStepBar({ step, theme }: { step: GuidedStep; theme: Theme }) {
  const marks: GuidedStep[] = [1, 2, 3]
  return (
    <View
      testID="guided-invite-stepbar"
      accessibilityRole="progressbar"
      accessibilityLabel={guidedStepLabel(step)}
      accessibilityValue={{ min: 1, max: GUIDED_STEP_COUNT, now: step }}
      style={styles.stepBar}
    >
      <Text style={[styles.stepLabel, { color: theme.primary }]}>{guidedStepLabel(step)}</Text>
      <View style={styles.stepMarks}>
        {marks.map((mark) => (
          <View
            key={mark}
            style={[
              styles.stepMark,
              {
                backgroundColor: mark <= step ? theme.primary : theme.border,
                width: mark === step ? 22 : 12,
              },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const CHANNEL_ICONS: Record<GuidedInviteChannel, LucideIcon> = {
  whatsapp: MessageCircle,
  share: Share2,
  link: Copy,
}

/** testIDs conservados del alta de siempre (QA/Maestro): el de WhatsApp no cambia de nombre. */
const CHANNEL_TEST_IDS: Record<GuidedInviteChannel, string> = {
  whatsapp: 'create-client-whatsapp',
  share: 'create-client-share',
  link: 'create-client-copy-link',
}

/**
 * Paso 2 — «Cómo le llega». Cada tarjeta ES la acción (tocar = elegir canal y mandarlo): en un
 * teléfono, separar «elegir» de «enviar» agrega un toque sin agregar información.
 */
export function GuidedChannelPicker({
  persona,
  theme,
  selected,
  onPick,
}: {
  persona: Persona | null | undefined
  theme: Theme
  selected: GuidedInviteChannel | null
  onPick: (channel: GuidedInviteChannel) => void
}) {
  return (
    <View style={styles.channelList}>
      {guidedChannelCopy(persona).map((channel) => {
        const Icon = CHANNEL_ICONS[channel.id]
        const active = selected === channel.id
        return (
          <TouchableOpacity
            key={channel.id}
            testID={CHANNEL_TEST_IDS[channel.id]}
            accessibilityRole="button"
            accessibilityLabel={`${channel.title}. ${channel.body}`}
            accessibilityState={{ selected: active }}
            activeOpacity={0.82}
            onPress={() => onPick(channel.id)}
            style={[
              styles.channelCard,
              {
                backgroundColor: theme.card,
                borderColor: active ? theme.primary : theme.borderDefault,
              },
            ]}
          >
            <View style={[styles.channelIcon, { backgroundColor: active ? theme.primary : theme.muted }]}>
              <Icon size={18} color={active ? theme.primaryForeground : theme.mutedForeground} strokeWidth={2.1} />
            </View>
            <View style={styles.channelText}>
              <View style={styles.channelTitleRow}>
                <Text style={[styles.channelTitle, { color: theme.foreground }]}>{channel.title}</Text>
                {active ? <Check size={15} color={SUCCESS} strokeWidth={2.6} /> : null}
              </View>
              <Text style={[styles.channelBody, { color: theme.mutedForeground }]}>{channel.body}</Text>
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

/**
 * Paso 3 — «Así la ve {nombre}»: la maqueta del login del alumno con la marca del COACH (logo o
 * iniciales, color de marca y nombre), más el sello «Hecho con EVA» cuando el plan lo lleva.
 *
 * Es una maqueta, no una captura: dos campos apagados y el botón «Entrar» pintado con el color de
 * marca alcanzan para que el coach reconozca su app sin que le prometamos una pantalla que todavía
 * no vio. El color viene del branding resuelto que ya trae el `theme`/`branding` del contexto —
 * nunca un hex escrito acá.
 */
export function GuidedLoginPreview({
  theme,
  brandName,
  brandColor,
  logoUrl,
  showEvaBadge,
}: {
  theme: Theme
  brandName: string
  brandColor: string
  logoUrl?: string | null
  showEvaBadge: boolean
}) {
  const initials = (brandName.trim() || 'EVA').slice(0, 2).toUpperCase()
  return (
    <View
      testID="guided-invite-preview"
      accessibilityLabel={`Vista previa del acceso con tu marca: ${brandName.trim() || 'tu marca'}`}
      style={[styles.preview, { backgroundColor: theme.muted, borderColor: theme.border }]}
    >
      <View style={styles.previewInner}>
        {logoUrl ? (
          // `alt=""`: decorativa. Quien nombra la tarjeta es el `accessibilityLabel` del contenedor
          // —el logo repetiría la marca que ya se lee debajo.
          <Image source={{ uri: logoUrl }} alt="" style={styles.previewLogo} resizeMode="contain" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.previewLogo, styles.previewInitials, { backgroundColor: brandColor }]}>
            {/* La tinta sobre el color de marca la calcula el contraste WCAG (`readableInkOn`,
                mismo helper que la Familia N): con una marca clara, un blanco fijo dejaba las
                iniciales ilegibles. */}
            <Text style={[styles.previewInitialsText, { color: readableInkOn(brandColor) }]}>{initials}</Text>
          </View>
        )}
        <Text numberOfLines={1} style={[styles.previewBrand, { color: theme.foreground }]}>
          {brandName.trim() || 'Tu marca'}
        </Text>
        <View style={[styles.previewField, { backgroundColor: theme.card, borderColor: theme.border }]} />
        <View style={[styles.previewField, { backgroundColor: theme.card, borderColor: theme.border }]} />
        <View style={[styles.previewCta, { backgroundColor: brandColor }]}>
          {/* Mismo criterio que las iniciales: la tinta sale del color de MARCA, no del primario
              del panel del coach (`theme.primaryForeground` puede no contrastar con su marca). */}
          <Text style={[styles.previewCtaLabel, { color: readableInkOn(brandColor) }]}>Entrar</Text>
        </View>
      </View>
      {showEvaBadge ? (
        // DECORATIVO: dentro de una maqueta el sello se dibuja, no se toca. El `EvaBadge` real es
        // un link que abre `eva-app.cl/hecho-con-eva` en el navegador; acá eso sacaría al coach de
        // la app desde una vista previa del login de su alumno. Mismo literal compartido
        // (`EVA_BADGE_LABEL`), cero copy nuevo, y sigue siendo store-safe.
        <View
          style={[styles.previewBadge, { borderTopColor: theme.border }]}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Text
            testID="guided-invite-preview-badge"
            style={[styles.previewBadgeLabel, { color: theme.mutedForeground }]}
          >
            {EVA_BADGE_LABEL}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/** Encabezado + texto del paso 3 (lo que pasa cuando el alumno entra). */
export function GuidedPreviewCopy({
  theme,
  persona,
  clientName,
}: {
  theme: Theme
  persona: Persona | null | undefined
  clientName: string
}) {
  return (
    <View style={styles.previewCopy}>
      <Text style={[styles.previewTitle, { color: theme.foreground }]}>{guidedPreviewTitle(clientName)}</Text>
      <Text style={[styles.previewBody, { color: theme.mutedForeground }]}>{guidedAhaNote(persona, clientName)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stepBar: { gap: 8, paddingBottom: 2 },
  stepLabel: { fontSize: 12, letterSpacing: 0.4, fontFamily: FONT.uiBold, textTransform: 'uppercase' },
  stepMarks: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  stepMark: { height: 4, borderRadius: 2 },
  channelList: { width: '100%', gap: 10 },
  channelCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  channelIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  channelText: { flex: 1, gap: 2 },
  channelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  channelTitle: { fontSize: 14, fontFamily: FONT.uiBold },
  channelBody: { fontSize: 12, lineHeight: 16, fontFamily: FONT.ui },
  preview: { width: '100%', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  previewInner: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 14 },
  previewLogo: { width: 44, height: 44, borderRadius: 22 },
  previewInitials: { alignItems: 'center', justifyContent: 'center' },
  previewInitialsText: { fontSize: 14, fontFamily: FONT.uiBold },
  previewBrand: { maxWidth: '100%', fontSize: 13.5, fontFamily: FONT.uiBold },
  previewField: { width: '100%', height: 28, borderRadius: 10, borderWidth: 1 },
  previewCta: { width: '100%', height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  previewCtaLabel: { fontSize: 12, fontFamily: FONT.uiBold },
  previewBadge: { borderTopWidth: 1, paddingVertical: 8, paddingHorizontal: 8 },
  previewBadgeLabel: { fontSize: 11.5, letterSpacing: 0.6, textAlign: 'center', fontFamily: FONT.ui },
  previewCopy: { width: '100%', gap: 6 },
  previewTitle: { fontSize: 16, fontFamily: FONT.displayBold, textAlign: 'center' },
  previewBody: { fontSize: 13, lineHeight: 19, fontFamily: FONT.ui, textAlign: 'center' },
})
