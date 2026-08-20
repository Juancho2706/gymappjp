import 'server-only'

/**
 * Captura de eventos PostHog desde el SERVIDOR (server actions, route handlers, webhooks).
 *
 * POR QUÉ existe: todo lo instrumentado hasta hoy es cliente (`posthog-js` vía
 * `lib/posthog/provider.tsx` + `lib/posthog/events.ts`), y hay hechos que solo el servidor
 * conoce — por ejemplo que un alta por invitación terminó atribuida a un alumno que compartió
 * su entreno (`coach_client_referred`, docs/specs/workout-share F6.3). Ese evento nunca podría
 * salir del navegador del alumno nuevo: la decisión de atribuir se toma con datos que el cliente
 * no ve (y no debe ver).
 *
 * Sin `posthog-node`: un POST a `/capture/` es todo el contrato de ingesta y evita sumar una
 * dependencia con cola/flush propios en el runtime de Vercel.
 *
 * Notas de configuración:
 * - `NEXT_PUBLIC_POSTHOG_TOKEN` es la project API key PÚBLICA — es la credencial correcta para
 *   ingestar (write-only por diseño); acá no se usa ninguna personal API key.
 * - El host va DIRECTO (`NEXT_PUBLIC_POSTHOG_HOST` o us.i.posthog.com), nunca por el rewrite
 *   `/ph`: ese proxy existe para esquivar bloqueadores en el navegador y desde el server sería
 *   un salto de red extra contra nuestro propio dominio.
 * - Sin token ⇒ no-op silencioso (previews/local sin analytics).
 *
 * Consentimiento (Ley 21.719): esto NO reemplaza el banner del visitante. Reservado para eventos
 * de negocio del COACH (su métrica, su cuenta), sin datos de salud y sin datos personales del
 * alumno. Cualquier evento nuevo que salga por acá tiene que cumplir lo mismo.
 */

const DEFAULT_HOST = 'https://us.i.posthog.com'

/** Corto a propósito: el caller siempre está en el camino crítico de una acción de usuario. */
const TIMEOUT_MS = 1500

export type PostHogServerEventProps = Record<string, string | number | boolean | null>

export type PostHogServerEvent = {
    event: string
    /** Persona a la que se le atribuye el evento (en EVA: el `coach_id`). */
    distinctId: string
    properties?: PostHogServerEventProps
}

function readToken(): string | undefined {
    // TOKEN es el nombre en uso en el repo (ver provider.tsx); KEY queda como alias por si el
    // proyecto de Vercel lo tiene con el nombre de la doc de PostHog.
    return process.env.NEXT_PUBLIC_POSTHOG_TOKEN || process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined
}

function readHost(): string {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST
    return host.replace(/\/+$/, '')
}

export function isPostHogServerCaptureConfigured(): boolean {
    return Boolean(readToken())
}

/**
 * Best-effort: NUNCA lanza y NUNCA bloquea más de `TIMEOUT_MS`. Perder un evento de analytics es
 * aceptable; romper (o demorar) la acción que lo dispara, no.
 */
export async function capturePostHogServerEvent(input: PostHogServerEvent): Promise<void> {
    const token = readToken()
    if (!token || !input.distinctId) return

    try {
        const response = await fetch(`${readHost()}/capture/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: token,
                event: input.event,
                distinct_id: input.distinctId,
                properties: { ...input.properties, $lib: 'eva-web-server' },
                timestamp: new Date().toISOString(),
            }),
            cache: 'no-store',
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })

        if (!response.ok) {
            console.warn('[posthog-server] rechazado', input.event, response.status)
        }
    } catch (error) {
        console.warn('[posthog-server] no se pudo enviar', input.event, error)
    }
}
