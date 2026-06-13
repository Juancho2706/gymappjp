import Link from 'next/link'
import { HeartPulse, Activity, Ruler, Apple, type LucideIcon } from 'lucide-react'
import type { ModuleKey } from '@/services/entitlements.service'

/**
 * ModuleOffNotice — aviso amable cuando un coach navega DIRECTO a la URL de un módulo
 * que NO tiene habilitado (plan 05 F5.7). Estandariza el bloque que antes vivía inline en
 * cardio/page.tsx y lo aplica a las 4 superficies (cardio, movement, body_composition,
 * nutrition_exchanges).
 *
 * Reglas (doc fuente §2.6 — anti-hostigamiento):
 *   - mensaje NEUTRO, sin urgencia ni precio (el precio vive en las 2 superficies de venta:
 *     el catálogo Settings > Módulos y la sección Add-ons de /coach/subscription).
 *   - CTA ÚNICO al catálogo `/coach/settings/modules` (que sí muestra disponibilidad/precio).
 *   - SOLO aparece si el coach llegó por una URL directa a un módulo apagado (no es un banner).
 *
 * Server component (sin estado). Dark mode incluido.
 */

type ModuleCopy = {
    icon: LucideIcon
    title: string
    description: string
}

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
        title: 'El módulo Nutrición por intercambios no está habilitado',
        description:
            'Las pautas de nutrición por porciones de intercambio con equivalencias y PDF con tu marca son parte del módulo Nutrición por intercambios.',
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
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground dark:bg-white/5">
                <Icon className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold text-foreground">{copy.title}</h1>
            <p className="text-sm text-muted-foreground">{copy.description}</p>
            <Link
                href="/coach/settings/modules"
                className="flex min-h-[44px] items-center rounded-xl bg-primary px-6 text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90"
            >
                Ver módulos disponibles
            </Link>
        </div>
    )
}
