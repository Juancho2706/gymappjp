'use client'

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
    LogOut,
    Loader2,
    type LucideIcon,
} from 'lucide-react'
import { useCoachSignOut } from './CoachSignOut'
import { ImportPane } from './ImportPane'

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

// Id de pane: las secciones que arma la page (SettingsSectionId, contenido en `sections[id]`)
// + 'importar', pane con contenido PROPIO embebido (ImportPane, no viene de `sections`).
type PaneId = SettingsSectionId | 'importar'

interface Cat {
    id: PaneId
    label: string
    icon: LucideIcon
    group: string
    danger?: boolean
    /** Pane con contenido propio embebido (no `sections[id]`): hoy solo 'importar' (ImportPane,
     *  patrón SubscriptionContent). Se muestra siempre en el rail y se comporta como el resto
     *  (botón que setea `sel`, sin navegación de página / doble back). */
    local?: boolean
}

// Orden + agrupación espejo de DesktopOpciones (CATS). El label del rail es también el
// título del pane (dt-set-panehd), como en el mock.
const CATS: Cat[] = [
    { id: 'marca', label: 'Mi Marca', icon: Palette, group: 'Cuenta' },
    { id: 'suscripcion', label: 'Suscripción', icon: CreditCard, group: 'Cuenta' },
    { id: 'modulos', label: 'Módulos', icon: LayoutGrid, group: 'Entrenamiento' },
    { id: 'funciones', label: 'Funciones', icon: SlidersHorizontal, group: 'Entrenamiento' },
    { id: 'areas', label: 'Áreas del builder', icon: LayoutList, group: 'Entrenamiento' },
    { id: 'importar', label: 'Importar alumnos', icon: Upload, group: 'Entrenamiento', local: true },
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
    // en algún contexto de team sin gestión). Los panes `local` (importar) siempre se muestran:
    // traen su propio contenido embebido (ImportPane), no dependen de `sections`.
    const cats = CATS.filter((c) => c.local || sections[c.id as SettingsSectionId] != null)
    const firstId = (cats[0]?.id ?? 'marca') as PaneId
    const [sel, setSel] = useState<PaneId>(
        sections[initial] != null ? initial : firstId,
    )

    const groups: string[] = []
    cats.forEach((c) => {
        if (!groups.includes(c.group)) groups.push(c.group)
    })
    const active = cats.find((c) => c.id === sel) ?? cats[0]
    const { signOut, pending: signOutPending } = useCoachSignOut()

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
                        {/* Sesión — cierre de sesión (acción, no navegación ni pane).
                            Tono neutro: la acción destructiva/roja es "Eliminar cuenta". */}
                        <div className="dt-set-railgrp">
                            <div className="dt-set-raillbl">Sesión</div>
                            <button
                                type="button"
                                className="dt-set-railitem"
                                data-active="0"
                                data-danger="0"
                                onClick={signOut}
                                disabled={signOutPending}
                                aria-label="Cerrar sesión"
                            >
                                <span className="dt-set-railico">
                                    {signOutPending ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
                                </span>
                                <span>Cerrar sesión</span>
                            </button>
                        </div>
                    </div>
                </aside>

                {/* key={sel} → re-mount con fade, espejo del `<section key={sel}>` del mock. */}
                <section key={sel} className="dt-set-pane animate-fade-in">
                    {active && <div className="dt-set-panehd">{active.label}</div>}
                    {/* 'importar' es un pane local (contenido propio embebido); el resto viene de `sections`. */}
                    {sel === 'importar' ? <ImportPane /> : sections[sel as SettingsSectionId]}
                </section>
            </div>
        </div>
    )
}
