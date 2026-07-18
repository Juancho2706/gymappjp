import Link from 'next/link'
import { HeartPulse, Activity, Ruler, Apple, type LucideIcon } from 'lucide-react'
import type { ModuleKey } from '@/services/entitlements.service'

/**
 * ModuleOffNotice — aviso amable cuando un coach navega DIRECTO a la URL de un módulo
 * que NO tiene habilitado. Estandariza el bloque que antes vivía inline en cardio/page.tsx
 * y lo aplica a las 4 superficies (cardio, movement, body_composition, nutrition_exchanges).
 *
 * Decisión CEO 2026-07-17: los módulos vienen INCLUIDOS con cualquier plan pago, así que
 * este aviso solo lo ve un coach en plan Free. Reglas (anti-hostigamiento):
 *   - mensaje NEUTRO, sin urgencia ni precio (los módulos ya no se venden por separado).
 *   - CTA ÚNICO al upgrade de suscripción `/coach/subscription` (flujo de planes existente).
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
        title: 'El módulo Nutrición Pro no está habilitado',
        description:
            'Las pautas por intercambios, los planes híbridos con franjas y libertad de registro, las variantes de día, los micronutrientes avanzados y las notas clínicas privadas y de protocolo son parte del módulo Nutrición Pro.',
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
                Este módulo viene incluido en cualquier plan pago de EVA.
            </p>
            <Link
                href="/coach/subscription"
                className="flex min-h-12 items-center gap-2 rounded-control bg-[var(--cta-fill)] px-[18px] text-[15px] font-bold text-[var(--text-on-sport)] shadow-[var(--shadow-sm)] transition-all hover:opacity-90 active:scale-[0.97]"
            >
                Ver planes
            </Link>
        </div>
    )
}
