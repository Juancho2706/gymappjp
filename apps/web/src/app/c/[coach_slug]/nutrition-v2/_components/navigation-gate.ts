'use client'

import { useEffect } from 'react'

/**
 * Compuerta de navegación del área del alumno (QA T2.7 F4, hallazgo H9 — auditoría 2026-08-14).
 *
 * Por qué existe: TODA server action invocada desde el cliente se despacha al ActionQueue del
 * App Router (`callServer` → `ACTION_SERVER_ACTION`, `next/dist/client/app-call-server.js`).
 * Si una navegación (`ACTION_NAVIGATE` / back-forward) llega mientras esa acción está `pending`,
 * Next la DESCARTA (`app-router-instance.js`: `pending.discarded = true`) y una acción descartada
 * jamás resuelve la promesa que ya se entregó a React vía `setState(deferredPromise)` + `use()`:
 * el router queda suspendido para siempre y ningún click vuelve a navegar hasta recargar
 * (familia de bugs abiertos: vercel/next.js#86055 · #86151 · #45830; presente en 16.3.0).
 *
 * La compuerta evita el descarte en la raíz: mientras haya una server action en vuelo, los
 * clicks de navegación internos se DIFIEREN (preventDefault + destino recordado) y se despachan
 * apenas la cola queda vacía — el click del alumno siempre termina navegando, con una demora
 * máxima de la propia acción (~1-2 s). back/forward del navegador no es interceptable
 * (popstate): esa ventana residual queda documentada y se acepta mientras el bug upstream viva.
 *
 * Retirar esta compuerta cuando Next resuelva el descarte sin promesa huérfana.
 */

let inFlight = 0
let deferredHref: string | null = null
let navigateFn: ((href: string) => void) | null = null

function drain(): void {
  if (inFlight === 0 && deferredHref !== null && navigateFn !== null) {
    const href = deferredHref
    deferredHref = null
    navigateFn(href)
  }
}

/**
 * Envuelve una server action para que la compuerta sepa cuándo hay una en vuelo. El drain va en
 * un macrotask a propósito: la continuación del `await` del caller (que suele encadenar OTRA
 * action, p.ej. escritura → lectura de reconciliación) corre antes en microtasks y alcanza a
 * subir el contador — la navegación diferida recién sale cuando la cadena completa terminó.
 */
export function trackedAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    inFlight += 1
    try {
      return await action(...args)
    } finally {
      inFlight -= 1
      setTimeout(drain, 0)
    }
  }
}

/** Navegación programática (selector semanal): difiere igual que un click si hay acción en vuelo. */
export function gateNavigate(href: string, navigate: (href: string) => void): void {
  navigateFn = navigate
  if (inFlight > 0) {
    deferredHref = href
    return
  }
  navigate(href)
}

/**
 * Intercepta en CAPTURA los clicks a `<a>` internos del documento mientras la vista con
 * mutaciones esté montada (cubre tabs Hoy/Plan/Historial y el sidebar del área). Solo actúa con
 * una acción en vuelo; el resto de los clicks pasan intactos.
 */
export function useNavigationGate(navigate: (href: string) => void): void {
  useEffect(() => {
    navigateFn = navigate
    const onClickCapture = (event: MouseEvent) => {
      if (inFlight === 0) return
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as Element | null
      const anchor = target?.closest?.('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      // Solo navegación interna del mismo origen; lo demás (externos, descargas, _blank) sigue.
      if (!href.startsWith('/')) return
      const anchorTarget = anchor.getAttribute('target')
      if (anchorTarget && anchorTarget !== '_self') return
      if (anchor.hasAttribute('download')) return
      event.preventDefault()
      deferredHref = href
    }
    document.addEventListener('click', onClickCapture, true)
    return () => {
      document.removeEventListener('click', onClickCapture, true)
      navigateFn = null
      deferredHref = null
    }
  }, [navigate])
}
