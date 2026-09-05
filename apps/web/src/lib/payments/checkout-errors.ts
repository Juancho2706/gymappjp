/**
 * Copy HUMANO para los fallos del checkout (P1, ola de monetización 25-08).
 *
 * El 25-08 un coach real (jesus-coach) vio esto en el banner rojo de `/coach/subscription`,
 * literal, porque el server devolvía `{ error: message }` con el texto crudo del provider:
 *
 *   MercadoPago subscription creation failed (400) [x-request-id: cfb8b64f-5359-…]:
 *   {"message":"Payer is associated with a different site","code":"guest_site_mismatch","status":400}
 *
 * Un JSON con un x-request-id no es un mensaje: no dice qué pasó, no dice qué hacer y quema el
 * único intento de pago que ese coach iba a hacer. Este módulo traduce los códigos que el server
 * ya devuelve a un mensaje accionable + las salidas concretas (reintentar / otro medio / escribirnos).
 *
 * Reglas:
 * - Los códigos de negocio que YA tenían un mensaje humano del server (OVER_CAPACITY,
 *   NUTRITION_ADDON_ON_DOWNGRADE, …) CONSERVAN ese mensaje: lo escribe el server porque lleva
 *   los números reales (N alumnos / M de cupo). Acá solo se les da forma y salidas.
 * - Lo desconocido NUNCA se pinta crudo: mensaje genérico digno + escribirnos. El texto técnico
 *   sigue existiendo en Sentry y en los logs de Vercel, que es donde sirve.
 * - Este módulo es PURO (sin React, sin fetch): la UI decide cómo pintar las acciones.
 */

/** Buzón de soporte del producto (mismo que SupportPane / HelpCenter). */
export const CHECKOUT_SUPPORT_EMAIL = 'contacto@eva-app.cl'

/**
 * Código canónico del rechazo de MercadoPago cuando el email del pagador resuelve a una cuenta
 * MP de otro site (país) distinto al del cobrador (MLC/Chile). El server lo mapea desde el
 * `guest_site_mismatch` crudo del gateway; acá se acepta cualquiera de los dos.
 */
export const GATEWAY_PAYER_SITE_MISMATCH = 'GATEWAY_PAYER_SITE_MISMATCH'

/**
 * La URL de vuelta no dice qué plan se estaba contratando (retiro de Starter, S2/D2=A).
 *
 * Es el ÚNICO código que no viene del server: lo emite la propia pantalla de `processing` cuando
 * llega con `from=register` y sin un `?tier=` que exista en el catálogo. Antes se hacía el POST a
 * `create-preference` con el literal `'starter'`; hoy no se inventa un plan. Va como código de
 * NEGOCIO y `retryable: false` porque reintentar lo mismo vuelve a fallar: la salida es elegir
 * plan, y la pinta la PÁGINA (este módulo es puro y no conoce rutas).
 */
export const CHECKOUT_TIER_MISSING = 'CHECKOUT_TIER_MISSING'

/** Acción que la UI puede pintar junto al mensaje. El copy del botón vive acá, no en la pantalla. */
export type CheckoutErrorAction =
    /** Volver a pedir el checkout con el MISMO medio de pago. */
    | { kind: 'retry'; label: string }
    /** Reintentar por Webpay/Flow. Solo se emite si el caller declara que el backend lo soporta. */
    | { kind: 'try_flow'; label: string }
    /** mailto a soporte, con el código de referencia ya en el asunto. */
    | { kind: 'contact'; label: string; href: string }

export type CheckoutErrorCopy = {
    /** Código ya normalizado (el del server, o `unknown`). Sirve para telemetría y para el mailto. */
    code: string
    /** Título corto para las pantallas que tienen encabezado (processing). */
    title: string
    /** Qué pasó, en una frase, en la voz del producto. */
    message: string
    /** Segunda línea opcional: qué significa para el coach / qué hacer. */
    hint: string | null
    /** Salidas concretas, en orden de prioridad. */
    actions: CheckoutErrorAction[]
}

const RETRY_ACTION: CheckoutErrorAction = { kind: 'retry', label: 'Reintentar' }
const TRY_FLOW_ACTION: CheckoutErrorAction = { kind: 'try_flow', label: 'Probar con Webpay' }

