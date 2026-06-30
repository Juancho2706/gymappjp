import Image from 'next/image'
import { Dumbbell, Utensils, TrendingUp } from 'lucide-react'
import { LANDING_LOGO_LIGHT_MARK } from '@/lib/brand-assets'

/**
 * Panel de marca del flujo de acceso (login / registro) — transcripción 1:1 de
 * `.dt-auth2-brand` (eva-desktop/desktop-shell.jsx → DesktopAuthShell + index.html).
 *
 * Solo visible en desktop (≥ md = 760px). A móvil el flujo de acceso es una sola
 * columna (el panel se oculta) — paridad exacta con la app móvil.
 */

const FEATURES = [
    { icon: Dumbbell, label: 'Programas de entrenamiento a medida' },
    { icon: Utensils, label: 'Nutrición, macros y adherencia' },
    { icon: TrendingUp, label: 'Progreso, check-ins y records' },
] as const

export function AuthBrandPanel() {
    return (
        <div
            className="relative hidden min-w-0 flex-1 items-center justify-center overflow-hidden p-14 text-white md:flex"
            style={{
                background:
                    'radial-gradient(135% 110% at 18% 8%, var(--sport-500) 0%, var(--sport-600) 50%, var(--sport-700) 100%)',
            }}
        >
            <div className="relative z-[1] max-w-[440px]">
                <Image
                    src={LANDING_LOGO_LIGHT_MARK}
                    alt="EVA"
                    width={120}
                    height={46}
                    priority
                    className="mb-[34px] h-[46px] w-auto object-contain brightness-0 invert drop-shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
                />
                <h2 className="m-0 text-balance font-display text-[38px] font-black leading-[1.06] tracking-[-0.03em]">
                    Tu entrenamiento, llevado como un profesional.
                </h2>
                <p className="mt-4 max-w-[400px] text-base leading-[1.55] text-white/85">
                    Planes de entrenamiento y nutrición, progreso real y tu propia marca — todo en EVA.
                </p>
                <div className="mt-[34px] flex flex-col gap-[14px]">
                    {FEATURES.map(({ icon: Icon, label }) => (
                        <div
                            key={label}
                            className="flex items-center gap-[13px] text-[15px] font-semibold"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white/[0.16]">
                                <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                            </span>
                            {label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
