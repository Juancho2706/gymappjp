'use client'

import { useSyncExternalStore } from 'react'

/**
 * Reemplazo hydration-safe del `useReducedMotion` de framer-motion (EVA-NEXTJS-18).
 *
 * El de framer (12.38) hace `useState(prefersReducedMotion.current)`: en SSR vale `null` y en el
 * PRIMER render de cliente lee el media query sincrono — con "Reducir movimiento" activado (comun
 * en iPhone) cada componente que bifurca su arbol con ese valor hidrata contra HTML distinto y
 * React descarta el arbol del server (hydration error en cada carga; visto en el dashboard del
 * alumno via replays).
 *
 * `useSyncExternalStore` es la via canonica: durante la hydration React usa `getServerSnapshot`
 * (false, igual que el HTML servido) y recien despues re-renderiza con el valor real — sin
 * mismatch. Costo asumido: para usuarios con reduce-motion, el primer frame puede arrancar una
 * animacion que se apaga al tiro; preferible a descartar el arbol entero en cada navegacion.
 *
 * Mismo nombre y contrato que el de framer a proposito: los call sites solo cambian el import.
 */

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
