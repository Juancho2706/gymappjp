import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ModuleKey } from '@/services/entitlements.service'
import { ModuleOffNotice } from './ModuleOffNotice'

/**
 * W4.2 (Ola de orden) — el aviso de módulo APAGADO por el OPERADOR (kill-switch
 * `EVA_DISABLED_MODULES`) o por acceso inactivo. Ya NO es un gate de plan: no hay upsell, solo
 * copy de mantenimiento y una única salida (volver al inicio). Lo que se protege acá es ESE
 * contrato, no las palabras exactas de cada descripción (que puede volver a redactarse).
 */

const MODULE_KEYS: ModuleKey[] = ['cardio', 'movement_assessment', 'body_composition', 'nutrition_exchanges']

describe('ModuleOffNotice (W4.2)', () => {
    it('las 4 keys pintan un h1 que termina en "temporalmente no disponible" y el testid del aviso', () => {
        for (const moduleKey of MODULE_KEYS) {
            const { unmount } = render(<ModuleOffNotice moduleKey={moduleKey} />)

            expect(
                screen.getByRole('heading', { level: 1, name: /temporalmente no disponible$/ }),
            ).toBeInTheDocument()
            expect(screen.getByTestId('module-off-notice')).toBeInTheDocument()

            unmount()
        }
    })

    it('cardio: título LITERAL (red de regresión del copy exacto)', () => {
        render(<ModuleOffNotice moduleKey="cardio" />)

        expect(
            screen.getByRole('heading', { level: 1, name: 'Cardio temporalmente no disponible' }),
        ).toBeInTheDocument()
    })

    it('párrafo de mantenimiento presente', () => {
        render(<ModuleOffNotice moduleKey="cardio" />)

        // El <p> tiene un salto de línea en el JSX (texto envuelto en dos líneas), por eso el
        // match es parcial (regex) y no el string exacto del párrafo completo.
        expect(screen.getByText(/Estamos haciendo mantenimiento en esta función/)).toBeInTheDocument()
    })

    it('CTA único: "Volver al inicio" hacia /coach/dashboard, sin más links', () => {
        render(<ModuleOffNotice moduleKey="cardio" />)

        expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
            'href',
            '/coach/dashboard',
        )
        expect(screen.getAllByRole('link')).toHaveLength(1)
    })

    it('no hay gesto de venta: ni "ver planes", ni precio, ni link a suscripción', () => {
        // Ojo: NO se puede afirmar sobre /plan/i a secas — la descripción de nutrition_exchanges
        // dice «los planes híbridos con franjas». Lo que no debe aparecer es el VOCABULARIO de
        // venta ni el destino de upgrade, no la palabra «plan» suelta.
        for (const moduleKey of MODULE_KEYS) {
            const { container, unmount } = render(<ModuleOffNotice moduleKey={moduleKey} />)

            expect(container.textContent).not.toMatch(/ver planes|plan pago|precio|upgrade|suscrip|incluido/i)
            expect(container.querySelector('a[href="/coach/subscription"]')).toBeNull()

            unmount()
        }
    })
})
