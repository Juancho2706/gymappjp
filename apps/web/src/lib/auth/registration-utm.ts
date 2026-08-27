/**
 * Atribución del alta (W3.9 de `docs/specs/flujo-coach-nuevo`).
 *
 * POR QUÉ existe: hoy la atribución solo se puede reconstruir cruzando timestamps a mano — 24 de
 * 25 personas tienen `$initial_utm_source = none` en PostHog porque la identidad anónima se recrea
 * por sesión. La fuente que trajo el alta se guarda en la fila del coach, escrita SOLO por el
 * servidor en el momento del registro (`coaches.utm_source` / `coaches.utm_campaign`, migración
 * `20260826171126_coaches_utm_attribution.sql`, ya aplicada en LIVE).
 *
 * RETENCIÓN (Ley 21.719), declarada también en el `COMMENT ON COLUMN` de esa migración: es dato
 * personal, su retención es la VIDA DE LA CUENTA y se borra con la fila del coach. No se copia a
 * ningún otro sistema salvo la propiedad del `coach_registered` de servidor, que ya viaja sin PII
 * (`distinct_id` = el id del propio coach).
 *
 * Vive acá y no inline en cada alta porque los dos escritores —el alta web
 * (`(auth)/register/_actions/register.actions.ts`) y el alta desde la app
 * (`api/mobile/auth/register-coach-free/route.ts`)— tienen que sanear IGUAL: el valor llega de un
 * query param del navegador, o sea de cualquiera. `register.actions.ts` es `'use server'` y no
 * puede exportar un helper síncrono, así que el lugar compartido es este módulo.
 */

/** Tope de largo. Un `utm_source` real tiene ~10 caracteres; esto es un techo anti-basura. */
const MAX_UTM_LENGTH = 120

/** Control chars (C0 + DEL): un query param puede traer cualquier byte. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/**
 * Normaliza un valor UTM que viene del cliente.
 *
 * - control chars fuera y espacios colapsados;
 * - tope de largo, para que nadie use la columna como buzón;
 * - vacío ⇒ `null`, nunca `''`: la columna es «no sé de dónde vino», y `''` mentiría diciendo que
 *   sí se midió algo.
 *
 * NO se hace lowercase: `utm_campaign` lleva nombres de campaña tal como los escribió quien pauta y
 * aplastarlos rompería el cruce con el panel de Meta.
 */
export function sanitizeUtmValue(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const cleaned = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
    if (!cleaned) return null
    return cleaned.slice(0, MAX_UTM_LENGTH)
}

export type RegistrationUtm = {
    utmSource: string | null
    utmCampaign: string | null
}

/**
 * Cookie first-party de atribución, escrita por el proxy en el PRIMER aterrizaje que traiga
 * `?utm_source=` (first-touch: nunca se pisa). POR QUÉ: los hidden inputs solo cubren «el anuncio
 * apunta directo a `/register?utm_...`», pero el ad real aterriza en `/` y todos los CTAs de la
 * landing navegan a `/register` SIN query; el alta por Google además pierde los params en el ida y
 * vuelta de OAuth. La cookie sobrevive ambos saltos. httpOnly (solo la leen los server actions de
 * alta), 30 días — mismo dato y misma retención declarada que las columnas de la migración
 * `20260826171126_coaches_utm_attribution.sql`: se consume en el insert del coach y no viaja a
 * ningún otro sistema.
 */
export const UTM_COOKIE_NAME = 'eva_utm'
export const UTM_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/**
 * Valor crudo de la cookie (`source|campaign`, cada parte URL-encoded al escribirla) → par saneado.
 * Tolera basura: una cookie manipulada pasa por el MISMO `sanitizeUtmValue` que un query param.
 */
export function parseUtmCookie(raw: string | null | undefined): RegistrationUtm {
    if (!raw) return { utmSource: null, utmCampaign: null }
    const [source = '', campaign = ''] = raw.split('|', 2).map(part => {
        try {
            return decodeURIComponent(part)
        } catch {
            return part
        }
    })
    return { utmSource: sanitizeUtmValue(source), utmCampaign: sanitizeUtmValue(campaign) }
}

/**
 * Par listo para el `insert` de `coaches` y para el `coach_registered` de servidor.
 *
 * Se devuelven SIEMPRE las dos claves (con `null` cuando no hay dato) para que el `insert` sea el
 * mismo objeto en los dos caminos y un alta sin atribución quede explícitamente sin atribución.
 */
export function resolveRegistrationUtm(input: {
    utmSource?: unknown
    utmCampaign?: unknown
}): RegistrationUtm {
    return {
        utmSource: sanitizeUtmValue(input.utmSource),
        utmCampaign: sanitizeUtmValue(input.utmCampaign),
    }
}
