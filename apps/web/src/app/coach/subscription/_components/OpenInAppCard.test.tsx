import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { OpenInAppCard } from './OpenInAppCard'

/**
 * W6.7 del embudo Free→Pro. El coach paga en la web; su app sigue creyendo el plan viejo hasta que
 * revalida. Esta tarjeta es el puente web→app, y lo que no puede derivar es:
 *   1. la instrucción de rescate — el coach tiene que saber que el botón se llama «Actualizar
 *      estado» y vive en Mi plan;
 *   2. la AUSENCIA de link. `/coach/subscription` todavía no está cubierta por el universal link /
 *      app link (el `intentFilter` exige binario nuevo y el AASA tarda en propagar), así que un
 *      botón «Abrir EVA en el teléfono» abriría el navegador en la misma página: una promesa que el
 *      sistema operativo no cumple. Cuando el binario y el AASA estén, el botón vuelve — y este
 *      test se actualiza en el mismo commit, no antes.
 * Se monta con `renderToStaticMarkup` porque el componente es presentacional puro (sin hooks ni
 * fetch): el render real cuesta menos que un guard de texto y prueba más.
 */
const MARKUP = renderToStaticMarkup(<OpenInAppCard />)

describe('OpenInAppCard — puente web→app tras el pago', () => {
    it('dice qué hacer, con el nombre exacto del botón de la app', () => {
        expect(MARKUP).toContain(
            '¿Usas la app? Abre EVA en el teléfono y toca «Actualizar estado» en Mi plan para ver el cambio.'
        )
    })

    it('no promete un salto a la app: sin link ni botón mientras la ruta no esté cubierta', () => {
        expect(MARKUP).not.toContain('<a ')
        expect(MARKUP).not.toContain('href=')
        expect(MARKUP).not.toContain('<button')
    })

    it('no habla de plata: es acuse de recibo, no una segunda venta', () => {
        expect(MARKUP).not.toMatch(/\$|\/mes|\bPro\b/)
    })
})

describe('SubscriptionContent solo la muestra tras un pago confirmado', () => {
    const SOURCE = readFileSync(join(__dirname, 'SubscriptionContent.tsx'), 'utf-8')

    it('se monta con el flag que enciende el retorno `?upgrade=success`', () => {
        expect(SOURCE).toContain('{justChangedPlan ? <OpenInAppCard /> : null}')
        expect(SOURCE).toContain('setJustChangedPlan(true)')
    })

    it('el flag nace apagado (abrir la pantalla sin venir del checkout no lo enciende)', () => {
        expect(SOURCE).toContain('const [justChangedPlan, setJustChangedPlan] = useState(false)')
    })
})
