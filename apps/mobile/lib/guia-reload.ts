/**
 * Recarga de «Tus primeros pasos» al volver a la app — la parte PURA del listener de `AppState`
 * de `app/coach/guia.tsx` (SPEC «Vive tu app» directo §2, V1.23).
 *
 * El agujero que tapa: el paso 2 se tilda con un evento que escribe el SERVIDOR cuando el coach
 * entra de verdad a la app de su alumno, y eso pasa en el navegador del sistema — fuera de la app.
 * `guia.tsx` recarga en cuanto `Linking.openURL` resuelve, o sea ANTES de que el coach haya
 * entrado: la foto que trae es la vieja y el paso se queda sin tilde hasta la próxima visita.
 * El equivalente de RN al `pageshow` de la web es volver a primer plano.
 *
 * Vive acá y no en la pantalla para poder pinnearlo (`tests/mobile/guia-reload.test.ts`) sin montar
 * el árbol nativo: la regla es de una línea, pero equivocarla se paga en recargas fantasma (una por
 * cada `inactive` que Android e iOS emiten al abrir el selector de apps o bajar el centro de
 * notificaciones).
 */

/**
 * Estados de `AppState`. Estructuralmente igual al `AppStateStatus` de react-native (RN 0.81), pero
 * declarado acá para que el módulo no importe nada nativo y corra con el runner del repo.
 */
export type AppLifecycleState = 'active' | 'background' | 'inactive' | 'unknown' | 'extension'

/**
 * ¿Volvimos a primer plano? Solo el BORDE de entrada a `active` cuenta.
 *
 * `active → active` no existe como transición real pero se descarta igual (un evento repetido no
 * es una vuelta), y `active → inactive` —el estado intermedio de iOS al mostrar el selector de
 * apps o una hoja del sistema— tampoco: quien recarga en `inactive` recarga con la app tapada y
 * después otra vez al volver.
 */
export function shouldReloadOnAppState(prev: AppLifecycleState, next: AppLifecycleState): boolean {
    return prev !== 'active' && next === 'active'
}
