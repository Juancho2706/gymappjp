import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

/**
 * DashboardReadyContext — el splash de marca ES el loader del dashboard (QA-5).
 *
 * Antes: `SplashGate` (montado SOLO en `app/index.tsx`, fase `checking`) se desmontaba en
 * el `router.replace`, asi que entre la marca del coach y el dashboard aparecia un
 * skeleton/loader intermedio. El arranque se leia como tres pantallas.
 *
 * Ahora hay un HANDOFF: el gate publica aqui la identidad EXACTA que tenia en pantalla
 * (marca, firma, morphbar, opacidad del halo) justo ANTES de navegar, y el overlay global
 * de `app/_layout.tsx` —hermano del `Stack`, como el `Toaster`— la continua sin repintar
 * ni parpadear. El overlay se retira cuando la home marca `ready` (primer load resuelto,
 * con datos O con error) o cuando vence el tope de seguridad.
 *
 * Contratos:
 *  - **Un disparo por proceso JS** (`armed`): un proceso JS nuevo = un cold start. Ninguna
 *    navegacion posterior (deep link, login, cambio de tab) puede volver a armar el splash.
 *  - **Solo con sesion**: el unico emisor es el camino del gate que rutea a un dashboard.
 *    Sin sesion el gate llama `onAnonymous` y jamas toca este store — el flujo del selector
 *    y del login queda intacto.
 *  - **`ready` es pegajoso**: `markDashboardReady()` es idempotente; las homes lo llaman en
 *    cada resolucion de su primer load sin costo.
 *
 * El estado vive en un store de modulo (no en `useState` del provider) para que
 * `markDashboardReady()` desde la home NO re-renderice el arbol entero en el peor momento
 * del arranque: solo re-renderiza quien se suscribe (el overlay). El provider expone el
 * store con identidad CONSTANTE, asi que montarlo cuesta cero renders.
 */

/** Marca de coach que el gate ya tenia pintada. Mismos datos que el crossfade de §2.3. */
export interface SplashBrandMark {
  accent: string
  displayName: string
  greetingName: string | null
  logoUri: string | null
}

/** Estado visual EXACTO del gate en el frame en que solto el control. */
export interface SplashHandoff {
  /** `null` = identidad EVA (no habia marca de coach que mostrar). */
  mark: SplashBrandMark | null
  /** La firma EVA (hairline + wordmark) ya estaba visible. */
  signature: boolean
  /** El morphbar ya estaba montado (el gate paso su umbral lento). */
  slow: boolean
  /** Opacidad del halo en ese frame: la respiracion continua desde ahi, sin salto. */
  halo: number
  /**
   * `Date.now()` del instante en que el gate sembro la coreografia «Glide» del splash EVA
   * (`components/entry/splash-sweep.ts`). No es un progreso: es el ORIGEN del reloj, y por
   * eso el overlay puede retomar el barrido en el ms exacto en que iba. Mismo espiritu que
   * `signature` y `halo`: lo que viaja es el estado, no una orden de reproducir.
   *
   * `null` = esta espera no lleva sweep. Es el valor correcto —no un hueco— en la rama de
   * marca de COACH: ahi el splash es la replica estatica de §3.1 hasta el crossfade, y el
   * overlay pinta `SplashCoachMark`. El sweep existe solo en el camino sesion + marca EVA.
   */
  sweepStartedAt: number | null
}

export interface SplashSnapshot {
  ready: boolean
  handoff: SplashHandoff | null
}

const IDLE: SplashSnapshot = { ready: false, handoff: null }

let snapshot: SplashSnapshot = IDLE
/** El overlay es de UN disparo por proceso JS = por cold start. */
let armed = false
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

