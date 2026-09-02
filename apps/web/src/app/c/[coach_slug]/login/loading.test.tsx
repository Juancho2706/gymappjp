import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import LoginLoading from './loading'

/**
 * El login del alumno NO se cubre con el splash/loader de marca (owner 2026-09-02: entrar a
 * `/c/josefit/login` mostraba primero una pantalla de carga con el color del coach). Criterio
 * espejado de RN: el splash de marca vive en la entrada CON sesión (`SplashGate`) y encima del
 * dashboard (`DashboardSplashOverlay`), nunca antes del formulario de login.
 */
describe('loading del login del alumno', () => {
    it('no pinta marca: ni wordmark, ni logo, ni texto visible', () => {
        const { container } = render(<LoginLoading />)

        expect(container.querySelector('img')).toBeNull()
        expect(screen.queryByText(/EVA/i)).toBeNull()
        // Lo único que se anuncia es el estado de carga, y solo para lectores de pantalla.
        expect(container.textContent?.trim()).toBe('Cargando…')
        expect(container.querySelector('.sr-only')?.textContent).toBe('Cargando…')
    })

    // La prohibicion de montar `BrandClientLoadingShell` / `ClientLoadingShell` /
    // `EvaRouteLoader` en este archivo ya no se afirma leyendo el fuente como texto:
    // vive en la regla eslint `local/student-login-loading-unbranded`
    // (tools/eslint-rules/), que corre en `pnpm lint` sobre `loading.tsx`.
})
