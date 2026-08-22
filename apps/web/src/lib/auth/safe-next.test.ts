import { describe, expect, it } from 'vitest'
import {
    AUTH_CALLBACK_NEXT_PREFIXES,
    buildCoachLoginNext,
    isCoachDefaultLanding,
    MAX_NEXT_LENGTH,
    pickUtmParams,
    safeNext,
} from './safe-next'

const CAP_EMAIL_QUERY = '?utm_source=cap_email&utm_medium=email&utm_campaign=sweep'

describe('safeNext — prefijo /coach', () => {
    it('acepta el destino del correo de cupo', () => {
        expect(safeNext('/coach/subscription', '/coach')).toBe('/coach/subscription')
    })

    it('acepta el destino con los utm_* intactos y NO los re-encodea', () => {
        const raw = `/coach/subscription${CAP_EMAIL_QUERY}`
        expect(safeNext(raw, '/coach')).toBe(raw)
    })

    it('acepta el prefijo exacto', () => {
        expect(safeNext('/coach', '/coach')).toBe('/coach')
    })

    it('acepta hash', () => {
        expect(safeNext('/coach/subscription#planes', '/coach')).toBe('/coach/subscription#planes')
    })

    it('acepta subrutas profundas', () => {
        expect(safeNext('/coach/clients/abc-123/nutrition', '/coach')).toBe('/coach/clients/abc-123/nutrition')
    })

    it('rechaza una URL absoluta', () => {
        expect(safeNext('https://evil.tld', '/coach')).toBeNull()
        expect(safeNext('http://evil.tld/coach', '/coach')).toBeNull()
    })

    it('rechaza protocol-relative', () => {
        expect(safeNext('//evil.tld', '/coach')).toBeNull()
        expect(safeNext('//evil.tld/coach/subscription', '/coach')).toBeNull()
    })

    it('rechaza un prefijo que solo empieza igual', () => {
        expect(safeNext('/coachx', '/coach')).toBeNull()
        expect(safeNext('/coach-evil.tld', '/coach')).toBeNull()
    })

    it('rechaza otro árbol de rutas', () => {
        expect(safeNext('/admin', '/coach')).toBeNull()
        expect(safeNext('/admin/dashboard', '/coach')).toBeNull()
    })

    it('rechaza esquemas peligrosos en el path', () => {
        expect(safeNext('javascript:alert(1)', '/coach')).toBeNull()
        expect(safeNext('data:text/html,<script>', '/coach')).toBeNull()
        expect(safeNext('/coach/data:x', '/coach')).toBeNull()
        expect(safeNext('/coach/javascript:alert(1)', '/coach')).toBeNull()
        expect(safeNext('/coach/https://evil.tld', '/coach')).toBeNull()
    })

    it('NO mira el esquema dentro del query: el destino sigue siendo el path', () => {
        // El chequeo textual sobre el raw entero tiraba destinos legítimos en silencio
        // (`?title=Big Data: intro`). Con el path validado, el query es texto y nada más.
        expect(safeNext('/coach/x?q=data:foo', '/coach')).toBe('/coach/x?q=data:foo')
        expect(safeNext('/coach/x?title=Big%20Data:%20intro', '/coach')).toBe(
            '/coach/x?title=Big%20Data:%20intro'
        )
        expect(safeNext('/coach/x?u=javascript:alert(1)', '/coach')).toBe('/coach/x?u=javascript:alert(1)')
    })

    it('rechaza backslash (varios navegadores lo leen como /)', () => {
        expect(safeNext('/\\evil.tld', '/coach')).toBeNull()
        expect(safeNext('/coach\\..\\admin', '/coach')).toBeNull()
    })

    it('rechaza path traversal, incluso codificado', () => {
        expect(safeNext('/coach/..%2Fadmin', '/coach')).toBeNull()
        expect(safeNext('/coach/../admin', '/coach')).toBeNull()
        expect(safeNext('/coach/%2e%2e/admin', '/coach')).toBeNull()
        expect(safeNext('/coach%2f..%2fadmin', '/coach')).toBeNull()
    })

    it('rechaza espacios y caracteres de control', () => {
        expect(safeNext('/coach/sub scription', '/coach')).toBeNull()
        expect(safeNext(`/coach${String.fromCharCode(10)}https://evil.tld`, '/coach')).toBeNull()
        expect(safeNext(`/coach${String.fromCharCode(9)}x`, '/coach')).toBeNull()
        expect(safeNext(`/coach${String.fromCharCode(0)}x`, '/coach')).toBeNull()
        expect(safeNext(`/coach${String.fromCharCode(127)}x`, '/coach')).toBeNull()
    })

    it('rechaza todo lo que pase de ASCII imprimible (0x7E)', () => {
        // U+2028/U+2029: `redirect()` los mete en la cabecera `x-action-redirect` → TypeError
        // ByteString → 500 justo al terminar el login.
        expect(safeNext(`/coach/x${String.fromCharCode(0x2028)}y`, '/coach')).toBeNull()
        expect(safeNext(`/coach/x${String.fromCharCode(0x2029)}y`, '/coach')).toBeNull()
        // Homoglifos: `а` cirílica (U+0430) no es la `a` latina.
        expect(safeNext(`/coach/${String.fromCharCode(0x430)}dmin`, '/coach')).toBeNull()
        // Espacio ideográfico (U+3000): espacio que no es 0x20.
        expect(safeNext(`/coach/x${String.fromCharCode(0x3000)}y`, '/coach')).toBeNull()
    })

    it('acepta esos mismos bytes percent-encoded (así viaja lo legítimo)', () => {
        expect(safeNext('/coach/%E2%80%A8y', '/coach')).toBe('/coach/%E2%80%A8y')
        expect(safeNext('/coach/rutina-espa%C3%B1ol', '/coach')).toBe('/coach/rutina-espa%C3%B1ol')
    })

    it('acepta lo que queda encoded y por lo tanto inerte', () => {
        // CRLF encodeado: no rompe la cabecera porque nunca se decodifica antes de viajar.
        expect(safeNext('/coach/%0d%0aSet-Cookie', '/coach')).toBe('/coach/%0d%0aSet-Cookie')
        // Doble encode de `..`: `%252e` no es `%2e`, el path no escala a otro árbol.
        expect(safeNext('/coach/%252e%252e/', '/coach')).toBe('/coach/%252e%252e/')
    })

    it('acepta `//` cuando NO abre el path (sigue resolviendo al mismo origen)', () => {
        const cases = ['/coach//evil.com', '/coach?x=//evil', '/coach#//evil']
        for (const raw of cases) {
            const result = safeNext(raw, '/coach')
            expect(result).toBe(raw)
            expect(new URL(result as string, 'https://www.eva-app.cl').origin).toBe('https://www.eva-app.cl')
        }
    })

    it('rechaza el string vacío y todo lo que no sea string', () => {
        expect(safeNext('', '/coach')).toBeNull()
        expect(safeNext(null, '/coach')).toBeNull()
        expect(safeNext(undefined, '/coach')).toBeNull()
        expect(safeNext({ toString: () => '/coach/subscription' }, '/coach')).toBeNull()
        expect(safeNext(42, '/coach')).toBeNull()
        expect(safeNext(['/coach/subscription'], '/coach')).toBeNull()
    })

    it('rechaza un next más largo que el tope de revalidatePath', () => {
        expect(MAX_NEXT_LENGTH).toBe(1024)
        const justFits = `/coach/${'a'.repeat(MAX_NEXT_LENGTH - 7)}`
        expect(justFits.length).toBe(MAX_NEXT_LENGTH)
        expect(safeNext(justFits, '/coach')).toBe(justFits)
        expect(safeNext(`${justFits}a`, '/coach')).toBeNull()
    })
})

