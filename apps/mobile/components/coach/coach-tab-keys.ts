/**
 * coach-tab-keys — orden de la barra inferior del coach, en un modulo PURO (cero imports de
 * react-native / expo / lucide). Vive aparte de `CoachMobileChrome.tsx` para que el test de
 * contrato `tests/mobile-nav-tab-keys-contract.test.ts` pueda cruzarlo contra `NAV_MODULES`
 * (@eva/coach-nav) sin arrastrar el arbol nativo al runner raiz del repo.
 */

// Orden verbatim del responsive web; despues de filtrar permisos toma hasta cinco
// accesos directos y nunca reserva un slot artificial para "Mas".
export const MOBILE_TAB_KEYS = ['dashboard', 'clients', 'programs', 'nutrition', 'options', 'settings_team', 'team', 'reactivate'] as const

export type MobileTabKey = (typeof MOBILE_TAB_KEYS)[number]
