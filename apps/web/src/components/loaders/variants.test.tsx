import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoaderVariantView } from './variants'

vi.mock('@/components/brand/ThemedLogo', () => ({
    ThemedLogo: ({ light, dark }: { light?: string; dark?: string }) => (
        <span data-testid="themed-logo" data-light={light} data-dark={dark} />
    ),
}))

const LOGO_VARIANTS = [
    'progreso',
    'anillo',
    'radar',
    'cometa',
    'orbitas',
] as const

describe('LoaderVariantView themed logo', () => {
    it.each(LOGO_VARIANTS)('%s propaga los logos light y dark', (variant) => {
        render(
            <LoaderVariantView
                variant={variant}
                iconSrc="/logo-light.svg"
                iconSrcDark="/logo-dark.svg"
            />,
        )

        const logo = screen.getByTestId('themed-logo')
        expect(logo).toHaveAttribute('data-light', '/logo-light.svg')
        expect(logo).toHaveAttribute('data-dark', '/logo-dark.svg')
    })

    it('ritmo no renderiza logo', () => {
        render(
            <LoaderVariantView
                variant="ritmo"
                iconSrc="/logo-light.svg"
                iconSrcDark="/logo-dark.svg"
            />,
        )

        expect(screen.queryByTestId('themed-logo')).not.toBeInTheDocument()
    })
})
