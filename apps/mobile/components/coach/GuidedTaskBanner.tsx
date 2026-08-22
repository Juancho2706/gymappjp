import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ArrowUpRight, X } from 'lucide-react-native'
import { FONT } from '../../lib/typography'
import { themedIcon } from './programs/themed-icon'

/**
 * Banda de tarea guiada del paso 3 — la versión RN de las `GuidedTaskCards` de la web
 * (SPEC coach-onboarding-v2 §6 y §7, TASKS W8; hallazgo 5 del QA del owner 22-08:
 * «los pasos 3 y 4 me mandan al área pero no me guían a hacer otra cosa»).
 *
 * Es una banda EMBEBIDA dentro de la pantalla real: nunca un velo, nunca un pop-up, nunca un tour.
 * El coach hace el trabajo de verdad mientras la lee, y puede cerrarla — al cerrarla no vuelve
 * (memoria por coach y por superficie).
 *
 * Por qué no reusa el tour del builder: el tour es un overlay que TAPA la pantalla y ya tiene su
 * propio disparador; esta banda convive con el lienzo. Los dos no se pisan porque la banda no
 * secuestra el foco ni la navegación.
 *
 * Contraste (hallazgo 2 del mismo QA, «no se lee bien el texto» en dark): NADA de texto de marca
 * sobre relleno de marca. La banda es una card normal (`surface-card`) con un borde y un ribete de
 * acento; todo el texto va en `text-strong` / `text-muted`, que son los pares del DS con contraste
 * garantizado en los dos esquemas.
 */

// RN no tiene `currentColor`: los iconos de lucide toman el color de un `text-*` vía `themedIcon`.
const IconClose = themedIcon(X)
const IconAction = themedIcon(ArrowUpRight)

export interface GuidedTaskBannerAction {
    label: string
    onPress: () => void
    busy?: boolean
    disabled?: boolean
}

/** Clave de la memoria. Por coach (dos cuentas en el mismo teléfono no se pisan) y por superficie. */
export function guidedBannerKey(coachId: string, surface: string): string {
    return `eva.guided-banner.v1:${coachId}:${surface}`
}

const T_EYEBROW = { fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.66, textTransform: 'uppercase' as const }
const T_TITLE = { fontFamily: FONT.displayBold, fontSize: 15, lineHeight: 19 }
const T_BULLET = { fontFamily: FONT.ui, fontSize: 13, lineHeight: 18 }
const T_INDEX = { fontFamily: FONT.uiBold, fontSize: 10 }
const T_ACTION = { fontFamily: FONT.uiBold, fontSize: 13 }

