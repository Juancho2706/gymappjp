import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { ArrowRight } from 'lucide-react-native'
import { NativeDialog } from '../NativeDialog'
import { FONT } from '../../lib/typography'
import {
    MAX_SHEET_TEMPLATES,
    applyOnboardingTemplate,
    firstTemplateSheetTitle,
    listOnboardingTemplates,
    templateMetaLine,
    type MobileOnboardingTemplate,
    type OnboardingTemplateSurface,
} from '../../lib/templates'
import { themedIcon } from './programs/themed-icon'

/**
 * «Tu primera rutina para {demo}» — la sheet template-first del paso 3 en la app
 * (SPEC coach-onboarding-v2 §7, TASKS W8; hallazgo 5 del QA del owner 22-08).
 *
 * Es la hermana nativa de `FirstRoutinePicker` de la web: mismo catálogo, mismo sembrador
 * (`/api/mobile/coach/templates`, que por dentro es el mismo `applyTemplate`), mismo final —
 * el coach aterriza en el lienzo con la plantilla YA aplicada, nunca en un builder en blanco.
 *
 * Diferencia deliberada con la web: acá NO hay selector de alumno. El paso 3 se hace sobre el
 * alumno de EJEMPLO (es el único que existe el día 1) y la sheet solo aparece cuando ese alumno
 * está sembrado; sin demo el tab se comporta como siempre. Un selector con una sola opción sería
 * una decisión falsa en una pantalla de teléfono.
 *
 * Si el sembrado falla no se traga el paso: se avisa y el lienzo se abre igual, en blanco. Perder
 * la plantilla es molesto; perder el paso 3 de la guía es peor.
 */

const IconGo = themedIcon(ArrowRight)

const T_INTRO = { fontFamily: FONT.ui, fontSize: 13, lineHeight: 18 }
const T_LABEL = { fontFamily: FONT.uiBold, fontSize: 14.5, lineHeight: 19 }
const T_BLURB = { fontFamily: FONT.ui, fontSize: 12.5, lineHeight: 17 }
const T_META = { fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.4 }
const T_SKIP = { fontFamily: FONT.uiBold, fontSize: 13 }
const T_ERROR = { fontFamily: FONT.uiBold, fontSize: 12.5, lineHeight: 17 }

export function FirstTemplateSheet({
    open,
    surface = 'training',
    demoName,
    demoClientId,
    onClose,
    onApplied,
    onSkip,
}: {
    open: boolean
    surface?: OnboardingTemplateSurface
    /** Nombre del alumno de ejemplo («Matías»). `null` = se cae a un título sin nombre. */
    demoName: string | null
    /** Alumno sobre el que se arma. La sheet no se monta sin esto (lo decide el host). */
    demoClientId: string
    onClose: () => void
    /** Plantilla aplicada: el host abre el lienzo. `programId` puede venir `null` si falló el seed. */
    onApplied: (result: { templateId: string; programId: string | null }) => void
    /** «Prefiero armarla yo»: se abre el lienzo en blanco, sin perder el paso. */
    onSkip: () => void
}) {
    const [templates, setTemplates] = useState<MobileOnboardingTemplate[] | null>(null)
    const [loadFailed, setLoadFailed] = useState(false)
    const [pendingId, setPendingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        let active = true
        setLoadFailed(false)
        // Al reabrir se vuelve al spinner: dejar la lista vieja pintada mientras se pide de nuevo
        // muestra plantillas de la superficie anterior o de una sesión que ya no corre.
        setTemplates(null)
        void listOnboardingTemplates(surface).then((list) => {
            if (!active) return
            if (list == null) {
                setLoadFailed(true)
                return
            }
            setTemplates(list.templates.slice(0, MAX_SHEET_TEMPLATES))
        })
        return () => {
            active = false
        }
    }, [open, surface])

    const apply = (template: MobileOnboardingTemplate) => {
        if (pendingId != null) return
        setError(null)
        setPendingId(template.id)
        void applyOnboardingTemplate({ templateId: template.id, clientId: demoClientId }).then((result) => {
            setPendingId(null)
            if (result.ok) {
                onApplied({ templateId: template.id, programId: result.programId })
                return
            }
            setError(result.error)
        })
    }

    const busy = pendingId != null

    return (
        <NativeDialog
            open={open}
            title={firstTemplateSheetTitle(demoName)}
            onClose={onClose}
            closeDisabled={busy}
            maxWidth={520}
        >
            <Text style={T_INTRO} className="text-muted">
                Elige una y la dejamos armada. Después cambias lo que quieras: es tuya.
            </Text>

            {/* Una lista VACÍA se cuenta como fallo de carga: para el coach «no hay nada que
                elegir» y «no pudimos traer nada» son la misma pantalla, y en las dos la salida es
                «Prefiero armarla yo». Lo que no puede pasar es un hueco mudo entre la bajada y esa
                salida. */}
            {loadFailed || (templates != null && templates.length === 0) ? (
                <Text style={T_ERROR} className="text-danger-600">
                    No pudimos cargar las plantillas. Puedes armarla desde cero igual.
                </Text>
            ) : templates == null ? (
                <View className="items-center py-space-6">
                    <ActivityIndicator />
                </View>
            ) : (
                <ScrollView className="max-h-[340px]" showsVerticalScrollIndicator={false}>
                    <View className="gap-space-3">
                        {templates.map((template) => {
                            const meta = templateMetaLine(template)
                            const isPending = pendingId === template.id
                            return (
                                <Pressable
                                    key={template.id}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Usar la plantilla ${template.label}`}
                                    accessibilityState={{ disabled: busy, busy: isPending }}
                                    disabled={busy}
                                    onPress={() => apply(template)}
                                    testID={`first-template-${template.id}`}
                                    className="min-h-[44px] flex-row items-center gap-space-4 rounded-card border border-subtle bg-surface-card p-space-4 active:opacity-80"
                                >
                                    <View className="min-w-0 flex-1">
                                        <Text style={T_LABEL} className="text-strong">
                                            {template.label}
                                        </Text>
                                        {template.blurb === '' ? null : (
                                            <Text style={T_BLURB} className="mt-[2px] text-muted">
                                                {template.blurb}
                                            </Text>
                                        )}
                                        {meta === '' ? null : (
                                            <Text style={T_META} className="mt-space-2 text-sport-600">
                                                {meta}
                                            </Text>
                                        )}
                                    </View>
                                    {isPending ? (
                                        <ActivityIndicator />
                                    ) : (
                                        <IconGo size={16} className="text-muted" />
                                    )}
                                </Pressable>
                            )
                        })}
                    </View>
                </ScrollView>
            )}

            {error == null ? null : (
                <Text style={T_ERROR} className="text-danger-600" accessibilityLiveRegion="polite">
                    {error}
                </Text>
            )}

            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Prefiero armarla yo"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={onSkip}
                testID="first-template-skip"
                className="min-h-[44px] items-center justify-center rounded-control active:opacity-70"
            >
                <Text style={T_SKIP} className="text-muted">
                    Prefiero armarla yo
                </Text>
            </Pressable>
        </NativeDialog>
    )
}
