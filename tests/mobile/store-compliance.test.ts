// Allowlist de destinos que la app puede abrir (embudo Free→Pro, W6 — ronda de revisión 21-08).
// El módulo bajo test es puro (no importa react-native/expo), así que corre con el runner del repo.
import { describe, expect, it } from 'vitest'
import { isStoreSafeUrl } from '../../apps/mobile/lib/store-compliance'

/**
 * El caso real: el `cta_url` de una novedad lo escribe el panel de ADMIN, no el código. Sin
 * allowlist, un link a `/pricing` publicado un martes convierte la app en superficie de pago
 * externa (Apple 3.1.1) sin release ni review de por medio. Por eso lo que no está previsto no se
 * abre — y estos casos son el contrato de qué está previsto.
 */
describe('store-compliance: destinos permitidos', () => {
  it('WhatsApp e Instagram (contacto del coach, nada transaccional)', () => {
    expect(isStoreSafeUrl('https://wa.me/56912345678')).toBe(true)
    expect(isStoreSafeUrl('https://wa.me/56912345678?text=hola')).toBe(true)
    expect(isStoreSafeUrl('https://instagram.com/eva.app')).toBe(true)
    expect(isStoreSafeUrl('https://www.instagram.com/eva.app/')).toBe(true)
  })

  it('mailto: es soporte, no pago — permitido en ambas tiendas', () => {
    expect(isStoreSafeUrl('mailto:contacto@eva-app.cl')).toBe(true)
    expect(isStoreSafeUrl('mailto:soporte@eva-app.cl?subject=Ayuda')).toBe(true)
    // Un `mailto:` sin destinatario no abre nada útil.
    expect(isStoreSafeUrl('mailto:')).toBe(false)
  })

  it('el sitio propio, en las rutas que NO son de venta', () => {
    expect(isStoreSafeUrl('https://www.eva-app.cl/legal')).toBe(true)
    expect(isStoreSafeUrl('https://eva-app.cl/blog/como-armar-un-plan')).toBe(true)
    expect(isStoreSafeUrl('https://www.eva-app.cl/')).toBe(true)
  })

  /**
   * «Vive tu app» desde la app (SPEC «Vive tu app» directo, V1.22): el link que emite
   * `/api/mobile/coach/vive-tu-app` gana `&src=rn&from=<guia|builder>` para que el banner de vuelta
   * sepa a qué pantalla devolver al coach. La allowlist mira el PATH, así que la query no lo saca
   * de la lista — y esto lo deja pinneado: si alguien endurece el parser mirando la URL cruda, el
   * botón «Ver mi app» de la guía se apagaría en silencio en todos los teléfonos.
   */
  it('el link de «Vive tu app» con su query de superficie y origen', () => {
    expect(isStoreSafeUrl('https://www.eva-app.cl/vive-tu-app?t=HASH&c=EVA123&src=rn&from=guia')).toBe(true)
    expect(isStoreSafeUrl('https://www.eva-app.cl/vive-tu-app?t=HASH&c=mi-marca&src=rn&from=builder')).toBe(true)
    // Sin query (el link de la web) es el mismo destino.
    expect(isStoreSafeUrl('https://www.eva-app.cl/vive-tu-app?t=HASH&c=EVA123')).toBe(true)
  })
})

describe('store-compliance: superficies de pago del sitio propio', () => {
  it.each([
    'https://www.eva-app.cl/pricing',
    'https://www.eva-app.cl/pricing/',
    'https://eva-app.cl/pricing?utm_source=app',
    'https://www.eva-app.cl/register',
    'https://www.eva-app.cl/register?plan=pro',
    'https://www.eva-app.cl/coach/subscription',
    'https://eva-app.cl/hecho-con-eva',
  ])('%s queda fuera', (url) => {
    expect(isStoreSafeUrl(url)).toBe(false)
  })

  it('el ancla del tarifario es la misma página de precios por otra puerta', () => {
    expect(isStoreSafeUrl('https://www.eva-app.cl/#precios')).toBe(false)
    expect(isStoreSafeUrl('https://www.eva-app.cl/inicio#precios')).toBe(false)
    expect(isStoreSafeUrl('https://www.eva-app.cl/inicio#PRECIOS')).toBe(false)
  })
})

describe('store-compliance: todo lo demás se rechaza (fail-closed)', () => {
  it('otros hosts, aunque parezcan nuestros', () => {
    expect(isStoreSafeUrl('https://eva-app.cl.evil.com/pricing')).toBe(false)
    expect(isStoreSafeUrl('https://evil.com/https://www.eva-app.cl')).toBe(false)
    expect(isStoreSafeUrl('https://sub.eva-app.cl/legal')).toBe(false)
    expect(isStoreSafeUrl('https://wa.me.evil.com/1')).toBe(false)
  })

  it('esquemas que no son https ni mailto', () => {
    expect(isStoreSafeUrl('http://www.eva-app.cl/legal')).toBe(false)
    expect(isStoreSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isStoreSafeUrl('eva://coach/subscription')).toBe(false)
    expect(isStoreSafeUrl('itms-apps://apps.apple.com/app/id123')).toBe(false)
  })

  it('credenciales o puerto en el host', () => {
    expect(isStoreSafeUrl('https://user@www.eva-app.cl/legal')).toBe(false)
    expect(isStoreSafeUrl('https://www.eva-app.cl:8443/legal')).toBe(false)
  })

  it('basura y vacíos', () => {
    expect(isStoreSafeUrl('')).toBe(false)
    expect(isStoreSafeUrl('   ')).toBe(false)
    expect(isStoreSafeUrl('www.eva-app.cl/legal')).toBe(false)
    expect(isStoreSafeUrl(undefined as unknown as string)).toBe(false)
    expect(isStoreSafeUrl(null as unknown as string)).toBe(false)
  })
})