describe('safeNext — prefijo /admin (comportamiento del panel CEO)', () => {
    it('acepta rutas del panel', () => {
        expect(safeNext('/admin', '/admin')).toBe('/admin')
        expect(safeNext('/admin/coaches?tier=free', '/admin')).toBe('/admin/coaches?tier=free')
    })

    it('rechaza rutas fuera del panel', () => {
        expect(safeNext('/coach/dashboard', '/admin')).toBeNull()
        expect(safeNext('/adminx', '/admin')).toBeNull()
        expect(safeNext('https://evil.tld/admin', '/admin')).toBeNull()
        expect(safeNext('//evil.tld/admin', '/admin')).toBeNull()
    })
})

describe('safeNext — prefijo / (cualquier ruta interna)', () => {
    it('acepta el destino de recuperación de contraseña', () => {
        expect(safeNext('/reset-password', '/')).toBe('/reset-password')
        expect(safeNext('/reset-password?token_hash=abc123&type=recovery', '/')).toBe(
            '/reset-password?token_hash=abc123&type=recovery'
        )
    })

    it('acepta la raíz y cualquier árbol interno', () => {
        expect(safeNext('/', '/')).toBe('/')
        expect(safeNext('/coach/subscription', '/')).toBe('/coach/subscription')
        expect(safeNext('/admin/dashboard', '/')).toBe('/admin/dashboard')
    })

    it('sigue rechazando lo externo', () => {
        expect(safeNext('//evil.tld', '/')).toBeNull()
        expect(safeNext('https://evil.tld', '/')).toBeNull()
        expect(safeNext('/\\evil.tld', '/')).toBeNull()
    })
})

