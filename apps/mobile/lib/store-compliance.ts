/**
 * store-compliance — allowlist de destinos que la app puede abrir hacia AFUERA.
 *
 * Lógica PURA (sin react-native, sin expo) para que el contrato se pinnee con el runner del repo
 * (`tests/mobile/store-compliance.test.ts`).
 *
 * El problema que resuelve: hay URLs en la app que NO vienen del código sino de la base de datos —
 * el `cta_url` de una novedad lo escribe el panel de admin. Sin filtro, un link a `/pricing` puesto
 * un martes cualquiera convierte la app en una superficie de pago externa (Apple 3.1.1) sin que
 * medie un release, una review ni un OTA. La regla del embudo Free→Pro es dura: dentro de la app
 * NO existe ningún camino a pagar (`docs/specs/embudo-free-pro/SPEC.md` §«Decisiones cerradas»).
 *
 * Por eso esto es una ALLOWLIST y no una lista negra: lo que no está previsto no se abre. Es
 * deliberadamente conservadora — el costo de rechazar un link legítimo es que el coach ve el texto
 * de la novedad sin botón; el costo de dejar pasar uno es una app rechazada.
 *
 * NO reemplaza al split por plataforma: esto filtra el DESTINO, no decide si algo se muestra. Un
 * link permitido acá sigue estando sujeto a las reglas de copy de `lib/client-cap.ts`.
 */

/** Hosts propios (con y sin `www`). El apex redirige a `www`, pero ambos llegan al mismo sitio. */
const OWN_HOSTS = new Set(['eva-app.cl', 'www.eva-app.cl'])

/** Hosts de terceros admitidos: contacto directo del coach, nada transaccional. */
const ALLOWED_HOSTS = new Set(['wa.me', 'instagram.com', 'www.instagram.com'])

/**
 * Rutas del sitio propio que SÍ son superficie de pago (o llevan a una) y por eso quedan fuera:
 * el tarifario, el alta que termina en checkout, la pantalla de suscripción de la web y la landing
 * del sello — que arriba de todo tiene el link a precios.
 */
const BLOCKED_OWN_PREFIXES = ['/pricing', '/register', '/coach/subscription', '/hecho-con-eva']

/** Ancla del tarifario dentro de la home: `#precios` es la misma página de precios por otra puerta. */
const BLOCKED_FRAGMENT = '#precios'

interface ParsedUrl {
  scheme: string
  host: string
  path: string
}

/**
 * Parser propio en vez de `new URL(...)`: el polyfill de URL de React Native es parcial (Hermes) y
 * `pathname`/`hostname` no son confiables ahí. Con un regex el comportamiento es idéntico en el
 * runner de Node y en el device, que es justo lo que un guard de compliance necesita.
 */
function parseUrl(raw: string): ParsedUrl | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)/.exec(raw)
  if (!match) return null
  return {
    scheme: (match[1] ?? '').toLowerCase(),
    host: (match[2] ?? '').toLowerCase(),
    path: match[3] ?? '',
  }
}

/**
 * ¿Se puede abrir esta URL desde la app sin romper las reglas de las tiendas?
 *
 * Permite: `mailto:` (soporte, no es pago) · `https://wa.me/*` · `https://(www.)?instagram.com/*` ·
 * `https://(www.)?eva-app.cl/*` SALVO las rutas de pago (`/pricing`, `/register`,
 * `/coach/subscription`, `/hecho-con-eva`) y cualquier URL con el ancla `#precios`.
 * Rechaza todo lo demás, incluido `http://` (sin TLS no se abre nada) y cualquier host que
 * simplemente TERMINE en un host permitido (`eva-app.cl.example.com` no pasa: la comparación es
 * por igualdad, nunca por sufijo).
 */
export function isStoreSafeUrl(url: string): boolean {
  if (typeof url !== 'string') return false
  const raw = url.trim()
  if (!raw) return false

  const parsed = parseUrl(raw)
  if (!parsed) return false

  // `mailto:` no es una superficie de pago: es soporte, y ambas tiendas lo admiten.
  if (parsed.scheme === 'mailto') return raw.length > 'mailto:'.length
  if (parsed.scheme !== 'https') return false

  // Credenciales o puerto en el host = URL que no se parece a las que emitimos ⇒ fail-closed.
  if (!parsed.host || parsed.host.includes('@') || parsed.host.includes(':')) return false

  if (ALLOWED_HOSTS.has(parsed.host)) return true
  if (!OWN_HOSTS.has(parsed.host)) return false

  if (raw.toLowerCase().includes(BLOCKED_FRAGMENT)) return false
  const path = parsed.path.toLowerCase()
  // Prefijo, no igualdad: `/pricing`, `/pricing/`, `/pricing-2026` y `/register?ref=x` son todos
  // la misma puerta. El costo de un falso positivo es un CTA menos; el de un falso negativo, la app.
  return !BLOCKED_OWN_PREFIXES.some((prefix) => path.startsWith(prefix))
}