/** Primitiva del store. Los hooks son azucar sobre esto. */
export function subscribeDashboardReady(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Snapshot vivo del arranque. Estable por referencia hasta la proxima mutacion. */
export function getDashboardReadySnapshot(): SplashSnapshot {
  return snapshot
}

/**
 * El gate entrega la identidad al overlay raiz. Debe llamarse ANTES del `router.replace`:
 * el overlay monta en el MISMO commit que la navegacion, con la misma composicion, asi que
 * el desmontaje del gate no deja un solo frame descubierto.
 */
export function beginSplashHandoff(handoff: SplashHandoff): void {
  if (armed) return
  armed = true
  snapshot = { ...snapshot, handoff }
  emit()
}

/** Primer load del dashboard resuelto (con datos O con error): el splash ya puede irse. */
export function markDashboardReady(): void {
  if (snapshot.ready) return
  snapshot = { ...snapshot, ready: true }
  emit()
}

/** El overlay termino su fade-out y se desmonta. `armed` NO se limpia (un disparo). */
export function endSplashHandoff(): void {
  if (!snapshot.handoff) return
  snapshot = { ...snapshot, handoff: null }
  emit()
}

/** Solo para tests: devuelve el store al estado de un proceso JS recien nacido. */
export function resetDashboardReadyStore(): void {
  snapshot = IDLE
  armed = false
  emit()
}

/** Fase del overlay. `dismissing` sigue PINTANDO: es el tramo del fade-out. */
export type SplashOverlayPhase = 'hidden' | 'holding' | 'dismissing'

export interface SplashOverlayInput {
  handoff: SplashHandoff | null
  /** La home ya resolvio su primer load. */
  ready: boolean
  /** Vencio el tope de seguridad del overlay. */
  timedOut: boolean
  /**
   * Hay otra pantalla de arranque legitima encima (hoy: el bloqueo biometrico). El splash
   * no puede tapar algo que exige interaccion — se retira igual que ante un error.
   */
  suppressed: boolean
}

/**
 * Decision PURA de visibilidad. `holding` solo mientras el dashboard no dio senal alguna:
 * cualquier resolucion —datos, error, tope, o una pantalla que reclama la interaccion—
 * manda al fade-out. El splash jamas puede quedar tapando un estado terminal.
 */
export function resolveSplashOverlayPhase({
  handoff,
  ready,
  timedOut,
  suppressed,
}: SplashOverlayInput): SplashOverlayPhase {
  if (!handoff) return 'hidden'
  if (ready || timedOut || suppressed) return 'dismissing'
  return 'holding'
}

interface DashboardReadyStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => SplashSnapshot
  markDashboardReady: () => void
  endSplashHandoff: () => void
}

/** Identidad CONSTANTE: el provider nunca fuerza un render de sus hijos. */
const STORE: DashboardReadyStore = {
  subscribe: subscribeDashboardReady,
  getSnapshot: getDashboardReadySnapshot,
  markDashboardReady,
  endSplashHandoff,
}

const DashboardReadyStoreContext = createContext<DashboardReadyStore>(STORE)

export function DashboardReadyProvider({ children }: { children: ReactNode }) {
  return (
    <DashboardReadyStoreContext.Provider value={STORE}>{children}</DashboardReadyStoreContext.Provider>
  )
}

export interface DashboardReadyApi {
  ready: boolean
  markDashboardReady: () => void
}

/** Contrato completo `{ ready, markDashboardReady }`. Se SUSCRIBE a `ready`. */
export function useDashboardReady(): DashboardReadyApi {
  const store = useContext(DashboardReadyStoreContext)
  const ready = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().ready,
    () => false,
  )
  return useMemo(() => ({ ready, markDashboardReady: store.markDashboardReady }), [ready, store])
}

/**
 * Solo el emisor. Lo usan las homes: emitir la senal no debe costarles un render extra
 * (`useDashboardReady()` las suscribiria a un valor que no consumen).
 */
export function useMarkDashboardReady(): () => void {
  return useContext(DashboardReadyStoreContext).markDashboardReady
}

/** Handoff vivo (o `null`). Lo consume el overlay raiz. */
export function useSplashHandoff(): SplashHandoff | null {
  const store = useContext(DashboardReadyStoreContext)
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().handoff,
    () => null,
  )
}

/** Cierre del overlay (fin del fade-out), sin suscripcion. */
export function useEndSplashHandoff(): () => void {
  return useContext(DashboardReadyStoreContext).endSplashHandoff
}
