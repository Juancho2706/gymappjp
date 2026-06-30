'use client'

import { useState, type ReactNode } from 'react'
import {
    Palette,
    CreditCard,
    Package,
    SlidersHorizontal,
    LayoutList,
    Moon,
    Trash2,
    type LucideIcon,
} from 'lucide-react'

/**
 * Opciones (coach) · desktop 2-panel — SettingsShell 1:1 con `DesktopOpciones`
 * (docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx + .dt-set-* del index.html).
 *
 * Rail izquierdo de secciones agrupadas + panel derecho que renderiza EMBEBIDA la sección
 * activa (sin doble back / sin navegación de página). El contenido de cada panel lo arma la
 * page (RSC) con los componentes REALES (BrandStudio, ModulesForm, FeaturePrefsPanel,
 * AreasManager, ThemeToggleCard, DangerZone) y se pasa acá como slots `sections[id]`.
 *
 * Solo se monta en md+ (`hidden md:block` en la page); <760px usa el hub móvil verbatim.
 */
export type SettingsSectionId =
    | 'marca'
    | 'suscripcion'
    | 'modulos'
    | 'funciones'
    | 'areas'
    | 'apariencia'
    | 'eliminar'

interface Cat {
    id: SettingsSectionId
    label: string
    icon: LucideIcon
    group: string
    danger?: boolean
}

// Orden + agrupación espejo de DesktopOpciones (CATS). El label del rail es también el
// título del pane (dt-set-panehd), como en el mock.
const CATS: Cat[] = [
    { id: 'marca', label: 'Mi Marca', icon: Palette, group: 'Cuenta' },
    { id: 'suscripcion', label: 'Suscripción', icon: CreditCard, group: 'Cuenta' },
    { id: 'modulos', label: 'Módulos', icon: Package, group: 'Entrenamiento' },
    { id: 'funciones', label: 'Funciones', icon: SlidersHorizontal, group: 'Entrenamiento' },
    { id: 'areas', label: 'Áreas del builder', icon: LayoutList, group: 'Entrenamiento' },
    { id: 'apariencia', label: 'Apariencia', icon: Moon, group: 'Preferencias' },
    { id: 'eliminar', label: 'Eliminar cuenta', icon: Trash2, group: 'Ayuda', danger: true },
]

export function CoachSettingsDesktop({
    sections,
    initial = 'marca',
}: {
    sections: Partial<Record<SettingsSectionId, ReactNode>>
    initial?: SettingsSectionId
}) {
    // Solo las secciones con contenido disponible (ej. funciones/áreas pueden venir vacías
    // en algún contexto de team sin gestión).
    const cats = CATS.filter((c) => sections[c.id] != null)
    const firstId = cats[0]?.id ?? 'marca'
    const [sel, setSel] = useState<SettingsSectionId>(
        sections[initial] != null ? initial : firstId,
    )

    const groups: string[] = []
    cats.forEach((c) => {
        if (!groups.includes(c.group)) groups.push(c.group)
    })
    const active = cats.find((c) => c.id === sel) ?? cats[0]

    return (
        <div className="dt-settings-host">
            <div className="dt-settings">
                <aside className="dt-set-rail">
                    <div className="dt-set-railhd">Opciones</div>
                    <div className="dt-set-railscroll">
                        {groups.map((g) => (
                            <div key={g} className="dt-set-railgrp">
                                <div className="dt-set-raillbl">{g}</div>
                                {cats
                                    .filter((c) => c.group === g)
                                    .map((c) => {
                                        const Icon = c.icon
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="dt-set-railitem"
                                                data-active={sel === c.id ? '1' : '0'}
                                                data-danger={c.danger ? '1' : '0'}
                                                onClick={() => setSel(c.id)}
                                            >
                                                <span className="dt-set-railico">
                                                    <Icon size={18} />
                                                </span>
                                                <span>{c.label}</span>
                                            </button>
                                        )
                                    })}
                            </div>
                        ))}
                    </div>
                </aside>

                {/* key={sel} → re-mount con fade, espejo del `<section key={sel}>` del mock. */}
                <section key={sel} className="dt-set-pane animate-fade-in">
                    {active && <div className="dt-set-panehd">{active.label}</div>}
                    {sections[sel]}
                </section>
            </div>
        </div>
    )
}