describe('safeNext — lista de prefijos (AUTH_CALLBACK_NEXT_PREFIXES)', () => {
    it('acepta los dos destinos que emite alguien hoy', () => {
        expect(safeNext('/reset-password', AUTH_CALLBACK_NEXT_PREFIXES)).toBe('/reset-password')
        expect(safeNext('/reset-password?team_slug=pool&coach_slug=jp', AUTH_CALLBACK_NEXT_PREFIXES)).toBe(
            '/reset-password?team_slug=pool&coach_slug=jp'
        )
        expect(safeNext('/coach/dashboard', AUTH_CALLBACK_NEXT_PREFIXES)).toBe('/coach/dashboard')
        expect(safeNext(`/coach/subscription${CAP_EMAIL_QUERY}`, AUTH_CALLBACK_NEXT_PREFIXES)).toBe(
            `/coach/subscription${CAP_EMAIL_QUERY}`
        )
    })

    it('rechaza lo que ningún emisor manda (antes pasaba con el prefijo `/`)', () => {
        expect(safeNext('/api/cron/cap-nudge?dry=1', AUTH_CALLBACK_NEXT_PREFIXES)).toBeNull()
        expect(safeNext('/admin/dashboard', AUTH_CALLBACK_NEXT_PREFIXES)).toBeNull()
        expect(safeNext('/', AUTH_CALLBACK_NEXT_PREFIXES)).toBeNull()
        expect(safeNext('/reset-password-falso', AUTH_CALLBACK_NEXT_PREFIXES)).toBeNull()
    })

    it('sigue rechazando lo externo con lista', () => {
        expect(safeNext('https://evil.tld/coach', AUTH_CALLBACK_NEXT_PREFIXES)).toBeNull()
        expect(safeNext('//evil.tld/reset-password', AUTH_CALLBACK_NEXT_PREFIXES)).toBeNull()
    })

    it('una lista vacía no acepta nada', () => {
        expect(safeNext('/coach/dashboard', [])).toBeNull()
    })
})

describe('buildCoachLoginNext', () => {
    it('conserva el query original del correo de cupo', () => {
        expect(buildCoachLoginNext('/coach/subscription', CAP_EMAIL_QUERY)).toBe(
            `/coach/subscription${CAP_EMAIL_QUERY}`
        )
    })

    it('funciona sin query', () => {
        expect(buildCoachLoginNext('/coach/subscription', '')).toBe('/coach/subscription')
        expect(buildCoachLoginNext('/coach/clients', '')).toBe('/coach/clients')
    })

    it('no arma next para los destinos por defecto del login', () => {
        expect(buildCoachLoginNext('/coach', '')).toBeNull()
        expect(buildCoachLoginNext('/coach/dashboard', '')).toBeNull()
        expect(buildCoachLoginNext('/coach/dashboard', '?tab=hoy')).toBeNull()
    })

    it('no arma next al alta OAuth: un coach existente quedaría encerrado ahí', () => {
        expect(buildCoachLoginNext('/coach/onboarding/complete', '')).toBeNull()
        expect(buildCoachLoginNext('/coach/onboarding/complete', CAP_EMAIL_QUERY)).toBeNull()
    })

    it('no arma next a la pregunta de persona: el layout manda ahí solo mientras falte', () => {
        expect(buildCoachLoginNext('/coach/onboarding/persona', '')).toBeNull()
    })

    it('saca el `_rsc` de las navegaciones RSC', () => {
        expect(buildCoachLoginNext('/coach/subscription', '?_rsc=1a2b&utm_source=x')).toBe(
            '/coach/subscription?utm_source=x'
        )
        expect(buildCoachLoginNext('/coach/subscription', '?utm_source=x&_rsc=1a2b')).toBe(
            '/coach/subscription?utm_source=x'
        )
        expect(buildCoachLoginNext('/coach/subscription', '?_rsc=1a2b')).toBe('/coach/subscription')
        expect(buildCoachLoginNext('/coach/subscription', '?')).toBe('/coach/subscription')
        // No confundir un param que solo EMPIEZA igual.
        expect(buildCoachLoginNext('/coach/subscription', '?_rsca=1')).toBe('/coach/subscription?_rsca=1')
    })

    it('devuelve null ante un path que no pasaría la validación de vuelta', () => {
        expect(buildCoachLoginNext('/coach/..', '')).toBeNull()
        expect(buildCoachLoginNext('/otra-cosa', '')).toBeNull()
    })

    it('lo que arma el proxy es exactamente lo que el login puede consumir', () => {
        const built = buildCoachLoginNext('/coach/subscription', CAP_EMAIL_QUERY)
        expect(built).not.toBeNull()
        expect(safeNext(built, '/coach')).toBe(built)
    })

    it('sobrevive al round-trip por URLSearchParams (encode del proxy, decode del login)', () => {
        const built = buildCoachLoginNext('/coach/subscription', CAP_EMAIL_QUERY)
        const url = new URL('https://www.eva-app.cl/login')
        url.searchParams.set('next', built as string)
        const readBack = new URL(url.toString()).searchParams.get('next')
        expect(safeNext(readBack, '/coach')).toBe(built)
    })
})

