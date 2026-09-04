/**
 * Purga de los caches del service worker con datos del alumno, al cerrar sesión.
 *
 * El SW (apps/web/public/sw.js) guarda en NAV_CACHE el HTML ya renderizado de las páginas de /c y
 * /t — con los datos del alumno adentro — y en CLIENT_DATA_CACHE sus respuestas de datos. Nadie
 * los borraba nunca: en un teléfono compartido (el del gimnasio, el de la pareja) el alumno
 * siguiente abría la app y veía las páginas cacheadas del anterior, sin sesión de por medio.
 */

/**
 * Se matchea por PREFIJO y no por el nombre exacto con versión: sw.js sube la versión de cada
 * cache cada vez que cambia la estrategia ('eva-nav-v5' → 'eva-nav-v6'), y un match exacto dejaría
 * de purgar EN SILENCIO en la próxima subida — la fuga volvería sin que nada falle a la vista.
 *
 * 'eva-shell' y 'eva-static' quedan fuera a propósito: son assets (offline.html, íconos, chunks de
 * Next), no datos de nadie. Borrarlos destruye el fallback offline y no gana nada de privacidad.
 */
const STUDENT_DATA_CACHE_PREFIXES = ['eva-nav', 'eva-client-data']

/**
 * Borra los caches de navegación y de datos del alumno. Nunca lanza: cerrar sesión no puede
 * fallar porque la purga falló.
 */
export async function clearClientCaches(): Promise<void> {
    try {
        // Salida temprana donde CacheStorage no existe: SSR, Safari viejo, modo privado.
        if (typeof caches === 'undefined') return
        const names = await caches.keys()
        await Promise.all(
            names
                .filter((name) => STUDENT_DATA_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
                .map((name) => caches.delete(name))
        )
    } catch {
        /* no-op: una purga fallida no puede dejar al alumno atrapado en la sesión */
    }
}
