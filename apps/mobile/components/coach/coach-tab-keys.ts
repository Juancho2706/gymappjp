/**
 * coach-tab-keys — keys del nav del coach CON DESTINO en la barra inferior de RN, en un modulo
 * PURO (cero imports de react-native / expo / lucide). Vive aparte de `CoachMobileChrome.tsx` para
 * que el test de contrato `tests/mobile-nav-tab-keys-contract.test.ts` pueda cruzarlo contra
 * `NAV_MODULES` (@eva/coach-nav) sin arrastrar el arbol nativo al runner raiz del repo.
 */

/**
 * Ola de orden W2.5: esto YA NO es «el orden de la barra». La barra la arma `buildMobileBar`
 * (@eva/coach-nav) con la especialidad del coach — `[Inicio, Alumnos, 2 dominios, Mas]` — y este
 * array pasa a ser el DOMINIO de `NAV_ROUTE` (CoachMobileChrome): que keys del nav saben a que
 * pantalla de Expo Router ir. TypeScript lo verifica (`NAV_ROUTE ... satisfies
 * Record<MobileTabKey, MobileNavRoute>`): agregar una ruta sin sumarla aca —o al reves— no compila.
 *
 * Incluye `more` (el slot de la hoja «Mas», que no vive en NAV_MODULES) y `cardio` / `movement`
 * (pantallas de STACK fuera de `(tabs)`, alcanzables por push desde la hoja). `funciones` y
 * `support` NO estan: se navegan por el `href` del registro, sin ruta propia de RN.
 */
export const MOBILE_TAB_KEYS = [
  'dashboard',
  'clients',
  'programs',
  'nutrition',
  'options',
  'settings_team',
  'team',
  'reactivate',
  'more',
  'cardio',
  'movement',
] as const

export type MobileTabKey = (typeof MOBILE_TAB_KEYS)[number]
