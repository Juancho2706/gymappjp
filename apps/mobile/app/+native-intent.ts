/**
 * `+native-intent` corre fuera del árbol React. Solo transforma rutas: la resolución remota del
 * coach ocurre dentro de `alumno/codigo`, donde existen ThemeContext, lifecycle y estados de error.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const noProtocol = path
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^eva:\/\//i, '/')
    const clean = noProtocol.split('?')[0]?.split('#')[0] ?? ''
    const segments = clean.split('/').filter(Boolean)

    if ((segments[0] === 'c' || segments[0] === 'invite') && segments[1]) {
      const identifier = safeDecode(segments[1])
      if (!identifier) return '/'
      return `/alumno/codigo?identifier=${encodeURIComponent(identifier)}&auto=1`
    }

    // `eva://auth/confirmed?email=…`: lo manda `/auth/confirm` (web) en Android cuando el alta salió
    // de la app. Aterriza en la pantalla de verificación con `confirmed=1`, que entra sola al panel
    // con las credenciales del alta (o, si la app murió, manda al login con el email puesto).
    if (segments[0] === 'auth' && segments[1] === 'confirmed') {
      const query = noProtocol.split('?')[1]?.split('#')[0] ?? ''
      const email = new URLSearchParams(query).get('email')?.trim() ?? ''
      const emailParam = email ? `&email=${encodeURIComponent(email)}` : ''
      return `/(auth)/verify-email?confirmed=1${emailParam}`
    }

    // `eva://coach/guia`: la vuelta desde el árbol del alumno en el navegador (banner «Volver a la
    // app», SPEC «Vive tu app» directo §3, modo `rn`). En Android llega envuelto en un
    // `intent://coach/guia#Intent;scheme=eva;package=cl.evaapp.eva;…;end` que el sistema resuelve a
    // este mismo `eva://`. Sin esta rama caía en el `return path` de abajo y el router recibía
    // `eva://coach/guia` crudo, que no resuelve ninguna pantalla.
    //
    // Es una ALLOWLIST explícita, no una regla general «todo /coach/* pasa»: cada ruta interna que
    // se pueda abrir desde afuera es superficie de ataque (un link en un mail o en un chat entra
    // acá sin que nadie lo audite), así que se habilita ruta por ruta. El resto del árbol de coach
    // sigue devolviendo el path crudo, igual que hoy.
    if (segments[0] === 'coach' && segments[1] === 'guia') {
      return '/coach/guia'
    }

    return path
  } catch {
    return '/'
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value.trim()
  }
}