describe('pickUtmParams', () => {
    it('devuelve solo los utm_* del query, con su valor', () => {
        expect(pickUtmParams(CAP_EMAIL_QUERY)).toEqual([
            ['utm_source', 'cap_email'],
            ['utm_medium', 'email'],
            ['utm_campaign', 'sweep'],
        ])
    })

    it('ignora todo lo que no sea utm_*', () => {
        expect(pickUtmParams('?tab=hoy&utm_source=cap_email&_rsc=1a2b')).toEqual([
            ['utm_source', 'cap_email'],
        ])
    })

    it('tolera el query vacío, sin `?` y sin utm_*', () => {
        expect(pickUtmParams('')).toEqual([])
        expect(pickUtmParams('?')).toEqual([])
        expect(pickUtmParams('?tab=hoy')).toEqual([])
        expect(pickUtmParams('utm_source=cap_email')).toEqual([['utm_source', 'cap_email']])
    })

    it('decodifica el valor (lo vuelve a encodear searchParams.set del proxy)', () => {
        expect(pickUtmParams('?utm_campaign=cupo%20lleno')).toEqual([['utm_campaign', 'cupo lleno']])
    })

    it('así queda la URL del login que arma el proxy: next completo + utm_* arriba', () => {
        const search = CAP_EMAIL_QUERY
        const redirectUrl = new URL('https://www.eva-app.cl/login')
        const nextParam = buildCoachLoginNext('/coach/subscription', search)
        redirectUrl.searchParams.set('next', nextParam as string)
        for (const [key, value] of pickUtmParams(search)) {
            redirectUrl.searchParams.set(key, value)
        }

        expect(redirectUrl.searchParams.get('next')).toBe(`/coach/subscription${CAP_EMAIL_QUERY}`)
        expect(redirectUrl.searchParams.get('utm_source')).toBe('cap_email')
        expect(redirectUrl.searchParams.get('utm_medium')).toBe('email')
        expect(redirectUrl.searchParams.get('utm_campaign')).toBe('sweep')
    })
})

describe('isCoachDefaultLanding', () => {
    it('trata como «sin destino» lo que el login ya haría por defecto', () => {
        expect(isCoachDefaultLanding(null)).toBe(true)
        expect(isCoachDefaultLanding(undefined)).toBe(true)
        expect(isCoachDefaultLanding('/coach')).toBe(true)
        expect(isCoachDefaultLanding('/coach/dashboard')).toBe(true)
        // El default que mandan siempre los dos caminos de Google, con query o hash colgando.
        expect(isCoachDefaultLanding('/coach/dashboard?tab=hoy')).toBe(true)
        expect(isCoachDefaultLanding('/coach/dashboard#planes')).toBe(true)
        expect(isCoachDefaultLanding('/coach/onboarding/complete')).toBe(true)
        expect(isCoachDefaultLanding('/coach/onboarding/persona')).toBe(true)
    })

    it('un destino de verdad no es el default', () => {
        expect(isCoachDefaultLanding('/coach/subscription')).toBe(false)
        expect(isCoachDefaultLanding(`/coach/subscription${CAP_EMAIL_QUERY}`)).toBe(false)
        expect(isCoachDefaultLanding('/reset-password')).toBe(false)
    })
})
