import Link from 'next/link'
import { HeartPulse, Activity, Ruler, Apple, type LucideIcon } from 'lucide-react'
import type { ModuleKey } from '@/services/entitlements.service'

/**
 * ModuleOffNotice — aviso que se muestra cuando se navega a la URL de un módulo que está APAGADO
 * por el OPERADOR (kill-switch `EVA_DISABLED_MODULES`) o porque el acceso de la cuenta está
 * inactivo. Cubre las 4 superficies (cardio, movement, body_composition, nutrition_exchanges).
 *
 * NO es un gate de plan (regla del owner 2026-08-31: todo está en todos los planes, solo se cobra
 * el cupo de alumnos). Por eso el copy es de MANTENIMIENTO: no habla de planes, de cobros ni de
 * mejorar la cuenta, y no ofrece ninguna acción de compra. La única salida es volver al inicio.
 *
 * La PREFERENCIA del coach (dominio apagado por él mismo en Opciones › Mi panel) la cubre
 * `DomainOffNotice`, que vive al lado y se evalúa ANTES que este aviso.
 *
 * Server component (sin estado), con soporte de dark mode.
 */

type ModuleCopy = {
    icon: LucideIcon
    title: string
    description: string
}

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
            'Las pautas por intercambios, los planes híbridos con franjas y libertad de registro, las variantes de día, el historial completo y las notas clínicas privadas y de protocolo no están disponibles en este momento.',
    },
}

export function ModuleOffNotice({ moduleKey }: { moduleKey: ModuleKey }) {
    const copy = MODULE_COPY[moduleKey]
    const Icon = copy.icon

    return (
        <div
            data-testid="module-off-notice"
            className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center"
        >
            <div className="flex size-12 items-center justify-center rounded-[14px] bg-surface-sunken text-subtle">
                <Icon className="size-6" />
            </div>
            <h1 className="font-display text-xl font-extrabold tracking-[-0.02em] text-strong">{copy.title}</h1>
            <p className="text-sm text-muted">{copy.description}</p>
            <p className="text-sm font-semibold text-strong">
                Estamos haciendo mantenimiento en esta función. Tus datos están a salvo; vuelve a intentarlo más
                tarde.
            </p>
            <Link
                href="/coach/dashboard"
                className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-[18px] text-[15px] font-bold text-strong transition-colors hover:bg-surface-sunken active:scale-[0.97]"
            >
                Volver al inicio
            </Link>
        </div>
    )
}
