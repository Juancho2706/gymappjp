import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import type { ViewProps } from 'react-native'

/**
 * Registro de targets de la Guía Viva en RN (SPEC `nutrition-onboarding-tour`, «Alcance»).
 *
 * Es el equivalente nativo de los `data-tour="…"` de web. En el navegador el motor encuentra el
 * elemento a iluminar con un `querySelector` sobre un atributo; en RN no hay documento que
 * consultar, así que cada superficie REGISTRA sus vistas por nombre y el overlay las mide con
 * `measureInWindow`. El contrato (los nombres de los targets) es el mismo en las dos plataformas y
 * vive en `tours.ts`.
 *
 * Dos detalles nativos que NO son adorno:
 *
 * 1. **`collapsable={false}`**. En Android, Yoga aplana las vistas que solo agrupan hijos y no
 *    pintan nada; una vista aplanada no existe en el árbol nativo y `measureInWindow` nunca llama a
 *    su callback. Sin esto, la mitad de los targets serían invisibles para el motor solo en Android.
 * 2. **Baja por identidad de nodo**. `FlashList` recicla filas: el orden de los callbacks de `ref`
 *    puede ser «montar el nuevo, después soltar el viejo». Si el `null` borrara la entrada a ciegas,
 *    borraría el registro RECIÉN hecho. Por eso `unregisterTarget` recibe el nodo y solo borra si
 *    sigue siendo el que está guardado.
 */

export type TourRect = {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/**
 * `measureInWindow` no llama a su callback cuando el nodo ya salió del árbol nativo (una franja que
 * se colapsó, una fila reciclada). Sin este techo, la promesa quedaría colgada para siempre y el
 * paso se quedaría sin hueco Y sin velo liso: mudo. 250 ms es holgado para una medición que en la
 * práctica resuelve en el mismo frame.
 */
const MEASURE_TIMEOUT_MS = 250

type TourTargetsRegistry = {
  registerTarget: (name: string, node: View) => void
  unregisterTarget: (name: string, node: View | null) => void
  /** `null` = el target no está montado o no es medible; el paso degrada a velo liso. */
  measureTarget: (name: string) => Promise<TourRect | null>
}

const TourTargetsContext = createContext<TourTargetsRegistry | null>(null)

/**
 * Provider del registro. Va por ENCIMA tanto de los targets como del `TourOverlay` (el overlay es
 * quien mide). No renderiza ninguna vista: envolver una pantalla con esto no puede mover un píxel.
 */
export function TourTargetsProvider({ children }: { children: ReactNode }) {
  // `useRef` y no `useState`: registrar un target NO debe re-renderizar la pantalla (los targets se
  // registran durante el layout, y un `setState` ahí sería un render por cada vista del guion).
  const nodesRef = useRef<Map<string, View>>(new Map())

  const registerTarget = useCallback((name: string, node: View) => {
    nodesRef.current.set(name, node)
  }, [])

  const unregisterTarget = useCallback((name: string, node: View | null) => {
    if (node === null) return
    if (nodesRef.current.get(name) === node) nodesRef.current.delete(name)
  }, [])

  const measureTarget = useCallback((name: string): Promise<TourRect | null> => {
    const node = nodesRef.current.get(name)
    if (!node) return Promise.resolve(null)

    return new Promise<TourRect | null>((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        settled = true
        resolve(null)
      }, MEASURE_TIMEOUT_MS)

      node.measureInWindow((x, y, width, height) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const measured = [x, y, width, height].every((value) => Number.isFinite(value))
        // Un target de 0×0 es un target que no se ve (colapsado, aún sin layout): tratarlo como
        // ausente evita dibujar un halo de un píxel en la esquina.
        resolve(measured && width > 0 && height > 0 ? { top: y, left: x, width, height } : null)
      })
    })
  }, [])

  const value = useMemo<TourTargetsRegistry>(
    () => ({ registerTarget, unregisterTarget, measureTarget }),
    [registerTarget, unregisterTarget, measureTarget],
  )

  return <TourTargetsContext.Provider value={value}>{children}</TourTargetsContext.Provider>
}

/**
 * El registro, para el overlay. `null` fuera del provider — el overlay lo trata como «no hay ningún
 * target» y pinta el velo liso en vez de reventar: un tour sin hueco sigue enseñando y sigue
 * cerrándose.
 */
export function useTourTargets(): TourTargetsRegistry | null {
  return useContext(TourTargetsContext)
}

/**
 * Ref callback para colgar un target de una vista que YA existe, sin envolverla:
 * `<Pressable ref={useTourTarget('metas')} collapsable={false} …>`.
 *
 * Se usa cuando el elemento a iluminar es un control concreto de la superficie. Cuando lo que hay
 * que iluminar es un bloque entero (la mini-cinta, una franja), es más limpio `<TourTarget>`.
 *
 * ⚠️ Quien use este hook DEBE poner también `collapsable={false}` en la vista (ver nota de arriba).
 * `TourTarget` ya lo trae.
 */
export function useTourTarget(name: string | null): (node: View | null) => void {
  const registry = useContext(TourTargetsContext)
  const lastNodeRef = useRef<View | null>(null)

  return useCallback(
    (node: View | null) => {
      if (name === null) return
      if (node) {
        lastNodeRef.current = node
        registry?.registerTarget(name, node)
        return
      }
      registry?.unregisterTarget(name, lastNodeRef.current)
      lastNodeRef.current = null
      // Sin `return` de una función: en React 19 devolver algo convierte el callback en su propio
      // cleanup y el `null` de desmonte deja de llegar (y el registro quedaría con un nodo muerto).
    },
    [name, registry],
  )
}

/**
 * Envoltorio que registra un bloque como target. La `View` que agrega es de flujo (sin estilos
 * propios salvo los que se le pasen), así que en una columna —que es donde se usa— hereda el hueco
 * del `gap` del padre y el hijo conserva su caja: cero cambio de layout.
 */
export function TourTarget({
  name,
  className,
  onLayout,
  children,
}: {
  /**
   * `null` = esta instancia NO participa del tour, pero la envoltura se mantiene.
   *
   * Es para los bloques que se repiten (las franjas del día, las filas del roster) donde solo la
   * PRIMERA es target: si el envoltorio apareciera y desapareciera según el índice, una franja
   * tendría un nivel de vista más que las otras. Con `null` todas se pintan idénticas y la única
   * diferencia es el registro, que no se ve.
   */
  name: string | null
  /** Clases NativeWind opcionales (estáticas). Normalmente no hace falta ninguna. */
  className?: string
  /** La superficie a veces necesita el alto del bloque (p. ej. para no tapar la PublishBar). */
  onLayout?: ViewProps['onLayout']
  children: ReactNode
}) {
  const ref = useTourTarget(name)
  return (
    <View ref={ref} collapsable={false} className={className} onLayout={onLayout}>
      {children}
    </View>
  )
}
