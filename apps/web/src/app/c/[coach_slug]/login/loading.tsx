/**
 * Fallback de streaming del LOGIN del alumno — deliberadamente SIN marca.
 *
 * Antes montaba `BrandClientLoadingShell`, así que entrar a `/c/<slug>/login` desde el celular
 * mostraba PRIMERO una pantalla de carga con el wordmark del coach pintado con su color, y recién
 * después el formulario (reporte del owner 2026-09-02: «loader naranja» en `/c/josefit/login`).
 *
 * Criterio (espejo de la app RN): el splash/loader de marca pertenece a las superficies YA
 * autenticadas — en RN lo pinta `components/entry/SplashGate` (cold start CON sesión viva) y
 * `components/entry/DashboardSplashOverlay` (encima del dashboard hasta que hay datos); la
 * pantalla de login (`app/(auth)/login.tsx`) nunca se cubre con él. Acá pasa igual: el resto del
 * árbol `/c` conserva su `BrandClientLoadingShell`; el login se queda con la superficie desnuda,
 * que es exactamente el fondo sobre el que aparece el formulario ⇒ cero parpadeo de identidad.
 */
export default function LoginLoading() {
    return (
        <div className="min-h-dvh w-full bg-surface-app" data-testid="login-loading">
            <span className="sr-only">Cargando…</span>
        </div>
    )
}
