import { StyleSheet, Text, View } from 'react-native'
import { HeartPulse, Activity, Ruler, Apple, type LucideIcon } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../context/ThemeContext'
import { Button } from './Button'
import type { ModuleKey } from '../lib/entitlements-core'

/**
 * ModuleOffNotice (RN) — port del aviso web `components/coach/ModuleOffNotice.tsx`. Se muestra
 * cuando se navega a una superficie de un modulo APAGADO por el OPERADOR (kill-switch
 * `EVA_DISABLED_MODULES`) o porque el acceso de la cuenta esta inactivo. Copy verbatim de la web
 * por las 4 superficies (cardio, movement, body_composition, nutrition_exchanges).
 *
 * NO es un gate de plan (regla del owner 2026-08-31: todo esta en todos los planes, solo se cobra
 * el cupo de alumnos). El copy es de MANTENIMIENTO: no habla de planes ni de cobros, y no ofrece
 * ninguna accion de compra — eso ademas lo deja del lado seguro del anti-steering (Apple 3.1.1 /
 * politica de pagos de Google): aca adentro no hay ningun camino a pagar.
 *
 * La PREFERENCIA del coach (dominio que el mismo apago en «Opciones › Mi panel») la cubre
 * `components/coach/DomainOffNotice.tsx`, que vive al lado y se evalua ANTES que este aviso.
 */

type ModuleCopy = { icon: LucideIcon; title: string; description: string }

const MODULE_COPY: Record<ModuleKey, ModuleCopy> = {
    cardio: {
        icon: HeartPulse,
        title: 'Cardio temporalmente no disponible',
        description:
            'Las zonas de frecuencia cardiaca, la calculadora de pace y las plantillas de intervalos no están disponibles en este momento.',
    },
    movement_assessment: {
        icon: Activity,
        title: 'Evaluación de movimiento temporalmente no disponible',
        description:
            'El screening de movilidad y los patrones de movimiento para personalizar la prescripción no están disponibles en este momento.',
    },
    body_composition: {
        icon: Ruler,
        title: 'Composición corporal temporalmente no disponible',
        description:
            'La antropometría y la composición corporal (protocolo ISAK completo) no están disponibles en este momento.',
    },
    nutrition_exchanges: {
        icon: Apple,
        title: 'Nutrición Pro temporalmente no disponible',
        description:
            'Las pautas por intercambios, las plantillas reutilizables, los objetivos por composición corporal y el PDF con tu marca no están disponibles en este momento.',
    },
}

type CtaProp = { label: string; onPress: () => void } | null

export function ModuleOffNotice({
    moduleKey,
    cta,
}: {
    moduleKey: ModuleKey
    /**
     * CTA override. `undefined` => default: aviso de mantenimiento + boton secundario «Volver»
     * (vuelve a la pantalla anterior). `null` => sin boton (p. ej. la vista del alumno).
     */
    cta?: CtaProp
}) {
    const { theme } = useTheme()
    const router = useRouter()
    const copy = MODULE_COPY[moduleKey]
    const Icon = copy.icon

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
            {cta === undefined ? (
                <>
                    <Text style={[styles.description, { color: theme.foreground, fontFamily: theme.fontSans, fontWeight: '600' }]}>
                        Estamos haciendo mantenimiento en esta función. Tus datos están a salvo; vuelve a intentarlo más tarde.
                    </Text>
                    <Button label="Volver" variant="secondary" onPress={() => router.back()} style={styles.cta} />
                </>
            ) : cta ? (
                <Button label={cta.label} variant="sport" onPress={cta.onPress} style={styles.cta} />
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
