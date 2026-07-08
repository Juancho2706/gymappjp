import { Linking, StyleSheet, Text, View } from 'react-native'
import { HeartPulse, Activity, Ruler, Apple, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { Button } from './Button'
import { getApiBaseUrl } from '../lib/api'
import type { ModuleKey } from '../lib/entitlements-core'

/**
 * ModuleOffNotice (RN) — port del aviso web `components/coach/ModuleOffNotice.tsx` (E0-C2).
 * Se muestra cuando se navega a una superficie de un modulo que NO esta habilitado (mensaje
 * NEUTRO, sin urgencia ni precio — regla anti-hostigamiento del plan 05 §2.6). Copy verbatim de
 * la web por las 4 superficies (cardio, movement, body_composition, nutrition_exchanges).
 *
 * CTA CONTEXTUAL: por defecto (coach) abre el catalogo de modulos en la web
 * (`/coach/settings/modules`, unica superficie con disponibilidad/precio) porque la app aun no
 * tiene esa pantalla nativa (Ola 2 T13). Los consumidores pueden pasar un `cta` propio (p. ej. la
 * vista del alumno, que no compra: "contacta a tu coach") o `cta={null}` para no mostrar boton.
 */

type ModuleCopy = { icon: LucideIcon; title: string; description: string }

const MODULE_COPY: Record<ModuleKey, ModuleCopy> = {
    cardio: {
        icon: HeartPulse,
        title: 'El módulo Cardio no está habilitado',
        description:
            'Las zonas de frecuencia cardiaca personalizadas, la calculadora de pace y las plantillas de intervalos son parte del módulo Cardio.',
    },
    movement_assessment: {
        icon: Activity,
        title: 'El módulo Evaluación de movimiento no está habilitado',
        description:
            'El screening de movilidad y los patrones de movimiento para personalizar la prescripción son parte del módulo Evaluación de movimiento.',
    },
    body_composition: {
        icon: Ruler,
        title: 'El módulo Composición corporal no está habilitado',
        description:
            'La antropometría y la composición corporal (protocolo ISAK completo) son parte del módulo Composición corporal.',
    },
    nutrition_exchanges: {
        icon: Apple,
        title: 'El módulo Nutrición Pro no está habilitado',
        description:
            'Las pautas por intercambios, las plantillas reutilizables, los micronutrientes avanzados, los objetivos por composición corporal y el PDF con tu marca son parte del módulo Nutrición Pro.',
    },
}

type CtaProp = { label: string; onPress: () => void } | null

export function ModuleOffNotice({
    moduleKey,
    cta,
}: {
    moduleKey: ModuleKey
    /** CTA override. `undefined` => default (coach: abrir catalogo web). `null` => sin boton. */
    cta?: CtaProp
}) {
    const { theme } = useTheme()
    const copy = MODULE_COPY[moduleKey]
    const Icon = copy.icon

    const resolvedCta: CtaProp =
        cta === undefined
            ? {
                  label: 'Ver módulos disponibles',
                  onPress: () => {
                      void Linking.openURL(`${getApiBaseUrl()}/coach/settings/modules`).catch(() => {})
                  },
              }
            : cta

    return (
        <View style={styles.wrap} accessibilityLabel="module-off-notice">
            <View
                style={[
                    styles.iconWrap,
                    {
                        backgroundColor: theme.muted,
                        borderRadius: theme.radius.xl,
                    },
                ]}
            >
                <Icon size={26} color={theme.mutedForeground} strokeWidth={2} />
            </View>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: theme.fontDisplay }]}>
                {copy.title}
            </Text>
            <Text style={[styles.description, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {copy.description}
            </Text>
            {resolvedCta ? (
                <Button label={resolvedCta.label} variant="sport" onPress={resolvedCta.onPress} style={styles.cta} />
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        gap: 14,
    },
    iconWrap: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 20,
        letterSpacing: -0.4,
        textAlign: 'center',
    },
    description: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        maxWidth: 340,
    },
    cta: {
        marginTop: 6,
    },
})
