'use client'

/**
 * `useBrandPrimaryHex` (T3.v Cabina «Familia N») — el HEX REAL de la marca del coach para las
 * superficies que pintan un fondo de marca (`AddActionButton variant="primary"`).
 *
 * Por qué existe: el panel del coach NO tiene contexto de branding en cliente. El layout
 * (`app/coach/layout.tsx`) resuelve la marca server-side —enterprise → team → standalone Pro,
 * con el preset y el gate de entitlement ya aplicados— y la publica como CSS var literal
 * `--theme-primary` en `:root` (y otro valor en `.dark`). Ese hex ES la marca de esta pantalla:
 * es el mismo que alimenta `--primary`, la rampa `--sport-*` y el loader.
 *
 * Un `var(--theme-primary)` NO sirve como `brandColor`: `AddActionButton` necesita el hex para
 * calcular la tinta con `getContrastInfo` (WCAG). Pasarle la var lo haría caer al primary de EVA
 * y ahí aparece el bug que el owner pidió evitar: fondo amarillo de la marca + tinta blanca
 * calculada contra el azul de EVA = texto ilegible. Por eso se LEE el valor computado.
 *
 * Una sola lectura y un solo `MutationObserver` para toda la app (store de módulo +
 * `useSyncExternalStore`): el editor monta este hook en cada fila de alimento, y un observer por
 * fila sería un observer por alimento del plan. El observer existe para el toggle de tema: al
 * flipear la clase `dark` en `<html>`, `--theme-primary` cambia de valor y la tinta tiene que
 * recalcularse contra el fondo nuevo.
 *
 * SSR: `getServerSnapshot` devuelve `null` (en el servidor no hay `getComputedStyle`), así que el
 * HTML del servidor y la hidratación coinciden y el botón arranca con el primary de EVA hasta el
 * primer commit del cliente — el mismo criterio de `ThemeToggle` para no repetir EVA-NEXTJS-18.
 */

import { useSyncExternalStore } from 'react'

/** La var que escribe el layout del panel coach con el hex de la marca vigente. */
const BRAND_VAR = '--theme-primary'

let cache: string | null = null
let hydrated = false
let observer: MutationObserver | null = null
const listeners = new Set<() => void>()

function readBrandVar(): string | null {
  if (typeof document === 'undefined') return null
  const raw = getComputedStyle(document.documentElement).getPropertyValue(BRAND_VAR).trim()
  return raw === '' ? null : raw
}

function refresh(): void {
  const next = readBrandVar()
  if (next === cache) return
  cache = next
  for (const listener of listeners) listener()
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  if (observer === null && typeof document !== 'undefined') {
    // `class` cubre el toggle de tema (next-themes escribe `dark` en <html>); `style` cubre a
    // quien pinte la var inline sobre el propio <html>.
    observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
  }
  // El `<style>` del layout puede haber entrado DESPUÉS del primer snapshot (streaming del RSC):
  // se relee al suscribirse, que es justo después del primer commit.
  refresh()
  return () => {
    listeners.delete(onStoreChange)
    if (listeners.size === 0) {
      observer?.disconnect()
      observer = null
    }
  }
}

function getSnapshot(): string | null {
  if (!hydrated) {
    hydrated = true
    cache = readBrandVar()
  }
  return cache
}

function getServerSnapshot(): string | null {
  return null
}

/**
 * Hex de la marca del coach de esta pantalla, o `null` fuera del panel (harness, tests, o si el
 * layout no publicó la var). `null` deja que `AddActionButton` caiga a su default de EVA.
 */
export function useBrandPrimaryHex(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
