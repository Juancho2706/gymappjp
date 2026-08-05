'use client'

import { useEffect } from 'react'

/**
 * Shell dark del panel CEO sobre EVA DS (F1 rework 08-05).
 *
 * Antes: ThemeProvider anidado (carrera con el provider raiz) + 13 hex `--admin-*` en un
 * <style> inline con sintaxis Tailwind v3 muerta. Ahora: la clase `dark` de EVA DS en el
 * wrapper flipea TODOS los tokens del design system para el subtree (globals.css define
 * `.dark { --surface-app: ... }` y el custom-variant `dark` matchea por ancestro).
 *
 * El useEffect replica la clase en <html> porque los portales Radix (Sheet/Select/Popover)
 * montan en document.body, FUERA del wrapper — sin esto quedarian con tokens claros.
 * Se restaura al salir solo si nosotros la agregamos (no pisar el tema real del usuario).
 */
export function AdminDarkWrapper({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const root = document.documentElement
        const added = !root.classList.contains('dark')
        if (added) root.classList.add('dark')
        return () => {
            if (added) root.classList.remove('dark')
        }
    }, [])

    return (
        <div className="dark admin-shell" style={{ colorScheme: 'dark' }}>
            {children}
        </div>
    )
}
