'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import {
    Palette,
    CreditCard,
    LayoutGrid,
    SlidersHorizontal,
    LayoutList,
    Upload,
    Moon,
    LifeBuoy,
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
    | 'soporte'
    | 'eliminar'

interface Cat {
    id: SettingsSectionId | 'importar'
    label: string
    icon: LucideIcon
    group: string
    danger?: boolean
    /** Ítem navegable: la ruta ya existe como página propia, no se embebe como pane.
     *  Se renderiza como <Link> (sale de la SettingsShell) en vez de botón que setea `sel`. */
    href?: string
}

// Orden + agrupación espejo de DesktopOpciones (CATS). El label del rail es también el
// título del pane (dt-set-panehd), como en el mock.
const CATS: Cat[] = [
    { id: 'marca', label: 'Mi Marca', icon: Palette, group: 'Cuenta' },
    { id: 'suscripcion', label: 'Suscripción', icon: CreditCard, group: 'Cuenta' },
    { id: 'modulos', label: 'Módulos', icon: LayoutGrid, group: 'Entrenamiento' },
    { id: 'funciones', label: 'Funciones', icon: SlidersHorizontal, group: 'Entrenamiento' },
    { id: 'areas', label: 'Áreas del builder', icon: LayoutList, group: 'Entrenamiento' },
    { id: 'importar', label: 'Importar alumnos', icon: Upload, group: 'Entrenamiento', href: '/coach/clients/import' },
    { id: 'apariencia', label: 'Apariencia', icon: Moon, group: 'Preferencias' },
    { id: 'soporte', label: 'Soporte', icon: LifeBuoy, group: 'Ayuda' },
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
    // en algún contexto de team sin gestión). Los ítems navegables (href) siempre se muestran:
    // apuntan a rutas propias que ya existen.
    const cats = CATS.filter((c) => c.href != null || sections[c.id as SettingsSectionId] != null)
    const firstId = (cats.find((c) => c.href == null)?.id ?? 'marca') as SettingsSectionId
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
                                        // Ítem navegable (ruta propia): Link, nunca queda "activo"
                                        // en el rail porque saca al coach de la SettingsShell.
                                        if (c.href) {
                                            return (
                                                <Link
                                                    key={c.id}
                                                    href={c.href}
                                                    className="dt-set-railitem"
                                                    data-active="0"
                                                    data-danger={c.danger ? '1' : '0'}
                                                >
                                                    <span className="dt-set-railico">
                                                        <Icon size={18} />
                                                    </span>
                                                    <span>{c.label}</span>
                                                </Link>
                                            )
                                        }
                                        const id = c.id as SettingsSectionId
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="dt-set-railitem"
                                                data-active={sel === id ? '1' : '0'}
                                                data-danger={c.danger ? '1' : '0'}
                                                onClick={() => setSel(id)}
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
