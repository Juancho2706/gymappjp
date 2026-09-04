'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { WifiOff } from 'lucide-react'
import { ThemedLogo } from '@/components/brand/ThemedLogo'

interface Props {
    brandName: string
    logoUrl?: string
    /** Logo modo oscuro del coach/team; cae al claro si no existe. */
    logoUrlDark?: string
    primaryColor: string
}

export function OfflineScreen({ brandName, logoUrl, logoUrlDark, primaryColor }: Props) {
    return (
        // z-[10100]: desde que el overlay deja de REEMPLAZAR al árbol (ver NetworkProvider), tiene
        // que taparlo entero — incluidas las pantallas full-screen del ejecutor (z-[9999]) y los
        // modales de compartir portaleados a body (z-[10000]). Con el z-[200] viejo, un alumno sin
        // red parado en el resumen del entreno no veía ningún aviso.
        // `role="alert"`: el fondo queda aria-hidden, así que sin esto un lector de pantalla no
        // anuncia NADA al caerse la red (antes el remonte del árbol lo forzaba de rebote).
        <div role="alert" className="fixed inset-0 z-[10100] flex flex-col items-center justify-center bg-background p-6 text-center">
            {/* Ambient glow */}
            <div
                className="fixed inset-0 pointer-events-none opacity-10"
                style={{
                    background: `radial-gradient(ellipse 60% 50% at 50% 40%, ${primaryColor}, transparent)`,
                }}
            />

            <div className="relative z-10 flex flex-col items-center gap-5">
                {logoUrl ? (
                    <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-border/50 shadow-lg">
                        <ThemedLogo light={logoUrl} dark={logoUrlDark} alt={brandName} fill sizes="80px" className="object-contain p-2" />
                    </div>
                ) : (
                    <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg"
                        style={{ backgroundColor: primaryColor }}
                    >
                        {brandName.charAt(0)}
                    </div>
                )}

                <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <WifiOff className="w-5 h-5" />
                        <span className="text-sm font-medium">Sin conexión</span>
                    </div>
                    <h2 className="text-lg font-bold text-foreground">
                        No puedes entrenar sin internet
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-[260px]">
                        Verifica tu conexión para seguir entrenando con{' '}
                        <span className="font-semibold" style={{ color: primaryColor }}>
                            {brandName}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    )
}

/**
 * Provider que envuelve la app del alumno y SUPERPONE OfflineScreen cuando no hay red.
 *
 * B2 (QA 02-09): antes hacía `return <OfflineScreen/>` en vez de `{children}`, o sea DESMONTABA el
 * árbol entero del alumno. Un corte de red a mitad del check-in mataba el estado local del form
 * (peso, notas, energía y los `File` de las fotos) y al volver la red remontaba en el paso 1 en
 * blanco; el manejo de error de red del propio form («No pudimos enviar / Reintentar») era
 * literalmente inalcanzable. Ahora `{children}` se renderiza SIEMPRE y el overlay va encima:
 * ningún componente pierde su estado por un corte de red.
 *
 * Excepción del ejecutor de entrenamiento: ahí el overlay NO se muestra. La cola offline del
 * entreno escribe en localStorage ANTES de tocar la red (write-through, sin TTL, idempotente por
 * bloque/serie/día) y el propio ejecutor ya avisa con un chip discreto «Sin señal — guardando en
 * tu teléfono» que no bloquea nada (WorkoutExecutionClient.tsx:2795). Taparlo con la pantalla
 * completa le prohibía al alumno algo que la app soporta perfecto: en la app RN el mismo alumno
 * entrena sin señal, y esta es la paridad que faltaba en la web.
 *
 * `basePath` viene por prop y NO de `useBasePath()` a propósito: este provider vive POR FUERA de
 * `<BasePathProvider>` (ver el layout de /c/[coach_slug]), así que el hook devolvería el fallback
 * vacío. Comparar contra el base path — y no contra un regex de `/c/...` — es lo que hace que la
 * excepción valga igual bajo los prefijos reescritos por el proxy (/e/[org_slug], /t/...).
 */
export function NetworkProvider({ children, brandName, logoUrl, logoUrlDark, primaryColor, basePath }: Props & { children: React.ReactNode; basePath: string }) {
    const [isOnline, setIsOnline] = useState(true)
    // `usePathname()` puede venir null en bordes del App Router: sin ruta no asumimos ejecutor.
    const pathname = usePathname()
    const enEjecutor = pathname != null && pathname.startsWith(`${basePath}/workout/`)
    const bloqueando = !isOnline && !enEjecutor

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        setIsOnline(navigator.onLine)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    return (
        <>
            {/* `contents` = este div NO genera caja: el nav y el <main> siguen siendo hijos flex
                DIRECTOS del shell de /c (sin esto se rompe el sidebar desktop). Existe solo para
                colgarle `aria-hidden` + `inert` mientras el overlay está arriba: nada de atrás
                recibe foco ni clicks, pero sigue montado con su estado intacto. */}
            <div
                className="contents"
                data-offline-backdrop={bloqueando ? 'true' : undefined}
                aria-hidden={bloqueando ? true : undefined}
                inert={bloqueando}
            >
                {children}
            </div>
            {bloqueando && (
                <OfflineScreen brandName={brandName} logoUrl={logoUrl} logoUrlDark={logoUrlDark} primaryColor={primaryColor} />
            )}
        </>
    )
}
