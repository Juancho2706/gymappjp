/**
 * domain-off (RN) — ruta local de «Funciones» + re-export del copy compartido del aviso
 * «dominio apagado» (Ola de orden W1, mockup `9801fec7` 1A/3A).
 *
 * Modulo PURO: cero react-native / expo / supabase, para que lo importen el componente
 * (`components/coach/DomainOffNotice.tsx`) y el runner de la raiz (`tests/mobile/domain-off.test.ts`)
 * sin arrastrar el grafo nativo.
 *
 * El COPY es compartido con la web via `@eva/feature-prefs`: el coach no puede leer un nombre de
 * pantalla en un lado y otro en el otro. La RUTA no se comparte — cada app declara la suya (web:
 * `apps/web/src/lib/domain-off.ts`; RN: aca), y desde W3.3 las dos apuntan al MISMO literal
 * `/coach/settings/funciones`.
 */
export {
  DOMAIN_LABELS,
  FUNCIONES_BREADCRUMB,
  FUNCIONES_LABEL,
  domainOffCopy,
} from '@eva/feature-prefs'
export type { DomainOffCopy, FeatureDomain } from '@eva/feature-prefs'

/**
 * Ruta Expo Router de «Opciones › Funciones», la pantalla donde el coach prende/apaga un dominio.
 * Es el destino de la CTA de `DomainOffNotice`.
 *
 * ⚠️ Duplicado deliberado de `FUNCIONES_ROUTE` (`lib/mi-panel.ts`): ese modulo importa `./api` y
 * `./supabase`, asi que traerlo desde aca contaminaria el aviso (y su test) con red y con el
 * bundle nativo. `tests/mobile/domain-off.test.ts` pinnea que los dos literales coincidan, para
 * que la divergencia se vea en CI y no en el dispositivo.
 */
export const FUNCIONES_PATH = '/coach/settings/funciones' as const
