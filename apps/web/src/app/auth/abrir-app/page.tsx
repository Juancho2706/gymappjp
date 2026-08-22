import type { Metadata } from 'next'
import { AbrirAppClient } from './AbrirAppClient'
import { resolveAbrirAppParams } from './_lib/params'

/** App Store id de EVA (ficha del titular, `apps/mobile`). */
const IOS_APP_ID = '6770426633'

export const metadata: Metadata = {
    title: 'Correo confirmado',
    description: 'Vuelve a la app de EVA para entrar a tu panel.',
    // Página transaccional con el correo del coach en la query: nunca en un índice.
    robots: { index: false, follow: false },
    /**
     * Smart App Banner de Safari (`<meta name="apple-itunes-app">`): la red de seguridad para el
     * coach cuyo scheme no prende —o que borró la app— sin un solo texto de precios ni de planes
     * (regla de tiendas). Con la app instalada el banner dice «Abrir»; sin ella, lleva a la ficha.
     */
    itunes: { appId: IOS_APP_ID, appArgument: 'https://www.eva-app.cl/auth/abrir-app' },
}

interface AbrirAppPageProps {
    searchParams: Promise<{ email?: string; next?: string }>
}

/**
 * `/auth/abrir-app` — el aterrizaje iOS de `/auth/confirm?src=app` (ver el docblock de esa ruta).
 * Solo traduce el query a las dos URLs de la pantalla; toda la lógica vive en `_lib/params.ts`.
 */
export default async function AbrirAppPage({ searchParams }: AbrirAppPageProps) {
    const { deepLink, webNext, email } = resolveAbrirAppParams(await searchParams)

    return <AbrirAppClient deepLink={deepLink} webNext={webNext} email={email} />
}