function contactAction(code: string): CheckoutErrorAction {
    const subject = 'No pude completar el pago de mi plan EVA'
    const body = `Hola, no pude completar el pago de mi plan.\n\n---\nCódigo de referencia: ${code}`
    return {
        kind: 'contact',
        label: 'Escríbenos',
        href:
            `mailto:${CHECKOUT_SUPPORT_EMAIL}` +
            `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    }
}

/**
 * Códigos de NEGOCIO: el server ya explica el motivo con datos reales (cupo, módulos, cupón).
 * Se conserva su mensaje tal cual llega; el fallback es solo por si el server no lo mandó.
 * `retryable: false` = reintentar no cambia nada (primero hay que arreglar algo en la cuenta).
 */
const BUSINESS_CODES: Record<string, { title: string; fallback: string; retryable: boolean }> = {
    [CHECKOUT_TIER_MISSING]: {
        title: 'No sabemos qué plan estabas contratando',
        fallback: 'No pudimos saber qué plan estabas contratando.',
        retryable: false,
    },
    OVER_CAPACITY: {
        title: 'Ese plan no alcanza para tus alumnos',
        fallback: 'Ese plan tiene menos cupo que tus alumnos activos. Archiva alumnos antes de bajar de plan.',
        retryable: false,
    },
    NUTRITION_ADDON_ON_DOWNGRADE: {
        title: 'Queda un módulo activo',
        fallback: 'Quita el módulo de Nutrición por intercambios antes de bajar a ese plan.',
        retryable: false,
    },
    NET_NOT_CHARGEABLE: {
        title: 'Ese descuento no se cobra por este medio',
        fallback: 'Un descuento del 100% no se cobra por este medio; se gestiona como cortesía interna.',
        retryable: false,
    },
    FLOW_PLAN_CHANGE_UNSUPPORTED: {
        title: 'Todavía no disponible con Flow',
        fallback: 'El cambio de plan de una suscripción Flow estará disponible próximamente.',
        retryable: false,
    },
    FEATURE_DISABLED: {
        title: 'Ese medio de pago no está disponible',
        fallback: 'Ese medio de pago no está disponible por ahora.',
        retryable: false,
    },
    GATEWAY_SWITCH_PENDING: {
        title: 'No pudimos cerrar tu suscripción anterior',
        fallback: 'No pudimos cerrar tu suscripción anterior. Intenta de nuevo en unos minutos.',
        retryable: true,
    },
    GATEWAY_EMAIL_REJECTED: {
        title: 'El medio de pago rechazó tu correo',
        fallback:
            'El medio de pago no pudo validar tu correo. Verifica que el email de tu cuenta sea real y accesible.',
        retryable: true,
    },
}

/** ¿El texto crudo del gateway delata el rechazo por site del pagador? (defensa si el 500 no se mapeó). */
function looksLikePayerSiteMismatch(message: string): boolean {
    return /guest_site_mismatch/i.test(message) || /associated with a different site/i.test(message)
}

/**
 * Traduce el fallo del checkout a copy accionable.
 *
 * @param code            `payload.code` del server (o `http_<status>` cuando no vino ninguno).
 * @param message         `payload.error` del server. Se usa SOLO para los códigos de negocio y para
 *                        detectar el mismatch de site; jamás se pinta crudo en el caso desconocido.
 * @param flowAvailable   ¿El backend acepta Webpay/Flow en ESTE punto del flujo? Lo sabe el caller:
 *                        el alta (registro y free→pago) sí; el cambio de plan de un pago ACTIVO no
 *                        (el server responde 400 FLOW_PLAN_CHANGE_UNSUPPORTED). Ofrecer un botón
 *                        que revienta en el server sería peor que no ofrecerlo.
 */
export function resolveCheckoutError({
    code,
    message,
    flowAvailable = false,
}: {
    code?: string | null
    message?: string | null
    flowAvailable?: boolean
}): CheckoutErrorCopy {
    const rawCode = typeof code === 'string' ? code.trim() : ''
    const rawMessage = typeof message === 'string' ? message.trim() : ''

    const isPayerSiteMismatch =
        rawCode === GATEWAY_PAYER_SITE_MISMATCH ||
        rawCode === 'guest_site_mismatch' ||
        (rawMessage !== '' && looksLikePayerSiteMismatch(rawMessage))

    if (isPayerSiteMismatch) {
        return {
            code: GATEWAY_PAYER_SITE_MISMATCH,
            title: 'MercadoPago rechazó el cobro',
            message:
                'MercadoPago no pudo procesar tu suscripción porque tu cuenta de MP está asociada a otro país.',
            hint: 'No se te cobró nada. Puedes reintentar con otra cuenta de MercadoPago, pagar con Webpay o escribirnos y lo resolvemos contigo.',
            actions: [
                ...(flowAvailable ? [TRY_FLOW_ACTION] : []),
                RETRY_ACTION,
                contactAction(GATEWAY_PAYER_SITE_MISMATCH),
            ],
        }
    }

    const business = BUSINESS_CODES[rawCode]
    if (business) {
        return {
            code: rawCode,
            title: business.title,
            // El mensaje del server GANA: lleva los números reales del caso (cupo, módulos, monto).
            message: rawMessage !== '' ? rawMessage : business.fallback,
            hint: null,
            actions: business.retryable ? [RETRY_ACTION, contactAction(rawCode)] : [],
        }
    }

    // Desconocido (incluye el 500 con el texto crudo del gateway): mensaje digno, cero JSON.
    // El detalle técnico vive en Sentry (`area=payments-checkout`) y en los logs de Vercel.
    const unknownCode = rawCode !== '' ? rawCode : 'unknown'
    return {
        code: unknownCode,
        title: 'No pudimos iniciar el cobro',
        message: 'No pudimos iniciar el cobro de tu plan.',
        hint: 'No se te cobró nada. Vuelve a intentarlo; si sigue fallando, escríbenos y lo resolvemos contigo.',
        actions: [
            RETRY_ACTION,
            ...(flowAvailable ? [TRY_FLOW_ACTION] : []),
            contactAction(unknownCode),
        ],
    }
}