export function GuidedTaskBanner({
    coachId,
    surface,
    eyebrow = 'Tu guía',
    title,
    bullets,
    action,
    /** Añade el inset superior: solo cuando la banda es el primer elemento bajo el status bar. */
    withTopInset = false,
    /**
     * `screen` = la banda se pone sus propios márgenes (host sin padding, p. ej. el builder).
     * `none` = el host ya tiene gutter (un `ScrollView` con `paddingHorizontal: 16`) y la banda
     * solo separa verticalmente. Elegirlo mal es la diferencia entre 16 y 32 px de aire.
     */
    inset = 'screen',
    onVisibilityChange,
}: {
    coachId: string | null
    surface: string
    eyebrow?: string
    title: string
    bullets: readonly string[]
    action?: GuidedTaskBannerAction | null
    withTopInset?: boolean
    inset?: 'screen' | 'none'
    /**
     * Se avisa cada vez que cambia si la banda OCUPA o no espacio en pantalla: al montar (`false`,
     * la memoria todavía no se resolvió), al resolverla y al cerrarla con la «×».
     *
     * Existe porque un host puede estar compensando el espacio que la banda consume — el editor de
     * nutrición le entrega `top: 0` a `QuickEditMode` porque la banda ya se comió el inset del
     * status bar. Sin este aviso esa compensación sobrevive a la banda y la barra «Editando» queda
     * bajo la hora y la batería (hallazgo bloqueante de la verificación del 22-08).
     */
    onVisibilityChange?: (visible: boolean) => void
}) {
    const insets = useSafeAreaInsets()
    // Se decide leyendo AsyncStorage: hasta entonces NO se pinta. Pintarla y esconderla después
    // sería un parpadeo justo arriba del lienzo de trabajo.
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        let active = true
        // Sin `coachId` (la foto del panel todavía no cargó) se muestra igual: la ayuda del paso 3
        // no puede depender de una consulta. Lo que no se puede es SELLAR el cierre sin llave.
        if (coachId == null) {
            setVisible(true)
            return () => {
                active = false
            }
        }
        AsyncStorage.getItem(guidedBannerKey(coachId, surface))
            .then((stored) => {
                if (active) setVisible(stored !== 'true')
            })
            .catch(() => {
                if (active) setVisible(true)
            })
        return () => {
            active = false
        }
    }, [coachId, surface])

    // Lo que el host necesita saber no es el estado interno sino si la banda OCUPA espacio: una
    // banda sin bullets no se pinta aunque la memoria diga que sí.
    const shown = visible && bullets.length > 0

    const notifyRef = useRef(onVisibilityChange)
    useEffect(() => {
        notifyRef.current = onVisibilityChange
    }, [onVisibilityChange])
    // Se avisa por efecto (no en el render ni dentro del `.then`) para que el host siempre reciba
    // el primer `false` del montaje: hasta que AsyncStorage conteste, el espacio NO está tomado.
    useEffect(() => {
        notifyRef.current?.(shown)
    }, [shown])

    if (!shown) return null

    const dismiss = () => {
        setVisible(false)
        if (coachId == null) return
        AsyncStorage.setItem(guidedBannerKey(coachId, surface), 'true').catch(() => {
            // Que no se pueda sellar no puede romper la pantalla: peor caso, vuelve a aparecer.
        })
    }

    return (
        <View
            accessibilityRole="summary"
            accessibilityLabel={title}
            testID={`guided-banner-${surface}`}
            style={withTopInset ? { paddingTop: insets.top } : undefined}
            className={withTopInset ? 'bg-surface-app' : undefined}
        >
            <View
                className={
                    inset === 'screen'
                        ? 'mx-space-5 my-space-4 overflow-hidden rounded-card border border-sport-500/30 bg-surface-card'
                        : 'mb-space-4 overflow-hidden rounded-card border border-sport-500/30 bg-surface-card'
                }
            >
                {/* Ribete de acento: da la señal de «esto es la guía» sin teñir el fondo del texto. */}
                <View className="h-[3px] w-full bg-sport-500" />
                <View className="gap-space-3 p-space-5">
                    <View className="flex-row items-start gap-space-3">
                        <View className="min-w-0 flex-1">
                            <Text style={T_EYEBROW} className="text-sport-600">
                                {eyebrow}
                            </Text>
                            <Text style={T_TITLE} className="mt-[2px] text-strong">
                                {title}
                            </Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Ocultar la ayuda"
                            onPress={dismiss}
                            hitSlop={8}
                            testID={`guided-banner-dismiss-${surface}`}
                            className="h-11 w-11 items-center justify-center rounded-control active:opacity-70"
                        >
                            <IconClose size={18} className="text-muted" />
                        </Pressable>
                    </View>

                    <View className="gap-space-3">
                        {bullets.map((bullet, index) => (
                            <View key={bullet} className="flex-row items-start gap-space-3">
                                <View className="mt-[1px] h-5 w-5 items-center justify-center rounded-full bg-sport-100 dark:bg-sport-100/20">
                                    <Text style={T_INDEX} className="text-sport-600">
                                        {index + 1}
                                    </Text>
                                </View>
                                <Text style={T_BULLET} className="min-w-0 flex-1 text-muted">
                                    {bullet}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {action ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={action.label}
                            accessibilityState={{ disabled: action.disabled === true || action.busy === true }}
                            disabled={action.disabled === true || action.busy === true}
                            onPress={action.onPress}
                            testID={`guided-banner-action-${surface}`}
                            className="mt-space-1 min-h-[44px] flex-row items-center justify-center gap-space-2 rounded-control border-[1.5px] border-subtle bg-surface-app px-space-4 active:opacity-80"
                        >
                            <IconAction size={16} className="text-strong" />
                            <Text style={T_ACTION} className="text-strong">
                                {action.busy === true ? 'Abriendo…' : action.label}
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>
        </View>
    )
}
