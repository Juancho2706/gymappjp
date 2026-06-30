'use client'

import { createContext, useContext, useState } from 'react'

export type RosterMode = 'ficha' | 'tabla'

interface RosterViewContextValue {
    /** Vista de nivel superior del directorio de Alumnos (solo desktop). */
    mode: RosterMode
    setMode: (m: RosterMode) => void
    /**
     * `true` solo mientras la pantalla `/coach/clients` está montada. El topbar
     * (`CoachTopBar`) usa esto para mostrar el toggle Tabla/Ficha junto a la búsqueda
     * únicamente en esa pantalla.
     */
    active: boolean
    setActive: (a: boolean) => void
}

/**
 * Puente entre el TOPBAR (vive en el layout `/coach`) y la pantalla `/coach/clients`
 * (vive en `children`). Permite que el toggle Tabla/Ficha del diseño (`.dt-viewtoggle`,
 * slot `viewToggle` del DesktopTopBar) se renderice en la barra superior mientras el
 * estado real de la vista vive en la pantalla de Alumnos.
 */
const RosterViewContext = createContext<RosterViewContextValue | null>(null)

export function useRosterView(): RosterViewContextValue {
    const ctx = useContext(RosterViewContext)
    if (!ctx) {
        throw new Error('useRosterView must be used within a RosterViewProvider')
    }
    return ctx
}

export function RosterViewProvider({ children }: { children: React.ReactNode }) {
    // Default = ficha (master-detail), como el diseño.
    const [mode, setMode] = useState<RosterMode>('ficha')
    const [active, setActive] = useState(false)
    return (
        <RosterViewContext.Provider value={{ mode, setMode, active, setActive }}>
            {children}
        </RosterViewContext.Provider>
    )
}
